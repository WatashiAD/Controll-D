/* Linux keyboard + mouse via /dev/uinput (see uinput.mjs). */

import { UinputDevice, UinputError, EV_KEY, EV_REL } from "./uinput.mjs";
import { KEYS, MOUSE_BUTTONS } from "./keys.mjs";

const REL_X = 0x00;
const REL_Y = 0x01;
const REL_WHEEL = 0x08;
const REL_HWHEEL = 0x0a;

export const KeyboardError = UinputError;

export class LinuxKeyboard extends UinputDevice {
  constructor() {
    super("Controll-D Virtual Keyboard", {
      vid: 0x046d,
      pid: 0xc31c,
      keys: [...Object.values(KEYS).map((k) => k.u)],
    });
    this.latched = new Set();
  }

  key(name, value) {
    const entry = KEYS[name];
    if (!entry) return false;
    const v = value ? 1 : 0;
    if (this.latched.has(name) === !!v) return true; // dedupe repeat presses
    if (v) this.latched.add(name);
    else this.latched.delete(name);
    this.emit(EV_KEY, entry.u, v);
    return true;
  }

  reset() {
    for (const name of this.latched) {
      this.emit(EV_KEY, KEYS[name].u, 0);
    }
    if (this.latched.size && !this.closed) this.syn();
    this.latched.clear();
  }
}

export class LinuxMouse extends UinputDevice {
  constructor() {
    super("Controll-D Virtual Mouse", {
      vid: 0x046d,
      pid: 0xc077,
      keys: [MOUSE_BUTTONS.BTN_LEFT.u, MOUSE_BUTTONS.BTN_RIGHT.u, MOUSE_BUTTONS.BTN_MIDDLE.u],
      rels: [REL_X, REL_Y, REL_WHEEL, REL_HWHEEL],
    });
    this.btnState = new Map();
    this.wheelAcc = { x: 0, y: 0 };
  }

  move(dx, dy) {
    if (dx) this.emit(EV_REL, REL_X, dx);
    if (dy) this.emit(EV_REL, REL_Y, dy);
    return true;
  }

  /* y>0 scrolls down (natural); evdev REL_WHEEL is positive-up, so negate. */
  wheel(x, y) {
    this.wheelAcc.x += x;
    this.wheelAcc.y += -y;
    const sx = Math.trunc(this.wheelAcc.x);
    const sy = Math.trunc(this.wheelAcc.y);
    if (sx) {
      this.wheelAcc.x -= sx;
      this.emit(EV_REL, REL_HWHEEL, sx);
    }
    if (sy) {
      this.wheelAcc.y -= sy;
      this.emit(EV_REL, REL_WHEEL, sy);
    }
    return true;
  }

  button(name, value) {
    const entry = MOUSE_BUTTONS[name];
    if (!entry) return false;
    const v = value ? 1 : 0;
    if (this.btnState.get(name) === v) return true;
    this.btnState.set(name, v);
    this.emit(EV_KEY, entry.u, v);
    return true;
  }

  reset() {
    let changed = false;
    for (const [name, held] of this.btnState) {
      if (held) {
        this.emit(EV_KEY, MOUSE_BUTTONS[name].u, 0);
        this.btnState.set(name, 0);
        changed = true;
      }
    }
    if (changed && !this.closed) this.syn();
  }
}
