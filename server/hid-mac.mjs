/* macOS keyboard + mouse via CoreGraphics CGEvent (koffi FFI, no build step).
 *
 * Needs the Accessibility permission for the host terminal/Node binary:
 *   System Settings → Privacy & Security → Accessibility.
 *
 * Cursor position is tracked server-side because CGEvent mouse events are
 * absolute; deltas accumulate into a screen-bounds-clamped synthetic cursor.
 */

import koffi from "koffi";
import { KEYS } from "./keys.mjs";

const K_CG_EVENT_MOUSE_MOVED = 5;
const K_CG_EVENT_LEFT_DOWN = 1;
const K_CG_EVENT_LEFT_UP = 2;
const K_CG_EVENT_RIGHT_DOWN = 3;
const K_CG_EVENT_RIGHT_UP = 4;
const K_CG_EVENT_OTHER_DOWN = 25;
const K_CG_EVENT_OTHER_UP = 26;

/* kCGEventFlagMask */
const FLAG_SHIFT = 0x00020000;
const FLAG_CONTROL = 0x00040000;
const FLAG_OPTION = 0x00080000;
const FLAG_COMMAND = 0x00100000;
const FLAG_CAPS = 0x00010000;

const FLAG_BY_KEY = {
  KEY_LEFTSHIFT: FLAG_SHIFT,
  KEY_RIGHTSHIFT: FLAG_SHIFT,
  KEY_LEFTCTRL: FLAG_CONTROL,
  KEY_RIGHTCTRL: FLAG_CONTROL,
  KEY_LEFTALT: FLAG_OPTION,
  KEY_RIGHTALT: FLAG_OPTION,
  KEY_LEFTMETA: FLAG_COMMAND,
  KEY_RIGHTMETA: FLAG_COMMAND,
  KEY_CAPSLOCK: FLAG_CAPS,
};

/* kCGScrollEventUnitPixel */
const SCROLL_UNIT_PIXEL = 1;
/* kCGHIDEventTap */
const HID_TAP = 0;

const MAC_BTN = {
  BTN_LEFT: { down: K_CG_EVENT_LEFT_DOWN, up: K_CG_EVENT_LEFT_UP, idx: 0 },
  BTN_RIGHT: { down: K_CG_EVENT_RIGHT_DOWN, up: K_CG_EVENT_RIGHT_UP, idx: 1 },
  BTN_MIDDLE: { down: K_CG_EVENT_OTHER_DOWN, up: K_CG_EVENT_OTHER_UP, idx: 2 },
};

let cg = null;
function lib() {
  if (cg) return cg;
  cg = koffi.load("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics");
  koffi.types({
    CGPoint: koffi.struct("CGPoint", { x: "double", y: "double" }),
  });
  cg.func("void * CGEventCreateKeyboardEvent(void *source, uint16 virtualKey, bool down)");
  cg.func("void * CGEventCreateMouseEvent(void *source, int type, CGPoint point, int button)");
  cg.func("void CGEventPost(uint32 tap, void *event)");
  cg.func("void CGEventSetFlags(void *event, uint64 flags)");
  cg.func("void CFRelease(void *event)");
  try {
    cg.func("void * CGEventCreateScrollWheelEvent2(void *source, int units, uint32 count, int32 wheel1)");
  } catch {
    /* older SDK — scrolling gracefully disabled */
  }
  try {
    cg.func("bool CGPreflightPostEventAccess()");
    cg.func("bool CGPreflightListenEventAccess()");
  } catch {
    /* optional */
  }
  try {
    cg.func("uint32 CGDisplayPixelsWide(uint32 display)");
    cg.func("uint32 CGDisplayPixelsHigh(uint32 display)");
    cg.func("uint32 CGMainDisplayID()");
  } catch {
    /* fall back to a sane default screen size */
  }
  return cg;
}

export function macPostAccess() {
  try {
    const l = lib();
    if (l.CGPreflightPostEventAccess) return !!l.CGPreflightPostEventAccess();
  } catch {
    /* assume ok on unknown SDKs */
  }
  return true;
}

class MacHid {
  constructor() {
    this._cg = lib();
    this.flags = 0;
  }

  _postEvent(ev) {
    try {
      this._cg.CGEventSetFlags(ev, this.flags);
      this._cg.CGEventPost(HID_TAP, ev);
      this._cg.CFRelease(ev);
    } catch {
      /* keep going — accessibility permission is the usual cause */
    }
  }
}

export class MacKeyboard extends MacHid {
  constructor() {
    super();
    this.latched = new Set();
  }

  key(name, value) {
    const entry = KEYS[name];
    if (!entry) return false;
    const v = value ? 1 : 0;
    if (this.latched.has(name) === !!v) return true;
    if (v) this.latched.add(name);
    else this.latched.delete(name);
    if (FLAG_BY_KEY[name]) {
      if (v) this.flags |= FLAG_BY_KEY[name];
      else this.flags &= ~FLAG_BY_KEY[name];
    }
    let ev = null;
    try {
      ev = this._cg.CGEventCreateKeyboardEvent(null, entry.m, !!v);
    } catch {
      ev = null;
    }
    if (ev) this._postEvent(ev);
    return true;
  }

  reset() {
    for (const name of [...this.latched]) {
      const entry = KEYS[name];
      if (entry) {
        let ev = null;
        try {
          ev = this._cg.CGEventCreateKeyboardEvent(null, entry.m, false);
        } catch {
          ev = null;
        }
        if (ev) this._postEvent(ev);
      }
    }
    this.latched.clear();
    this.flags = 0;
  }

  syn() {}
  close() {}
}

export class MacMouse extends MacHid {
  constructor() {
    super();
    this.btnState = new Map();
    /* synthetic cursor in points; re-derived from the screen on first use */
    this.cx = -1;
    this.cy = -1;
  }

  _screen() {
    try {
      const main = this._cg.CGMainDisplayID();
      return {
        w: this._cg.CGDisplayPixelsWide(main),
        h: this._cg.CGDisplayPixelsHigh(main),
      };
    } catch {
      return { w: 0, h: 0 };
    }
  }

  _current() {
    if (this.cx < 0) {
      const { w, h } = this._screen();
      this.cx = w ? Math.floor(w / 2) : 0;
      this.cy = h ? Math.floor(h / 2) : 0;
    }
    return { x: this.cx, y: this.cy };
  }

  _clamp() {
    const { w, h } = this._screen();
    if (w) this.cx = Math.max(0, Math.min(w - 1, this.cx));
    if (h) this.cy = Math.max(0, Math.min(h - 1, this.cy));
  }

  move(dx, dy) {
    const p = this._current();
    this.cx = p.x + dx;
    this.cy = p.y + dy;
    this._clamp();
    let ev = null;
    try {
      ev = this._cg.CGEventCreateMouseEvent(null, K_CG_EVENT_MOUSE_MOVED, { x: this.cx, y: this.cy }, 0);
    } catch {
      ev = null;
    }
    if (ev) this._postEvent(ev);
  }

  /* y>0 scrolls down; pixel-unit wheel1 positive = down on macOS. */
  wheel(x, y) {
    const fn = this._cg.CGEventCreateScrollWheelEvent2;
    if (!fn) return;
    const ay = Math.round(y);
    if (!ay) return;
    let ev = null;
    try {
      ev = fn(null, SCROLL_UNIT_PIXEL, 1, ay);
    } catch {
      ev = null;
    }
    if (ev) this._postEvent(ev);
  }

  button(name, value) {
    const press = MAC_BTN[name];
    if (!press) return false;
    const v = value ? 1 : 0;
    if (this.btnState.get(name) === v) return true;
    this.btnState.set(name, v);
    const p = this._current();
    let ev = null;
    try {
      ev = this._cg.CGEventCreateMouseEvent(
        null,
        v ? press.down : press.up,
        { x: p.x, y: p.y },
        press.idx,
      );
    } catch {
      ev = null;
    }
    if (ev) this._postEvent(ev);
    return true;
  }

  reset() {
    for (const [name, held] of [...this.btnState]) {
      if (held) this.button(name, 0);
    }
  }

  syn() {}
  close() {}
}
