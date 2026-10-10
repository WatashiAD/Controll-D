/* Whitelisted evdev codes exposed to the layout editor.
   Must stay in sync with server/gamepad.py. */

export const BUTTON_CODES = [
  ["BTN_SOUTH", "A / Cross"],
  ["BTN_EAST", "B / Circle"],
  ["BTN_NORTH", "Y / Triangle"],
  ["BTN_WEST", "X / Square"],
  ["BTN_TL", "LB / L1"],
  ["BTN_TR", "RB / R1"],
  ["BTN_TL2", "LT (digital)"],
  ["BTN_TR2", "RT (digital)"],
  ["BTN_SELECT", "View / Share"],
  ["BTN_START", "Menu / Options"],
  ["BTN_MODE", "Guide / PS"],
  ["BTN_THUMBL", "L3"],
  ["BTN_THUMBR", "R3"],
];

export const AXIS_CODES = [
  ["ABS_X", "Left stick X"],
  ["ABS_Y", "Left stick Y"],
  ["ABS_RX", "Right stick X"],
  ["ABS_RY", "Right stick Y"],
  ["ABS_Z", "LT (analog)"],
  ["ABS_RZ", "RT (analog)"],
  ["ABS_HAT0X", "D-pad X"],
  ["ABS_HAT0Y", "D-pad Y"],
];

export const BUTTON_SET = new Set(BUTTON_CODES.map(([c]) => c));
export const AXIS_SET = new Set(AXIS_CODES.map(([c]) => c));

const BUTTON_SHORT = {
  BTN_SOUTH: "A",
  BTN_EAST: "B",
  BTN_NORTH: "Y",
  BTN_WEST: "X",
  BTN_TL: "LB",
  BTN_TR: "RB",
  BTN_TL2: "LT",
  BTN_TR2: "RT",
  BTN_SELECT: "−",
  BTN_START: "+",
  BTN_MODE: "HOME",
  BTN_THUMBL: "L3",
  BTN_THUMBR: "R3",
};

export function shortButtonLabel(code) {
  return BUTTON_SHORT[code] || code;
}

export function optionsHTML(codes) {
  return codes
    .map(([code, label]) => `<option value="${code}">${label} · ${code}</option>`)
    .join("");
}
