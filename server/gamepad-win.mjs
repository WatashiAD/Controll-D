/* Windows virtual gamepad — Xbox 360 class via ViGEmBus + ViGEmClient.dll.
 *
 * Requirements (user-provided, one-time):
 *   1. ViGEmBus driver:        https://vigem.org (installer)
 *   2. ViGEmClient.dll next to this file / beside the app entry:
 *      copy it from the ViGEm Client SDK into the project root.
 *
 * Error codes follow ViGEmClient.h — note VIGEM_ERROR_NONE == 0x20000000.
 */

import fs from "node:fs";
import path from "node:path";
import koffi from "koffi";

export const XUSB_BUTTON = {
  DPAD_UP: 0x0001,
  DPAD_DOWN: 0x0002,
  DPAD_LEFT: 0x0004,
  DPAD_RIGHT: 0x0008,
  START: 0x0010,
  BACK: 0x0020,
  LEFT_THUMB: 0x0040,
  RIGHT_THUMB: 0x0080,
  LEFT_SHOULDER: 0x0100,
  RIGHT_SHOULDER: 0x0200,
  GUIDE: 0x0400,
  A: 0x1000,
  B: 0x2000,
  X: 0x4000,
  Y: 0x8000,
};

/* Logical pad name (shared with gamepad.mjs) -> XUSB bit */
const BTN_MAP = {
  BTN_SOUTH: XUSB_BUTTON.A,
  BTN_EAST: XUSB_BUTTON.B,
  BTN_NORTH: XUSB_BUTTON.X,
  BTN_WEST: XUSB_BUTTON.Y,
  BTN_TL: XUSB_BUTTON.LEFT_SHOULDER,
  BTN_TR: XUSB_BUTTON.RIGHT_SHOULDER,
  BTN_SELECT: XUSB_BUTTON.BACK,
  BTN_START: XUSB_BUTTON.START,
  BTN_MODE: XUSB_BUTTON.GUIDE,
  BTN_THUMBL: XUSB_BUTTON.LEFT_THUMB,
  BTN_THUMBR: XUSB_BUTTON.RIGHT_THUMB,
};

const VIGEM_ERROR_NONE = 0x20000000; // success — NOT zero!
const BUS_CODE = {
  0xe0000001: "ViGEmBus driver not installed (vigem.org)",
};

export class GamepadWinError extends Error {}

export class VirtualGamepadWin {
  constructor(name = "Controll-D Virtual Gamepad") {
    void name;
    const dllPath = this._findDll();
    if (!dllPath) {
      throw new GamepadWinError(
        "ViGEmClient.dll not found. Install ViGEmBus (vigem.org), drop ViGEmClient.dll " +
          "next to server/gamepad-win.mjs, then restart Controll-D.",
      );
    }
    let lib;
    try {
      lib = koffi.load(dllPath);
    } catch (err) {
      throw new GamepadWinError(`Cannot load ViGEmClient.dll: ${err.message}`);
    }

    koffi.types({
      XUSB_REPORT: koffi.struct("XUSB_REPORT", {
        wButtons: "uint16",
        bLeftTrigger: "uint8",
        bRightTrigger: "uint8",
        sThumbLX: "int16",
        sThumbLY: "int16",
        sThumbRX: "int16",
        sThumbRY: "int16",
      }),
    });

    this.report = { wButtons: 0, bLeftTrigger: 0, bRightTrigger: 0, sThumbLX: 0, sThumbLY: 0, sThumbRX: 0, sThumbRY: 0 };
    this._lib = lib;
    this._alloc = lib.func("void * vigem_alloc()");
    this._free = lib.func("void vigem_free(void *)");
    this._connect = lib.func("uint32 vigem_connect(void *)");
    this._disconnect = lib.func("void vigem_disconnect(void *)");
    this._tgtAlloc = lib.func("void * vigem_target_x360_alloc()");
    this._tgtFree = lib.func("void vigem_target_free(void *)");
    this._tgtAdd = lib.func("uint32 vigem_target_add(void *, void *)");
    this._tgtRemove = lib.func("uint32 vigem_target_remove(void *, void *)");
    this._tgtVid = lib.func("void vigem_target_set_vid(void *, uint16)");
    this._tgtPid = lib.func("void vigem_target_set_pid(void *, uint16)");
    this._tgtAttached = lib.func("bool vigem_target_is_attached(void *)");
    this._update = lib.func("uint32 vigem_target_x360_update(void *, void *, XUSB_REPORT)");
    this._tgtGetIdx = lib.func("uint8 vigem_target_get_index(void *)");

    this._client = this._alloc();
    const rc = this._connect(this._client);
    if (rc !== VIGEM_ERROR_NONE) {
      throw new GamepadWinError(
        BUS_CODE[rc] || `ViGEmBus connect failed (0x${(rc >>> 0).toString(16)})`,
      );
    }
    this._target = this._tgtAlloc();
    this._tgtVid(this._target, 0x045e);
    this._tgtPid(this._target, 0x028e);
    const added = this._tgtAdd(this._client, this._target);
    if (added !== VIGEM_ERROR_NONE || !this._tgtAttached(this._target)) {
      throw new GamepadWinError("ViGEmBus accepted the handle but the pad never attached");
    }
    this.index = this._tgtGetIdx(this._target);
  }

  _findDll() {
    const exeDir = path.dirname(process.argv[1] || ".");
    const candidates = [
      process.env.VIGEM_DLL,
      path.join(process.cwd(), "ViGEmClient.dll"),
      path.join(exeDir, "ViGEmClient.dll"),
      path.join(process.cwd(), "vendor", "vigem", "ViGEmClient.dll"),
    ].filter(Boolean);
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return fs.realpathSync(p);
      } catch {
        /* try next */
      }
    }
    return null;
  }

  setButton(codeName, value) {
    if (codeName === "BTN_TL2") {
      this.report.bLeftTrigger = value ? 255 : 0;
    } else if (codeName === "BTN_TR2") {
      this.report.bRightTrigger = value ? 255 : 0;
    } else {
      const bit = BTN_MAP[codeName];
      if (!bit) return false;
      if (value) this.report.wButtons |= bit;
      else this.report.wButtons &= ~bit;
    }
    this.syn();
    return true;
  }

  setAxis(codeName, value) {
    const v = Math.max(-1, Math.min(1, value));
    switch (codeName) {
      case "ABS_X": this.report.sThumbLX = Math.round(v * 32767); break;
      case "ABS_Y": this.report.sThumbLY = Math.round(-v * 32767); break;
      case "ABS_RX": this.report.sThumbRX = Math.round(v * 32767); break;
      case "ABS_RY": this.report.sThumbRY = Math.round(-v * 32767); break;
      case "ABS_Z": this.report.bLeftTrigger = Math.round(Math.max(0, v) * 255); break;
      case "ABS_RZ": this.report.bRightTrigger = Math.round(Math.max(0, v) * 255); break;
      case "ABS_HAT0X":
      case "ABS_HAT0Y": {
        const d = Math.abs(value) < 0.5 ? 0 : Math.sign(value);
        let bits = 0;
        if (codeName === "ABS_HAT0X") {
          if (d > 0) bits = XUSB_BUTTON.DPAD_RIGHT;
          else if (d < 0) bits = XUSB_BUTTON.DPAD_LEFT;
        } else if (d > 0) {
          bits = XUSB_BUTTON.DPAD_UP; // client Y is screen-flipped already
        } else if (d < 0) {
          bits = XUSB_BUTTON.DPAD_DOWN;
        }
        this.report.wButtons = (this.report.wButtons & ~0x000f) | bits;
        break;
      }
      default:
        return false;
    }
    this.syn();
    return true;
  }

  reset() {
    this.report = { wButtons: 0, bLeftTrigger: 0, bRightTrigger: 0, sThumbLX: 0, sThumbLY: 0, sThumbRX: 0, sThumbRY: 0 };
    this.syn();
  }

  syn() {
    try {
      const rc = this._update(this._client, this._target, this.report);
      if (rc !== VIGEM_ERROR_NONE) {
        /* transient — next report repairs */
      }
    } catch {
      /* driver hiccup */
    }
  }

  startRumbleWatcher() {
    /* rumble notifications need a native callback — unsupported via koffi */
  }

  close() {
    try {
      if (this._target) this._tgtRemove(this._client, this._target);
      if (this._target) this._tgtFree(this._target);
      if (this._client) {
        this._disconnect(this._client);
        this._free(this._client);
      }
    } catch {
      /* process teardown */
    }
    this._target = this._client = null;
  }

  destroy() {
    this.close();
  }
}
