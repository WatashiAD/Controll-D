/* Vector icons, SVG paths, and geometry utilities for controls. */

export const ACTION_OPTIONS = [["fullscreen", "Fullscreen"]];
export const ACTION_SET = new Set(ACTION_OPTIONS.map(([a]) => a));
export const STICK_PAIRS = [["ABS_X", "ABS_Y"], ["ABS_RX", "ABS_RY"]];

export const ACTION_ICON = `<svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`;
export const ACTION_EXIT_ICON = `<svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>`;

export const SHAPE_ICONS = {
  /* System / menu icons */
  "⌂": `<svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11.5 12 4.5l8 7V20a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 20z"/><path d="M9.5 21.5v-4.5a2.5 2.5 0 0 1 5 0v4.5"/></svg>`,
  "−": `<svg viewBox="0 0 24 24" width="50%" height="50%" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  "-": `<svg viewBox="0 0 24 24" width="50%" height="50%" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  "+": `<svg viewBox="0 0 24 24" width="50%" height="50%" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  "⛶": ACTION_ICON,
  "fullscreen": ACTION_ICON,
  "share": `<svg viewBox="0 0 24 24" width="50%" height="50%" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="10" height="10" rx="1.5"/><rect x="10" y="10" width="10" height="10" rx="1.5"/></svg>`,
  "options": `<svg viewBox="0 0 24 24" width="50%" height="50%" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="7" x2="19" y2="7"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="5" y1="17" x2="19" y2="17"/></svg>`,
  "view": `<svg viewBox="0 0 24 24" width="50%" height="50%" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="10" height="10" rx="1.5"/><rect x="10" y="10" width="10" height="10" rx="1.5"/></svg>`,
  "menu": `<svg viewBox="0 0 24 24" width="50%" height="50%" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="7" x2="19" y2="7"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="5" y1="17" x2="19" y2="17"/></svg>`,
  "OPTIONS": `<svg viewBox="0 0 24 24" width="50%" height="50%" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="7" x2="19" y2="7"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="5" y1="17" x2="19" y2="17"/></svg>`,
  "SHARE": `<svg viewBox="0 0 24 24" width="50%" height="50%" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="10" height="10" rx="1.5"/><rect x="10" y="10" width="10" height="10" rx="1.5"/></svg>`,
  "VIEW": `<svg viewBox="0 0 24 24" width="50%" height="50%" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="10" height="10" rx="1.5"/><rect x="10" y="10" width="10" height="10" rx="1.5"/></svg>`,
  "MENU": `<svg viewBox="0 0 24 24" width="50%" height="50%" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="7" x2="19" y2="7"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="5" y1="17" x2="19" y2="17"/></svg>`,
};

export const DPAD_ARROWS = {
  up: `<svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg>`,
  down: `<svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 10 6 6 6-6"/></svg>`,
  left: `<svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>`,
  right: `<svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg>`,
};

export const FLOWER_PATH = "M 50.00 2.00 C 55.58 2.00, 59.01 10.65, 65.23 13.23 C 71.45 15.81, 79.99 12.11, 83.94 16.06 C 87.89 20.01, 84.19 28.55, 86.77 34.77 C 89.35 40.99, 98.00 44.42, 98.00 50.00 C 98.00 55.58, 89.35 59.01, 86.77 65.23 C 84.19 71.45, 87.89 79.99, 83.94 83.94 C 79.99 87.89, 71.45 84.19, 65.23 86.77 C 59.01 89.35, 55.58 98.00, 50.00 98.00 C 44.42 98.00, 40.99 89.35, 34.77 86.77 C 28.55 84.19, 20.01 87.89, 16.06 83.94 C 12.11 79.99, 15.81 71.45, 13.23 65.23 C 10.65 59.01, 2.00 55.58, 2.00 50.00 C 2.00 44.42, 10.65 40.99, 13.23 34.77 C 15.81 28.55, 12.11 20.01, 16.06 16.06 C 20.01 12.11, 28.55 15.81, 34.77 13.23 C 40.99 10.65, 44.42 2.00, 50.00 2.00 Z";

export const CLOVER_PATH = "M 25 25 C 29 14, 38 1, 50 1 C 62 1, 71 14, 75 25 C 86 29, 99 38, 99 50 C 99 62, 86 71, 75 75 C 71 86, 62 99, 50 99 C 38 99, 29 86, 25 75 C 14 71, 1 62, 1 50 C 1 38, 14 29, 25 25 Z";
export const COOKIE_PATH = CLOVER_PATH;

export function createShapeSvg(path, className) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("class", className);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `<path d="${path}"/>`;
  return svg;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function applyDeadzone(x, y, dz) {
  const len = Math.hypot(x, y);
  if (len < dz || len === 0) return [0, 0];
  const scaled = Math.min(1, (len - dz) / (1 - dz));
  return [(x / len) * scaled, (y / len) * scaled];
}
