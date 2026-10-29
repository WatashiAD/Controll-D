/* Linux virtual gamepad — Xbox 360 class device via uinput (shared uinput.mjs).
 *
 * Also polls force-feedback (rumble) effects uploaded by games and forwards
 * them through a callback so the phone can vibrate.
 */

import { UinputDevice, UinputError, EV_KEY, EV_ABS, EV_UINPUT } from "./uinput.mjs";
import fs from "node:fs";
import koffi from "koffi";

/* Logical button name -> evdev key code */
export const BUTTONS = {
  BTN_SOUTH: 0x130, // A (South, SDL b0)
  BTN_EAST: 0x131, // B (East, SDL b1)
  BTN_NORTH: 0x133, // X (West, evdev BTN_X / SDL b2)
  BTN_WEST: 0x134, // Y (North, evdev BTN_Y / SDL b3)
  BTN_TL: 0x136, // Left bumper (LB / L)
  BTN_TR: 0x137, // Right bumper (RB / R)
  BTN_TL2: 0x138, // Left trigger (LT / ZL)
  BTN_TR2: 0x139, // Right trigger (RT / ZR)
  BTN_SELECT: 0x13a, // Back / View / −
  BTN_START: 0x13b, // Start / Menu / +
  BTN_MODE: 0x13c, // Guide / Home
  BTN_THUMBL: 0x13d, // Left stick click (L3)
  BTN_THUMBR: 0x13e, // Right stick click (R3)
};

/* Logical axis name -> [evdev abs code, kind]
 *   "signed":  -1..1 -> -32768..32767 (sticks)
 *   "trigger":  0..1 -> 0..255       (analog triggers)
 *   "hat":     -1..1 -> -1..1        (d-pad) */
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

const FF_RUMBLE = 0x50;
const FF_GAIN = 0x60;
const FF_MAX = 16;
const UI_FF_UPLOAD = 1;
const UI_FF_ERASE = 2;
const iowr = (nr, size) => 3 * 2 ** 30 + size * 2 ** 16 + 0x55 * 2 ** 8 + nr;
const iow = (nr, size) => 1 * 2 ** 30 + size * 2 ** 16 + 0x55 * 2 ** 8 + nr;
const ior = (nr, size) => 2 * 2 ** 30 + size * 2 ** 16 + 0x55 * 2 ** 8 + nr;
const UI_BEGIN_FF_UPLOAD = iowr(200, 104);
const UI_END_FF_UPLOAD = iow(201, 104);
const UI_BEGIN_FF_ERASE = iowr(202, 12);
const UI_END_FF_ERASE = iow(203, 12);

export class GamepadError extends UinputError {}

function absInfos() {
  const signed = () => ({ min: -32768, max: 32767, fuzz: 16, flat: 128 });
  const trigger = () => ({ min: 0, max: 255, fuzz: 0, flat: 0 });
  const hat = () => ({ min: -1, max: 1, fuzz: 0, flat: 0 });
  return [
    { code: AXES.ABS_X[0], ...signed() },
    { code: AXES.ABS_Y[0], ...signed() },
    { code: AXES.ABS_RX[0], ...signed() },
    { code: AXES.ABS_RY[0], ...signed() },
    { code: AXES.ABS_Z[0], ...trigger() },
    { code: AXES.ABS_RZ[0], ...trigger() },
    { code: AXES.ABS_HAT0X[0], ...hat() },
    { code: AXES.ABS_HAT0Y[0], ...hat() },
  ];
}

export class VirtualGamepad extends UinputDevice {
  constructor(name = "Controll-D Virtual Gamepad") {
    /* Xbox 360 controller omits BTN_TL2/BTN_TR2 keybits so BTN_SELECT maps to
     * joydev button 6 (SDL 'back'), matching SDL_GameControllerDB. */
    const keyCodes = Object.values(BUTTONS).filter(
      (c) => c !== BUTTONS.BTN_TL2 && c !== BUTTONS.BTN_TR2,
    );
    super(name, {
      vid: 0x045e,
      pid: 0x028e,
      version: 0x0110,
      keys: keyCodes,
      abs: absInfos(),
      ff: [FF_RUMBLE, FF_GAIN],
    });
    this.btnState = new Map();
    this.absState = new Map();
    this.effects = new Map();
    this.gain = 0xffff;
    this.pollTimer = null;
  }

  /* ------------------------------------------------------------------ input */

  setButton(codeName, value) {
    /* Digital triggers map to Xbox 360 analog trigger axes */
    if (codeName === "BTN_TL2") return this.setAxis("ABS_Z", value ? 1.0 : 0.0);
    if (codeName === "BTN_TR2") return this.setAxis("ABS_RZ", value ? 1.0 : 0.0);
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
      if (callback) {
        void Promise.resolve().then(() =>
          callback(Math.trunc(strong * gain), Math.trunc(weak * gain), Math.max(length, 40)),
        );
      }
    }
  }

  close() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (!this.closed) {
      try {
        if (this.fd >= 0) {
          try {
            this.reset();
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    }
    super.close();
  }

  destroy() {
    this.close();
  }
}
