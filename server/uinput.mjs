/* Shared uinput plumbing (koffi FFI to libc, no build step).
 *
 * One libc load per process; each virtual device opens /dev/uinput,
 * claims the event bits it needs, sets up identity, then emits evdev structs.
 */

import fs from "node:fs";
import koffi from "koffi";

export const EV_SYN = 0x00;
export const EV_KEY = 0x01;
export const EV_REL = 0x02;
export const EV_ABS = 0x03;
export const EV_FF = 0x15;
export const EV_UINPUT = 0x101;
export const SYN_REPORT = 0;
export const BUS_USB = 0x03;

/* ioctl request encoding (avoids 32-bit overflow of bit-shifts) */
const ior = (nr, size) => 2 * 2 ** 30 + size * 2 ** 16 + 0x55 * 2 ** 8 + nr;
const iow = (nr, size) => 1 * 2 ** 30 + size * 2 ** 16 + 0x55 * 2 ** 8 + nr;
const iowr = (nr, size) => 3 * 2 ** 30 + size * 2 ** 16 + 0x55 * 2 ** 8 + nr;
const io = (nr) => 0x55 * 2 ** 8 + nr;

export const UI_SET_EVBIT = iow(100, 4);
export const UI_SET_KEYBIT = iow(101, 4);
export const UI_SET_RELBIT = iow(102, 4);
export const UI_SET_ABSBIT = iow(103, 4);
export const UI_SET_FFBIT = iow(107, 4);
export const UI_DEV_SETUP = iow(3, 92);
export const UI_ABS_SETUP = iow(4, 28);
export const UI_DEV_CREATE = io(1);
export const UI_DEV_DESTROY = io(2);
/* struct ff_effect is 48 bytes on 64-bit (union is 34, not 24 — verified with gcc);
 * FF upload/erase ioctls live in gamepad.mjs alongside the FF poll loop. */

const O_RDWR = 2;
const O_NONBLOCK = 2048;

export class UinputError extends Error {}

/* libc func handles are process-wide; build them once. */
let LIB = null;
function libc() {
  if (LIB) return LIB;
  let l;
  try {
    l = koffi.load("libc.so.6");
  } catch (err) {
    throw new UinputError(`Cannot load libc for uinput FFI: ${err.message}`);
  }
  LIB = {
    open: l.func("int open(char *path, int flags)"),
    close: l.func("int close(int fd)"),
    ioctl: l.func("int ioctl(int fd, ulong request, uintptr arg)"),
  };
  return LIB;
}

/* struct input_event is 24 bytes on 64-bit Linux {time(16), type(2), code(2), value(4)}. */
const EV_LEN = 24;

/* Describe the device once — bits are claimed in the proven order:
 *   EV/key/rel/abs/ff bits -> UI_DEV_SETUP -> UI_ABS_SETUP -> UI_DEV_CREATE. */
export class UinputDevice {
  constructor(name, {
    vid = 0x1234,
    pid = 0x5678,
    version = 0x0110,
    keys = [],   // [evdev key codes]
    rels = [],   // [evdev rel codes]
    abs = [],    // [{code, min, max, fuzz, flat}]
    ff = [],     // [ff codes] (implies EV_FF)
  } = {}) {
    this.name = name;
    this.fd = -1;
    this.closed = false;
    this._evBuf = Buffer.alloc(EV_LEN);
    this._libc = libc();

    if (process.platform !== "linux") {
      throw new UinputError(
        `Virtual ${name} currently requires Linux (/dev/uinput).`,
      );
    }

    const fd = this._libc.open("/dev/uinput", O_RDWR | O_NONBLOCK);
    if (fd < 0) {
      throw new UinputError(
        "Cannot open /dev/uinput. Add your user to the 'input' group " +
          "(sudo usermod -aG input $USER) or run with appropriate permissions.",
      );
    }
    this.fd = fd;

    try {
      this.ioctlVal(UI_SET_EVBIT, EV_KEY);
      if (ff.length) this.ioctlVal(UI_SET_EVBIT, EV_FF);
      if (abs.length) this.ioctlVal(UI_SET_EVBIT, EV_ABS);
      if (rels.length) {
        this.ioctlVal(UI_SET_EVBIT, EV_REL);
        for (const c of rels) this.ioctlVal(UI_SET_RELBIT, c);
      }
      for (const c of keys) this.ioctlVal(UI_SET_KEYBIT, c);
      for (const c of ff) this.ioctlVal(UI_SET_FFBIT, c);

      const setup = Buffer.alloc(92);
      setup.writeUInt16LE(BUS_USB, 0);
      setup.writeUInt16LE(vid, 2);
      setup.writeUInt16LE(pid, 4);
      setup.writeUInt16LE(version, 6);
      setup.write(name.slice(0, 79), 8, "utf-8");
      /* ff_max_effect must be >0 when EV_FF is claimed, else DEV_CREATE EINVALs */
      setup.writeUInt32LE(ff.length ? 16 : 0, 88);
      this.ioctlBuf(UI_DEV_SETUP, setup);

      for (const a of abs) {
        this.ioctlVal(UI_SET_ABSBIT, a.code);
        const info = Buffer.alloc(28);
        info.writeUInt16LE(a.code, 0);
        info.writeInt32LE(0, 4); // value
        info.writeInt32LE(a.min ?? 0, 8);
        info.writeInt32LE(a.max ?? 0, 12);
        info.writeInt32LE(a.fuzz ?? 0, 16);
        info.writeInt32LE(a.flat ?? 0, 20);
        info.writeInt32LE(0, 24); // resolution
        this.ioctlBuf(UI_ABS_SETUP, info);
      }

      this.ioctlVal(UI_DEV_CREATE, 0);
    } catch (err) {
      this.close();
      throw new UinputError(`Failed to create virtual ${name}: ${err.message}`);
    }
  }

  /* uinput's UI_SET_*BIT ioctls take the code by value, not by pointer. */
  ioctlVal(req, value) {
    const ret = this._libc.ioctl(this.fd, req, value);
    if (ret < 0) {
      throw new UinputError(`ioctl ${req.toString(16)} failed errno=${koffi.errno()}`);
    }
  }

  ioctlBuf(req, buf) {
    const ret = this._libc.ioctl(this.fd, req, koffi.address(buf));
    if (ret < 0) {
      throw new UinputError(`ioctl ${req.toString(16)} failed errno=${koffi.errno()}`);
    }
  }

  /* ----------------------------------------------------------------- emit */

  emit(type, code, value) {
    if (this.closed) return;
    const ev = this._evBuf;
    const ms = Date.now();
    ev.writeBigInt64LE(BigInt(Math.floor(ms / 1000)), 0);
    ev.writeBigInt64LE(BigInt((ms % 1000) * 1000), 8);
    ev.writeUInt16LE(type, 16);
    ev.writeUInt16LE(code, 18);
    ev.writeInt32LE(value, 20);
    try {
      fs.writeSync(this.fd, ev);
    } catch {
      /* transient EAGAIN on the non-blocking fd — a later SYN covers it */
    }
  }

  syn() {
    if (!this.closed) this.emit(EV_SYN, SYN_REPORT, 0);
  }

  /* ---------------------------------------------------------------- close */

  destroy() {
    this.close();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      if (this.fd >= 0) {
        try {
          this.ioctlVal(UI_DEV_DESTROY, 0);
        } catch {
          /* ignore */
        }
        this._libc.close(this.fd);
        this.fd = -1;
      }
    } catch {
      /* ignore */
    }
  }
}
