/* Layout data: presets, sanitising, persistence.

 * Control types kept intentionally minimal: button, stick, dpad, action.
 * (v5 dropped the sandbox-only trigger/island/cluster types and the
 * PlayStation/retro presets.)
 */

import { loadLayouts, saveLayouts } from "./settings.js";
import { BUTTON_SET, AXIS_SET } from "./codes.js";
import { ACTION_SET } from "./controls.js";

export const LAYOUT_VERSION = 5;
export const SHAPE_OPTIONS = ["cookie", "clover", "squircle", "circle", "pill", "cut", "organic", "flower"];

let uidCounter = 0;
export function uid(prefix = "c") {
  uidCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${uidCounter}`;
}

/* Face-label families. cluster/map kept for backwards-compatible imports. */
export const BUTTON_STYLES = {
  xbox: {
    id: "xbox",
    title: "Xbox",
    cluster: { north: "Y", west: "X", east: "B", south: "A" },
    map: { north: "BTN_WEST", west: "BTN_NORTH", east: "BTN_EAST", south: "BTN_SOUTH" },
    face: { BTN_SOUTH: "A", BTN_EAST: "B", BTN_NORTH: "X", BTN_WEST: "Y" },
    shoulders: { BTN_TL: "LB", BTN_TR: "RB", BTN_TL2: "LT", BTN_TR2: "RT" },
    center: { BTN_SELECT: "VIEW", BTN_START: "MENU", BTN_MODE: "⌂" },
  },
  nintendo: {
    id: "nintendo",
    title: "Nintendo Switch",
    cluster: { north: "X", west: "Y", east: "A", south: "B" },
    map: { north: "BTN_WEST", west: "BTN_NORTH", east: "BTN_EAST", south: "BTN_SOUTH" },
    face: { BTN_SOUTH: "B", BTN_EAST: "A", BTN_NORTH: "Y", BTN_WEST: "X" },
    shoulders: { BTN_TL: "L", BTN_TR: "R", BTN_TL2: "ZL", BTN_TR2: "ZR" },
    center: { BTN_SELECT: "−", BTN_START: "+", BTN_MODE: "⌂" },
  },
};

export function applyButtonStyleToLayout(layout, styleName = "xbox") {
  const style = BUTTON_STYLES[styleName] || BUTTON_STYLES.xbox;
  if (!layout || !layout.controls) return layout;
  for (const c of layout.controls) {
    if (c.type === "button" && c.map && c.map.code) {
      const code = c.map.code;
      if (style.shoulders[code]) {
        c.label = style.shoulders[code];
      } else if (style.center[code]) {
        c.label = style.center[code];
      } else if (style.face && style.face[code]) {
        c.label = style.face[code];
      }
    }
  }
  return layout;
}

/* Xbox Wireless pad: Y/B/A/X diamond + offset sticks (left high, right low). */
export function xboxLayout(name = "xbox") {
  return {
    version: LAYOUT_VERSION,
    name,
    controls: [
      { id: uid(), type: "stick", label: "", x: 20, y: 32, size: 26, aspect: 1, opacity: 1, shape: "flower",
        map: { x: "ABS_X", y: "ABS_Y" }, mode: "floating", deadzone: 12, invertY: false },
      { id: uid(), type: "dpad", label: "", x: 33, y: 68, size: 22, aspect: 1, opacity: 1, shape: "clover",
        map: { x: "ABS_HAT0X", y: "ABS_HAT0Y" }, deadzone: 0, invertY: false },
      /* Xbox diamond: Y top, B right, A bottom, X left */
      { id: uid(), type: "button", label: "Y", x: 80, y: 22, size: 13, aspect: 1, opacity: 1, shape: "circle",
        map: { code: "BTN_WEST" }, behavior: "press" },
      { id: uid(), type: "button", label: "B", x: 88, y: 34, size: 13, aspect: 1, opacity: 1, shape: "circle",
        map: { code: "BTN_EAST" }, behavior: "press" },
      { id: uid(), type: "button", label: "A", x: 80, y: 46, size: 13, aspect: 1, opacity: 1, shape: "circle",
        map: { code: "BTN_SOUTH" }, behavior: "press" },
      { id: uid(), type: "button", label: "X", x: 72, y: 34, size: 13, aspect: 1, opacity: 1, shape: "circle",
        map: { code: "BTN_NORTH" }, behavior: "press" },
      { id: uid(), type: "stick", label: "", x: 67, y: 68, size: 26, aspect: 1, opacity: 1, shape: "flower",
        map: { x: "ABS_RX", y: "ABS_RY" }, mode: "fixed", deadzone: 12, invertY: false },
      { id: uid(), type: "button", label: "LB", x: 16, y: 8, size: 14, aspect: 0.45, opacity: 1, shape: "pill",
        map: { code: "BTN_TL" }, behavior: "press" },
      { id: uid(), type: "button", label: "LT", x: 30, y: 8, size: 14, aspect: 0.45, opacity: 1, shape: "pill",
        map: { code: "BTN_TL2" }, behavior: "press" },
      { id: uid(), type: "button", label: "RT", x: 70, y: 8, size: 14, aspect: 0.45, opacity: 1, shape: "pill",
        map: { code: "BTN_TR2" }, behavior: "press" },
      { id: uid(), type: "button", label: "RB", x: 84, y: 8, size: 14, aspect: 0.45, opacity: 1, shape: "pill",
        map: { code: "BTN_TR" }, behavior: "press" },
      { id: uid(), type: "button", label: "VIEW", x: 43, y: 12, size: 9, aspect: 1, opacity: 1, shape: "squircle",
        map: { code: "BTN_SELECT" }, behavior: "press" },
      { id: uid(), type: "button", label: "MENU", x: 57, y: 12, size: 9, aspect: 1, opacity: 1, shape: "squircle",
        map: { code: "BTN_START" }, behavior: "press" },
      { id: uid(), type: "button", label: "⌂", x: 50, y: 24, size: 9, aspect: 1, opacity: 1, shape: "squircle",
        map: { code: "BTN_MODE" }, behavior: "press" },
      { id: uid(), type: "action", label: "⛶", x: 50, y: 50, size: 8, aspect: 1, opacity: 0.6, shape: "squircle",
        map: { action: "fullscreen" } },
    ],
  };
}

/* Nintendo Switch pad: symmetrical sticks high/low, X top / A right / B bottom / Y left. */
export function nintendoLayout(name = "default") {
  return {
    version: LAYOUT_VERSION,
    name,
    controls: [
      { id: uid(), type: "stick", label: "", x: 20, y: 62, size: 28, aspect: 1, opacity: 1, shape: "flower",
        map: { x: "ABS_X", y: "ABS_Y" }, mode: "floating", deadzone: 12, invertY: false },
      { id: uid(), type: "dpad", label: "", x: 20, y: 30, size: 22, aspect: 1, opacity: 1, shape: "clover",
        map: { x: "ABS_HAT0X", y: "ABS_HAT0Y" }, deadzone: 0, invertY: false },
      { id: uid(), type: "button", label: "X", x: 81, y: 36, size: 13, aspect: 1, opacity: 1, shape: "circle",
        map: { code: "BTN_WEST" }, behavior: "press" },
      { id: uid(), type: "button", label: "A", x: 88, y: 48, size: 13, aspect: 1, opacity: 1, shape: "circle",
        map: { code: "BTN_EAST" }, behavior: "press" },
      { id: uid(), type: "button", label: "B", x: 81, y: 60, size: 13, aspect: 1, opacity: 1, shape: "circle",
        map: { code: "BTN_SOUTH" }, behavior: "press" },
      { id: uid(), type: "button", label: "Y", x: 74, y: 48, size: 13, aspect: 1, opacity: 1, shape: "circle",
        map: { code: "BTN_NORTH" }, behavior: "press" },
      { id: uid(), type: "button", label: "L", x: 16, y: 8, size: 14, aspect: 0.45, opacity: 1, shape: "pill",
        map: { code: "BTN_TL" }, behavior: "press" },
      { id: uid(), type: "button", label: "ZL", x: 30, y: 8, size: 14, aspect: 0.45, opacity: 1, shape: "pill",
        map: { code: "BTN_TL2" }, behavior: "press" },
      { id: uid(), type: "button", label: "ZR", x: 70, y: 8, size: 14, aspect: 0.45, opacity: 1, shape: "pill",
        map: { code: "BTN_TR2" }, behavior: "press" },
      { id: uid(), type: "button", label: "R", x: 84, y: 8, size: 14, aspect: 0.45, opacity: 1, shape: "pill",
        map: { code: "BTN_TR" }, behavior: "press" },
      { id: uid(), type: "button", label: "−", x: 43, y: 12, size: 9, aspect: 1, opacity: 1, shape: "squircle",
        map: { code: "BTN_SELECT" }, behavior: "press" },
      { id: uid(), type: "button", label: "+", x: 57, y: 12, size: 9, aspect: 1, opacity: 1, shape: "squircle",
        map: { code: "BTN_START" }, behavior: "press" },
      { id: uid(), type: "button", label: "⌂", x: 50, y: 24, size: 9, aspect: 1, opacity: 1, shape: "squircle",
        map: { code: "BTN_MODE" }, behavior: "press" },
      { id: uid(), type: "stick", label: "", x: 60, y: 74, size: 24, aspect: 1, opacity: 1, shape: "flower",
        map: { x: "ABS_RX", y: "ABS_RY" }, mode: "fixed", deadzone: 12, invertY: false },
      { id: uid(), type: "action", label: "⛶", x: 50, y: 50, size: 8, aspect: 1, opacity: 0.6, shape: "squircle",
        map: { action: "fullscreen" } },
    ],
  };
}

export const PRESET_TITLES = {
  xbox: "Xbox",
  nintendo: "Nintendo Switch",
};

export const PRESETS = {
  xbox: xboxLayout("xbox"),
  nintendo: nintendoLayout("nintendo"),
};

export function defaultLayout() {
  return xboxLayout("xbox");
}

function num(value, lo, hi, fallback) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(lo, Math.min(hi, n));
}

function str(value, fallback, max = 40) {
  if (typeof value !== "string") return fallback;
  return value.slice(0, max);
}

/* Accept any layout-ish object, return a safe one (or null if unusable). */
export function sanitizeLayout(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.controls)) return null;
  const controls = [];
  for (const raw of input.controls.slice(0, 80)) {
    if (!raw || typeof raw !== "object") continue;
    const type = raw.type;
    if (!["button", "stick", "dpad", "action"].includes(type)) continue;

    const base = {
      id: typeof raw.id === "string" ? raw.id.slice(0, 40) : uid(),
      type,
      label: str(raw.label, "", 12),
      x: num(raw.x, -10, 110, 50),
      y: num(raw.y, -10, 110, 50),
      size: num(raw.size, 4, 60, 12),
      aspect: num(raw.aspect, 0.2, 4, 1),
      opacity: num(raw.opacity, 0.2, 1, 1),
    };
    const map = raw.map && typeof raw.map === "object" ? raw.map : {};

    if (type === "button") {
      if (!BUTTON_SET.has(map.code)) continue;
      base.map = { code: map.code };
      base.behavior = map.behavior === "toggle" || raw.behavior === "toggle" ? "toggle" : "press";
      if (typeof raw.shape === "string" && SHAPE_OPTIONS.includes(raw.shape)) {
        base.shape = raw.shape;
      }
    } else if (type === "action") {
      if (!ACTION_SET.has(map.action)) continue;
      base.map = { action: map.action };
      if (typeof raw.shape === "string" && SHAPE_OPTIONS.includes(raw.shape)) {
        base.shape = raw.shape;
      }
    } else {
      if (!AXIS_SET.has(map.x) || !AXIS_SET.has(map.y)) continue;
      base.map = { x: map.x, y: map.y };
      base.deadzone = num(raw.deadzone, 0, 60, 12);
      base.invertY = !!raw.invertY;
      if (type === "stick") {
        base.mode = raw.mode === "fixed" ? "fixed" : "floating";
        if (typeof raw.shape === "string" && SHAPE_OPTIONS.includes(raw.shape)) {
          base.shape = raw.shape;
        }
      } else if (typeof raw.shape === "string" && SHAPE_OPTIONS.includes(raw.shape)) {
        base.shape = raw.shape;
      }
    }
    controls.push(base);
  }
  if (controls.length === 0) return null;
  return {
    version: LAYOUT_VERSION,
    name: str(input.name, "imported", 40),
    controls,
  };
}

export function listLayouts() {
  const custom = loadLayouts();
  return {
    ...PRESETS,
    ...custom,
  };
}

export function persistLayout(layout) {
  const layouts = loadLayouts();
  layouts[layout.name] = layout;
  saveLayouts(layouts);
}

export function deleteLayout(name) {
  const layouts = loadLayouts();
  delete layouts[name];
  saveLayouts(layouts);
}
