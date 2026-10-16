/* Linux virtual gamepad backed by uinput (via koffi FFI, no build step).
 *
 * Also polls force-feedback (rumble) effects uploaded by games and forwards
 * them through a callback so the phone can vibrate.
 */

import fs from "node:fs";
import koffi from "koffi";

/* Logical button name -> evdev key code */
export const BUTTONS = {
  BTN_SOUTH: 0x130, // A / Cross (South, SDL b0)
  BTN_EAST: 0x131, // B / Circle (East, SDL b1)
  BTN_NORTH: 0x133, // X / Square (West, evdev BTN_X / SDL b2)
  BTN_WEST: 0x134, // Y / Triangle (North, evdev BTN_Y / SDL b3)
  BTN_TL: 0x136, // Left bumper (LB / L1 / L)
  BTN_TR: 0x137, // Right bumper (RB / R1 / R)
  BTN_TL2: 0x138, // Left trigger (LT / L2 / ZL)
  BTN_TR2: 0x139, // Right trigger (RT / R2 / ZR)
  BTN_SELECT: 0x13a, // Back / View / Share / −
  BTN_START: 0x13b, // Start / Menu / Options / +
  BTN_MODE: 0x13c, // Guide / Home / PS
  BTN_THUMBL: 0x13d, // Left stick click (L3)
  BTN_THUMBR: 0x13e, // Right stick click (R3)
};

/* Logical axis name -> [evdev abs code, kind]
 *   "signed": -1..1  -> -32768..32767   (sticks)
 *   "trigger": 0..1  -> 0..255          (analog triggers)
 *   "hat":    -1..1  -> -1..1           (d-pad) */
export const AXES = {
  ABS_X: [0x00, "signed"],
  ABS_Y: [0x01, "signed"],
  ABS_RX: [0x03, "signed"],
  ABS_RY: [0x04, "signed"],
  ABS_Z: [0x02, "trigger"],
  ABS_RZ: [0x05, "trigger"],
  ABS_HAT0X: [0x10, "hat"],
  ABS_HAT0Y: [0x11, "hat"],
};

const EV_SYN = 0x00;
const EV_KEY = 0x01;
const EV_ABS = 0x03;
const EV_FF = 0x15;
const EV_UINPUT = 0x101;
const SYN_REPORT = 0;
const FF_RUMBLE = 0x50;
const FF_GAIN = 0x60;
const UI_FF_UPLOAD = 1;
const UI_FF_ERASE = 2;
const BUS_USB = 0x03;

/* ioctl request encoding (avoids 32-bit overflow of bit-shifts) */
const ior = (nr, size) => 2 * 2 ** 30 + size * 2 ** 16 + 0x55 * 2 ** 8 + nr;
const iow = (nr, size) => 1 * 2 ** 30 + size * 2 ** 16 + 0x55 * 2 ** 8 + nr;
const iowr = (nr, size) => 3 * 2 ** 30 + size * 2 ** 16 + 0x55 * 2 ** 8 + nr;
const io = (nr) => 0x55 * 2 ** 8 + nr;

const UI_SET_EVBIT = iow(100, 4);
const UI_SET_KEYBIT = iow(101, 4);
const UI_SET_ABSBIT = iow(103, 4);
const UI_SET_FFBIT = iow(107, 4);
const UI_DEV_SETUP = iow(3, 92);
const UI_ABS_SETUP = iow(4, 28);
const UI_DEV_CREATE = io(1);
const UI_DEV_DESTROY = io(2);
/* struct ff_effect is 48 bytes on 64-bit (union is 34, not 24);
 * uinput_ff_upload is therefore 8 + 48 * 2 = 104. Verified with gcc. */
const UI_BEGIN_FF_UPLOAD = iowr(200, 104);
const UI_END_FF_UPLOAD = iow(201, 104);
const UI_BEGIN_FF_ERASE = iowr(202, 12);
const UI_END_FF_ERASE = iow(203, 12);
const UI_GET_SYSNAME = (len) => ior(44, len);

const O_RDWR = 2;
const O_NONBLOCK = 2048;
const FF_MAX = 16;

function absInfos() {
  const signed = () => ({ min: -32768, max: 32767, fuzz: 16, flat: 128 });
  const trigger = () => ({ min: 0, max: 255, fuzz: 0, flat: 0 });
  const hat = () => ({ min: -1, max: 1, fuzz: 0, flat: 0 });
  return [
    [AXES.ABS_X[0], signed()],
    [AXES.ABS_Y[0], signed()],
    [AXES.ABS_RX[0], signed()],
    [AXES.ABS_RY[0], signed()],
    [AXES.ABS_Z[0], trigger()],
    [AXES.ABS_RZ[0], trigger()],
    [AXES.ABS_HAT0X[0], hat()],
    [AXES.ABS_HAT0Y[0], hat()],
  ];
}

export class GamepadError extends Error {}

export class VirtualGamepad {
  constructor(name = "Controll-D Virtual Gamepad") {
    this.name = name;
    this.fd = -1;
    this.btnState = new Map();
    this.absState = new Map();
    this.effects = new Map();
    this.gain = 0xffff;
    this.closed = false;
    this.pollTimer = null;

    if (process.platform !== "linux") {
      throw new GamepadError(
        `Native virtual gamepad currently requires Linux (/dev/uinput). ` +
        (process.platform === "win32"
          ? "On Windows, install ViGEmBus: winget install Nefarius.ViGEmBus"
          : "On macOS, virtual HID requires DriverKit system extensions.")
      );
    }

    let libc;
    try {
      libc = koffi.load("libc.so.6");
    } catch (err) {
      throw new GamepadError(`Cannot load libc for uinput FFI: ${err.message}`);
    }
    this.libc = libc;
    this.cOpen = libc.func("int open(char *path, int flags)");
    this.cClose = libc.func("int close(int fd)");
    this.cIoctl = libc.func("int ioctl(int fd, ulong request, uintptr arg)");

    const fd = this.cOpen("/dev/uinput", O_RDWR | O_NONBLOCK);
    if (fd < 0) {
      throw new GamepadError(
        "Cannot open /dev/uinput. Add your user to the 'input' group " +
          "(sudo usermod -aG input $USER) or run with appropriate permissions.",
      );
    }
    this.fd = fd;

    try {
      this.ioctlVal(UI_SET_EVBIT, EV_KEY);
      this.ioctlVal(UI_SET_EVBIT, EV_ABS);
      this.ioctlVal(UI_SET_EVBIT, EV_FF);
      /* Xbox 360 controller uses ABS_Z/ABS_RZ for triggers and omits BTN_TL2/BTN_TR2 keybits
       * so BTN_SELECT maps to joydev button 6 (SDL 'back'), matching SDL_GameControllerDB. */
      for (const [name, code] of Object.entries(BUTTONS)) {
        if (name !== "BTN_TL2" && name !== "BTN_TR2") {
          this.ioctlVal(UI_SET_KEYBIT, code);
        }
      }
      for (const [code] of Object.values(AXES)) this.ioctlVal(UI_SET_ABSBIT, code);
      this.ioctlVal(UI_SET_FFBIT, FF_RUMBLE);
      this.ioctlVal(UI_SET_FFBIT, FF_GAIN);

      /* Device identity */
      const setup = Buffer.alloc(92);
      setup.writeUInt16LE(BUS_USB, 0);
      setup.writeUInt16LE(0x045e, 2);
      setup.writeUInt16LE(0x028e, 4);
      setup.writeUInt16LE(0x0110, 6);
      setup.write(name.slice(0, 79), 8, "utf-8");
      setup.writeUInt32LE(FF_MAX, 88);
      this.ioctlBuf(UI_DEV_SETUP, setup);

      /* Axis ranges */
      for (const [code, info] of absInfos()) {
        const abs = Buffer.alloc(28);
        abs.writeUInt16LE(code, 0);
        abs.writeInt32LE(0, 4); // value
        abs.writeInt32LE(info.min, 8);
        abs.writeInt32LE(info.max, 12);
        abs.writeInt32LE(info.fuzz, 16);
        abs.writeInt32LE(info.flat, 20);
        abs.writeInt32LE(0, 24); // resolution
        this.ioctlBuf(UI_ABS_SETUP, abs);
      }

      this.ioctlVal(UI_DEV_CREATE, 0);
    } catch (err) {
      this.destroy();
      throw new GamepadError(`Failed to create virtual gamepad: ${err.message}`);
    }
  }

  /* uinput's UI_SET_*BIT ioctls take the code by value, not by pointer. */
  ioctlVal(req, value) {
    const ret = this.cIoctl(this.fd, req, value);
    if (ret < 0) throw new Error(`ioctl ${req.toString(16)} failed errno=${koffi.errno()}`);
  }

  ioctlBuf(req, buf) {
    const ret = this.cIoctl(this.fd, req, koffi.address(buf));
    if (ret < 0) throw new Error(`ioctl ${req.toString(16)} failed errno=${koffi.errno()}`);
  }

  /* ------------------------------------------------------------------ input */

  emit(type, code, value) {
    const ev = Buffer.alloc(24);
    const ms = Date.now();
    ev.writeBigInt64LE(BigInt(Math.floor(ms / 1000)), 0);
    ev.writeBigInt64LE(BigInt((ms % 1000) * 1000), 8);
    ev.writeUInt16LE(type, 16);
    ev.writeUInt16LE(code, 18);
    ev.writeInt32LE(value, 20);
    fs.writeSync(this.fd, ev);
  }

  setButton(codeName, value) {
    /* Digital triggers map directly to Xbox 360 analog trigger axes (ABS_Z / ABS_RZ) */
    if (codeName === "BTN_TL2") {
      return this.setAxis("ABS_Z", value ? 1.0 : 0.0);
    }
    if (codeName === "BTN_TR2") {
      return this.setAxis("ABS_RZ", value ? 1.0 : 0.0);
    }
    const ecode = BUTTONS[codeName];
    if (ecode === undefined) return false;
    const v = value ? 1 : 0;
    if (this.btnState.get(ecode) === v) return true;
    this.btnState.set(ecode, v);
    this.emit(EV_KEY, ecode, v);
    return true;
  }

  setAxis(codeName, value) {
    const entry = AXES[codeName];
    if (!entry) return false;
    const [ecode, kind] = entry;
    let raw;
    if (kind === "signed") {
      raw = Math.round(Math.max(-1.0, Math.min(1.0, value)) * 32767);
    } else if (kind === "trigger") {
      raw = Math.round(Math.max(0.0, Math.min(1.0, value)) * 255);
    } else {
      const v = Math.max(-1.0, Math.min(1.0, value));
      raw = Math.abs(v) < 0.5 ? 0 : v > 0 ? 1 : -1;
    }
    if (this.absState.get(ecode) === raw) return true;
    this.absState.set(ecode, raw);
    this.emit(EV_ABS, ecode, raw);
    return true;
  }

  syn() {
    if (!this.closed) this.emit(EV_SYN, SYN_REPORT, 0);
  }

  /* Release everything back to neutral. */
  reset() {
    for (const [ecode, value] of this.btnState) {
      if (value) {
        this.emit(EV_KEY, ecode, 0);
        this.btnState.set(ecode, 0);
      }
    }
    for (const [ecode, value] of this.absState) {
      if (value !== 0) {
        this.emit(EV_ABS, ecode, 0);
        this.absState.set(ecode, 0);
      }
    }
    this.syn();
  }

  /* ------------------------------------------------------------ force feedback */

  /* Watch for FF upload/play events from games; forward rumble. */
  startRumbleWatcher(callback) {
    if (this.pollTimer) return;
    const buf = Buffer.alloc(24 * 64);
    this.pollTimer = setInterval(() => {
      if (this.closed) return;
      try {
        for (;;) {
          let n;
          try {
            n = fs.readSync(this.fd, buf, 0, buf.length, null);
          } catch (err) {
            if (err.code === "EAGAIN" || err.code === "EWOULDBLOCK") break;
            return;
          }
          if (!n) break;
          for (let off = 0; off + 24 <= n; off += 24) {
            this.handleFfEvent(buf, off, callback);
          }
          if (n < buf.length) break;
        }
      } catch {
        /* transient read failure — retry next tick */
      }
    }, 25);
    if (this.pollTimer.unref) this.pollTimer.unref();
  }

  handleFfEvent(buf, off, callback) {
    const type = buf.readUInt16LE(off + 16);
    const code = buf.readUInt16LE(off + 18);
    const value = buf.readInt32LE(off + 20);
    if (type === EV_UINPUT && code === UI_FF_UPLOAD) {
      const up = Buffer.alloc(104);
      up.writeUInt32LE(value, 0); // request_id
      up.writeInt32LE(0, 4); // retval
      this.ioctlBuf(UI_BEGIN_FF_UPLOAD, up);
      try {
        if (up.readUInt16LE(8) === FF_RUMBLE) {
          const strong = up.readUInt16LE(8 + 14);
          const weak = up.readUInt16LE(8 + 16);
          const length = up.readUInt16LE(8 + 10);
          this.effects.set(up.readInt16LE(8 + 2), [strong, weak, length]);
        }
        up.writeInt32LE(0, 4);
      } finally {
        this.ioctlBuf(UI_END_FF_UPLOAD, up);
      }
    } else if (type === EV_UINPUT && code === UI_FF_ERASE) {
      const er = Buffer.alloc(12);
      er.writeUInt32LE(value, 0);
      er.writeInt32LE(0, 4);
      this.ioctlBuf(UI_BEGIN_FF_ERASE, er);
      try {
        this.effects.delete(er.readUInt32LE(8));
        er.writeInt32LE(0, 4);
      } finally {
        this.ioctlBuf(UI_END_FF_ERASE, er);
      }
    } else if (type === EV_FF) {
      if (code === FF_GAIN) {
        this.gain = value;
        return;
      }
      if (value <= 0) return;
      const eff = this.effects.get(code);
      if (!eff) return;
      const [strong, weak, length] = eff;
      if (strong <= 0 && weak <= 0) return;
      const gain = this.gain / 0xffff;
      const cb = callback;
      if (cb) {
        void Promise.resolve().then(() =>
          cb(Math.trunc(strong * gain), Math.trunc(weak * gain), Math.max(length, 40)),
        );
      }
    }
  }

  /* ------------------------------------------------------------------ close */

  destroy() {
    this.close();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    try {
      if (this.fd >= 0) {
        try {
          this.reset();
        } catch {
          /* ignore */
        }
        try {
          this.ioctlVal(UI_DEV_DESTROY, 0);
        } catch {
          /* ignore */
        }
        this.cClose(this.fd);
        this.fd = -1;
      }
    } catch {
      /* ignore */
    }
  }
}
