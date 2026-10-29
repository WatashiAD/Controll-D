/* Windows keyboard + mouse via user32.SendInput (koffi FFI, no build step).
 *
 * All coordinates/deltas arrive as raw pixels; SendInput handles the rest.
 * Key translation uses the Windows virtual-key codes from keys.mjs.
 */

import koffi from "koffi";
import { KEYS, MOUSE_BUTTONS } from "./keys.mjs";

/* INPUT struct (64-bit): { type(4), pad(4), union{ MOUSEINPUT(32) } } = 40 bytes */
const INPUT_SIZE = 40;
const INPUT_KEYBOARD = 1;
const INPUT_MOUSE = 0;
const KEYEVENTF_KEYUP = 0x0002;

const MOUSEEVENTF_MOVE = 0x0001;
const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const MOUSEEVENTF_MIDDLEUP = 0x0040;
const MOUSEEVENTF_WHEEL = 0x0800;
const MOUSEEVENTF_HWHEEL = 0x1000;
const WHEEL_DELTA = 120;

let user32 = null;
function lib() {
  if (user32) return user32;
  user32 = koffi.load("user32.dll");
  user32.func("int SendInput(uint cInputs, void *pInputs, int cbSize)");
  return user32;
}

/* Down/up key press → keyboard INPUT. INPUT layout offsets are written by hand:
 *   wVk @8 (u16), wScan @10 (u16), dwFlags @12 (u32), time @16 (u32), pad @20,
 *   dwExtraInfo @24 (uptr, keep 0). */
const KB_DOWN = Buffer.alloc(INPUT_SIZE);
KB_DOWN.writeUInt32LE(INPUT_KEYBOARD, 0);
const KB_UP = Buffer.alloc(INPUT_SIZE);
KB_UP.writeUInt32LE(INPUT_KEYBOARD, 0);
KB_UP.writeUInt32LE(KEYEVENTF_KEYUP, 12);

/* Mouse INPUT: dx @8 (i32), dy @12 (i32), mouseData @16 (i32),
 *   dwFlags @20 (u32), extra @24 (uptr). */
const MO_IN = Buffer.alloc(INPUT_SIZE);
MO_IN.writeUInt32LE(INPUT_MOUSE, 0);

export class WinKeyboard {
  constructor() {
    lib();
    this.latched = new Set();
  }

  key(name, value) {
    const entry = KEYS[name];
    if (!entry) return false;
    const v = value ? 1 : 0;
    if (this.latched.has(name) === !!v) return true;
    if (v) this.latched.add(name);
    else this.latched.delete(name);
    KB_DOWN.writeUInt16LE(entry.v, 8);
    KB_UP.writeUInt16LE(entry.v, 8);
    send(v ? KB_DOWN : KB_UP);
    return true;
  }

  reset() {
    for (const name of this.latched) {
      const entry = KEYS[name];
      if (entry) {
        KB_UP.writeUInt16LE(entry.v, 8);
        send(KB_UP);
      }
    }
    this.latched.clear();
  }

  syn() {
    /* SendInput flushes per call; syn is a no-op for parity with uinput. */
  }
  close() {}
}

export class WinMouse {
  constructor() {
    lib();
    this.btnState = new Map();
    this.wheelAcc = { x: 0, y: 0 };
  }

  move(dx, dy) {
    if (!dx && !dy) return;
    MO_IN.writeUInt32LE(0, 12);
    MO_IN.writeInt32LE(dx, 8);
    MO_IN.writeInt32LE(dy, 12);
    MO_IN.writeUInt32LE(MOUSEEVENTF_MOVE, 20);
    send(MO_IN);
  }

  /* y>0 scrolls down ⇒ Windows wheel delta is negative for "down". */
  wheel(x, y) {
    this.wheelAcc.x += x * WHEEL_DELTA;
    this.wheelAcc.y += -y * WHEEL_DELTA;
    const ax = Math.trunc(this.wheelAcc.x / WHEEL_DELTA);
    const ay = Math.trunc(this.wheelAcc.y / WHEEL_DELTA);
    if (ax) {
      this.wheelAcc.x -= ax * WHEEL_DELTA;
      this._wheelFlags(MOUSEEVENTF_HWHEEL, ax * WHEEL_DELTA);
    }
    if (ay) {
      this.wheelAcc.y -= ay * WHEEL_DELTA;
      this._wheelFlags(MOUSEEVENTF_WHEEL, ay * WHEEL_DELTA);
    }
  }

  _wheelFlags(flag, mouseData) {
    MO_IN.writeInt32LE(0, 8);
    MO_IN.writeInt32LE(0, 12);
    MO_IN.writeInt32LE(mouseData, 16);
    MO_IN.writeUInt32LE(flag, 20);
    send(MO_IN);
  }

  button(name, value) {
    const press = {
      BTN_LEFT: [MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP],
      BTN_RIGHT: [MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP],
      BTN_MIDDLE: [MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP],
    }[name];
    if (!press) return false;
    const v = value ? 1 : 0;
    if (this.btnState.get(name) === v) return true;
    this.btnState.set(name, v);
    MO_IN.writeInt32LE(0, 8);
    MO_IN.writeInt32LE(0, 12);
    MO_IN.writeUInt32LE(0, 16);
    MO_IN.writeUInt32LE(v ? press[0] : press[1], 20);
    send(MO_IN);
    return true;
  }

  reset() {
    for (const [name, held] of [...this.btnState]) {
      if (held) {
        this.button(name, 0);
      }
    }
  }

  syn() {}
  close() {}
}

function send(buf) {
  try {
    lib().SendInput(1, koffi.as(buf, "void *"), INPUT_SIZE);
  } catch {
    /* transient — the next event repairs state via reset() */
  }
}
