/* Layout data: default, sanitising, persistence. */

import { loadLayouts, saveLayouts } from "./settings.js";
import { BUTTON_SET, AXIS_SET } from "./codes.js";
import { ACTION_SET } from "./controls.js";

export const LAYOUT_VERSION = 4;
export const SHAPE_OPTIONS = ["squircle", "circle", "pill", "cut", "organic", "clover", "flower", "island"];

let uidCounter = 0;
export function uid(prefix = "c") {
  uidCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${uidCounter}`;
}

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
  playstation: {
    id: "playstation",
    title: "PlayStation",
    cluster: { north: "▲", west: "■", east: "●", south: "✕" },
    map: { north: "BTN_WEST", west: "BTN_NORTH", east: "BTN_EAST", south: "BTN_SOUTH" },
    face: { BTN_SOUTH: "✕", BTN_EAST: "●", BTN_NORTH: "■", BTN_WEST: "▲" },
    shoulders: { BTN_TL: "L1", BTN_TR: "R1", BTN_TL2: "L2", BTN_TR2: "R2" },
    center: { BTN_SELECT: "SHARE", BTN_START: "OPTIONS", BTN_MODE: "PS" },
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
    if (c.type === "cluster") {
      c.labels = { ...style.cluster };
      c.map = { ...style.map };
    } else if (c.type === "button" && c.map && c.map.code) {
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

/* Nintendo Switch Pro-style pad: sticks + dpad + plain buttons only. */
export function nintendoLayout(name = "default") {
  return {
    version: LAYOUT_VERSION,
    name,
    controls: [
      { id: uid(), type: "stick", label: "", x: 20, y: 62, size: 28, aspect: 1, opacity: 1,
        map: { x: "ABS_X", y: "ABS_Y" }, mode: "floating", deadzone: 12, invertY: false },
      { id: uid(), type: "dpad", label: "", x: 20, y: 30, size: 22, aspect: 1, opacity: 1,
        map: { x: "ABS_HAT0X", y: "ABS_HAT0Y" }, deadzone: 0, invertY: false },
      /* Nintendo diamond: X top, A right, B bottom, Y left -> in Eden/Yuzu maps to Switch X/A/B/Y */
      { id: uid(), type: "button", label: "X", x: 81, y: 36, size: 13, aspect: 1, opacity: 1, shape: "squircle",
        map: { code: "BTN_WEST" }, behavior: "press" },
      { id: uid(), type: "button", label: "A", x: 88, y: 48, size: 13, aspect: 1, opacity: 1, shape: "squircle",
        map: { code: "BTN_EAST" }, behavior: "press" },
      { id: uid(), type: "button", label: "B", x: 81, y: 60, size: 13, aspect: 1, opacity: 1, shape: "squircle",
        map: { code: "BTN_SOUTH" }, behavior: "press" },
      { id: uid(), type: "button", label: "Y", x: 74, y: 48, size: 13, aspect: 1, opacity: 1, shape: "squircle",
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
      { id: uid(), type: "stick", label: "", x: 60, y: 74, size: 24, aspect: 1, opacity: 1,
        map: { x: "ABS_RX", y: "ABS_RY" }, mode: "fixed", deadzone: 12, invertY: false },
      { id: uid(), type: "action", label: "⛶", x: 50, y: 50, size: 8, aspect: 1, opacity: 0.6, shape: "squircle",
        map: { action: "fullscreen" } },
    ],
  };
}

/* PlayStation DualSense pad: Triangle, Circle, Cross, Square shapes + symmetrical sticks. */
export function playstationLayout(name = "playstation") {
  return {
    version: LAYOUT_VERSION,
    name,
    controls: [
      { id: uid(), type: "dpad", label: "", x: 20, y: 32, size: 24, aspect: 1, opacity: 1,
        map: { x: "ABS_HAT0X", y: "ABS_HAT0Y" }, deadzone: 0, invertY: false },
      { id: uid(), type: "stick", label: "", x: 33, y: 70, size: 25, aspect: 1, opacity: 1,
        map: { x: "ABS_X", y: "ABS_Y" }, mode: "floating", deadzone: 12, invertY: false },
      { id: uid(), type: "stick", label: "", x: 67, y: 70, size: 25, aspect: 1, opacity: 1,
        map: { x: "ABS_RX", y: "ABS_RY" }, mode: "fixed", deadzone: 12, invertY: false },
      /* The Shapes diamond: Triangle top, Circle right, Cross bottom, Square left */
      { id: uid(), type: "button", label: "▲", x: 80, y: 22, size: 13, aspect: 1, opacity: 1, shape: "squircle",
        map: { code: "BTN_WEST" }, behavior: "press" },
      { id: uid(), type: "button", label: "●", x: 88, y: 34, size: 13, aspect: 1, opacity: 1, shape: "squircle",
        map: { code: "BTN_EAST" }, behavior: "press" },
      { id: uid(), type: "button", label: "✕", x: 80, y: 46, size: 13, aspect: 1, opacity: 1, shape: "squircle",
        map: { code: "BTN_SOUTH" }, behavior: "press" },
      { id: uid(), type: "button", label: "■", x: 72, y: 34, size: 13, aspect: 1, opacity: 1, shape: "squircle",
        map: { code: "BTN_NORTH" }, behavior: "press" },
      { id: uid(), type: "button", label: "L1", x: 16, y: 8, size: 14, aspect: 0.45, opacity: 1, shape: "pill",
        map: { code: "BTN_TL" }, behavior: "press" },
      { id: uid(), type: "button", label: "L2", x: 30, y: 8, size: 14, aspect: 0.45, opacity: 1, shape: "pill",
        map: { code: "BTN_TL2" }, behavior: "press" },
      { id: uid(), type: "button", label: "R2", x: 70, y: 8, size: 14, aspect: 0.45, opacity: 1, shape: "pill",
        map: { code: "BTN_TR2" }, behavior: "press" },
      { id: uid(), type: "button", label: "R1", x: 84, y: 8, size: 14, aspect: 0.45, opacity: 1, shape: "pill",
        map: { code: "BTN_TR" }, behavior: "press" },
      { id: uid(), type: "button", label: "share", x: 43, y: 12, size: 9, aspect: 1, opacity: 1, shape: "squircle",
        map: { code: "BTN_SELECT" }, behavior: "press" },
      { id: uid(), type: "button", label: "options", x: 57, y: 12, size: 9, aspect: 1, opacity: 1, shape: "squircle",
        map: { code: "BTN_START" }, behavior: "press" },
      { id: uid(), type: "button", label: "⌂", x: 50, y: 24, size: 9, aspect: 1, opacity: 1, shape: "squircle",
        map: { code: "BTN_MODE" }, behavior: "press" },
      { id: uid(), type: "action", label: "⛶", x: 50, y: 50, size: 8, aspect: 1, opacity: 0.6, shape: "squircle",
        map: { action: "fullscreen" } },
    ],
  };
}

/* Xbox Wireless pad: Y/B/A/X diamond + offset sticks (left high, right low). */
export function xboxLayout(name = "xbox") {
  return {
    version: LAYOUT_VERSION,
    name,
    controls: [
      { id: uid(), type: "stick", label: "", x: 20, y: 32, size: 26, aspect: 1, opacity: 1,
        map: { x: "ABS_X", y: "ABS_Y" }, mode: "floating", deadzone: 12, invertY: false },
      { id: uid(), type: "dpad", label: "", x: 33, y: 68, size: 22, aspect: 1, opacity: 1,
        map: { x: "ABS_HAT0X", y: "ABS_HAT0Y" }, deadzone: 0, invertY: false },
      /* Xbox diamond: Y top, B right, A bottom, X left */
      { id: uid(), type: "button", label: "Y", x: 80, y: 22, size: 13, aspect: 1, opacity: 1, shape: "squircle",
        map: { code: "BTN_WEST" }, behavior: "press" },
      { id: uid(), type: "button", label: "B", x: 88, y: 34, size: 13, aspect: 1, opacity: 1, shape: "squircle",
        map: { code: "BTN_EAST" }, behavior: "press" },
      { id: uid(), type: "button", label: "A", x: 80, y: 46, size: 13, aspect: 1, opacity: 1, shape: "squircle",
        map: { code: "BTN_SOUTH" }, behavior: "press" },
      { id: uid(), type: "button", label: "X", x: 72, y: 34, size: 13, aspect: 1, opacity: 1, shape: "squircle",
        map: { code: "BTN_NORTH" }, behavior: "press" },
      { id: uid(), type: "stick", label: "", x: 67, y: 68, size: 26, aspect: 1, opacity: 1,
        map: { x: "ABS_RX", y: "ABS_RY" }, mode: "fixed", deadzone: 12, invertY: false },
      { id: uid(), type: "button", label: "LB", x: 16, y: 8, size: 14, aspect: 0.45, opacity: 1, shape: "pill",
        map: { code: "BTN_TL" }, behavior: "press" },
      { id: uid(), type: "button", label: "LT", x: 30, y: 8, size: 14, aspect: 0.45, opacity: 1, shape: "pill",
        map: { code: "BTN_TL2" }, behavior: "press" },
      { id: uid(), type: "button", label: "RT", x: 70, y: 8, size: 14, aspect: 0.45, opacity: 1, shape: "pill",
        map: { code: "BTN_TR2" }, behavior: "press" },
      { id: uid(), type: "button", label: "RB", x: 84, y: 8, size: 14, aspect: 0.45, opacity: 1, shape: "pill",
        map: { code: "BTN_TR" }, behavior: "press" },
      { id: uid(), type: "button", label: "view", x: 43, y: 12, size: 9, aspect: 1, opacity: 1, shape: "squircle",
        map: { code: "BTN_SELECT" }, behavior: "press" },
      { id: uid(), type: "button", label: "menu", x: 57, y: 12, size: 9, aspect: 1, opacity: 1, shape: "squircle",
        map: { code: "BTN_START" }, behavior: "press" },
      { id: uid(), type: "button", label: "⌂", x: 50, y: 24, size: 9, aspect: 1, opacity: 1, shape: "squircle",
        map: { code: "BTN_MODE" }, behavior: "press" },
      { id: uid(), type: "action", label: "⛶", x: 50, y: 50, size: 8, aspect: 1, opacity: 0.6, shape: "squircle",
        map: { action: "fullscreen" } },
    ],
  };
}

/* Retro Arcade / SNES: Large D-pad + 4 face buttons, no analog sticks for pure 2D precision. */
export function retroLayout(name = "retro") {
  return {
    version: LAYOUT_VERSION,
    name,
    controls: [
      { id: uid(), type: "dpad", label: "", x: 22, y: 52, size: 30, aspect: 1, opacity: 1,
        map: { x: "ABS_HAT0X", y: "ABS_HAT0Y" }, deadzone: 0, invertY: false },
      { id: uid(), type: "button", label: "L", x: 18, y: 10, size: 16, aspect: 0.45, opacity: 1, shape: "pill",
        map: { code: "BTN_TL" }, behavior: "press" },
      { id: uid(), type: "button", label: "R", x: 82, y: 10, size: 16, aspect: 0.45, opacity: 1, shape: "pill",
        map: { code: "BTN_TR" }, behavior: "press" },
      { id: uid(), type: "button", label: "X", x: 80, y: 36, size: 14, aspect: 1, opacity: 1, shape: "circle",
        map: { code: "BTN_WEST" }, behavior: "press" },
      { id: uid(), type: "button", label: "A", x: 88, y: 52, size: 14, aspect: 1, opacity: 1, shape: "circle",
        map: { code: "BTN_EAST" }, behavior: "press" },
      { id: uid(), type: "button", label: "B", x: 80, y: 68, size: 14, aspect: 1, opacity: 1, shape: "circle",
        map: { code: "BTN_SOUTH" }, behavior: "press" },
      { id: uid(), type: "button", label: "Y", x: 72, y: 52, size: 14, aspect: 1, opacity: 1, shape: "circle",
        map: { code: "BTN_NORTH" }, behavior: "press" },
      { id: uid(), type: "button", label: "−", x: 42, y: 62, size: 11, aspect: 0.45, opacity: 1, shape: "pill",
        map: { code: "BTN_SELECT" }, behavior: "press" },
      { id: uid(), type: "button", label: "+", x: 58, y: 62, size: 11, aspect: 0.45, opacity: 1, shape: "pill",
        map: { code: "BTN_START" }, behavior: "press" },
      { id: uid(), type: "action", label: "⛶", x: 50, y: 25, size: 8, aspect: 1, opacity: 0.6, shape: "squircle",
        map: { action: "fullscreen" } },
    ],
  };
}

/* Material 3 Expressive layout: exact Figma design coordinates & components */
export function expressiveLayout(name = "expressive") {
  return {
    version: LAYOUT_VERSION,
    name,
    controls: [
      /* ABXY 4-Button Cluster (Clover) — LEFT side */
      { id: uid(), type: "cluster", label: "", x: 20.8, y: 35.5, size: 23.0, aspect: 1.0, opacity: 1, shape: "clover",
        map: { north: "BTN_WEST", west: "BTN_NORTH", east: "BTN_EAST", south: "BTN_SOUTH" },
        labels: { north: "Y", west: "X", east: "B", south: "A" } },

      /* D-Pad (Clover) — RIGHT side */
      { id: uid(), type: "dpad", label: "", x: 81.8, y: 35.5, size: 22.8, aspect: 1.0, opacity: 1, shape: "clover",
        map: { x: "ABS_HAT0X", y: "ABS_HAT0Y" }, deadzone: 0, invertY: false },

      /* Left Stick (8-lobed Flower well) — bottom LEFT */
      { id: uid(), type: "stick", label: "", x: 17.8, y: 78.6, size: 21.0, aspect: 1.0, opacity: 1, shape: "flower",
        map: { x: "ABS_X", y: "ABS_Y" }, mode: "floating", deadzone: 12, invertY: false },

      /* Right Stick (8-lobed Flower well) — bottom RIGHT */
      { id: uid(), type: "stick", label: "", x: 81.8, y: 78.6, size: 21.0, aspect: 1.0, opacity: 1, shape: "flower",
        map: { x: "ABS_RX", y: "ABS_RY" }, mode: "fixed", deadzone: 12, invertY: false },

      /* Pill Shoulder (ZL) — center-left */
      { id: uid(), type: "button", label: "ZL", x: 43.6, y: 28.2, size: 17.9, aspect: 0.516, opacity: 1, shape: "pill",
        map: { code: "BTN_TL2" }, behavior: "press" },

      /* Squircle Shoulder (R) — center-right */
      { id: uid(), type: "button", label: "R", x: 56.4, y: 28.2, size: 11.3, aspect: 0.814, opacity: 1, shape: "squircle",
        map: { code: "BTN_TR" }, behavior: "press" },

      /* Center Squircle Home Button (⌂) */
      { id: uid(), type: "button", label: "⌂", x: 51.0, y: 53.2, size: 10.9, aspect: 0.849, opacity: 1, shape: "squircle",
        map: { code: "BTN_MODE" }, behavior: "press" },
    ],
  };
}

export const PRESET_TITLES = {
  expressive: "M3 Expressive",
  default: "Nintendo Switch",
  nintendo: "Nintendo Switch",
  playstation: "PlayStation (Shapes)",
  xbox: "Xbox Wireless",
  retro: "Retro Arcade",
};

export const PRESETS = {
  expressive: expressiveLayout("expressive"),
  default: nintendoLayout("default"),
  nintendo: nintendoLayout("nintendo"),
  playstation: playstationLayout("playstation"),
  xbox: xboxLayout("xbox"),
  retro: retroLayout("retro"),
};

export function defaultLayout() {
  return expressiveLayout("expressive");
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
    if (!["button", "stick", "dpad", "trigger", "action", "island", "cluster"].includes(type)) continue;

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
    } else if (type === "cluster") {
      base.shape = typeof raw.shape === "string" && SHAPE_OPTIONS.includes(raw.shape) ? raw.shape : "clover";
      const m = raw.map && typeof raw.map === "object" ? raw.map : {};
      base.map = {
        north: BUTTON_SET.has(m.north) ? m.north : "BTN_NORTH",
        west: BUTTON_SET.has(m.west) ? m.west : "BTN_WEST",
        east: BUTTON_SET.has(m.east) ? m.east : "BTN_EAST",
        south: BUTTON_SET.has(m.south) ? m.south : "BTN_SOUTH",
      };
      const lbls = raw.labels && typeof raw.labels === "object" ? raw.labels : {};
      base.labels = {
        north: str(lbls.north, "Y", 4),
        west: str(lbls.west, "X", 4),
        east: str(lbls.east, "B", 4),
        south: str(lbls.south, "A", 4),
      };
    } else if (type === "trigger") {
      if (!AXIS_SET.has(map.code)) continue;
      base.map = { code: map.code };
    } else if (type === "action") {
      if (!ACTION_SET.has(map.action)) continue;
      base.map = { action: map.action };
      if (typeof raw.shape === "string" && SHAPE_OPTIONS.includes(raw.shape)) {
        base.shape = raw.shape;
      }
    } else if (type === "island") {
      base.shape = typeof raw.shape === "string" && SHAPE_OPTIONS.includes(raw.shape) ? raw.shape : "clover";
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
      } else if (type === "dpad") {
        if (typeof raw.shape === "string" && SHAPE_OPTIONS.includes(raw.shape)) {
          base.shape = raw.shape;
        }
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
