/* Persistent settings + layout storage. */

const SETTINGS_KEY = "controll.v1.settings";
const LAYOUTS_KEY = "controll.v1.layouts";
const LEGACY_SETTINGS_KEY = "cotrll.v1.settings";
const LEGACY_LAYOUTS_KEY = "cotrll.v1.layouts";

export const DEFAULT_SETTINGS = {
  buttonStyle: "xbox",   // "xbox" | "playstation" | "nintendo"
  colorPrimary: "#655095",
  colorSecondary: "#d0bcff",
  defaultShape: "cookie",// "cookie" | "squircle" | "circle" | "pill"
  background: { type: "default" },
  haptics: true,
  hapticsStrength: 70,
  rumble: true,
  showRtt: true,
  deadzone: 10,          // global deadzone percent
  autoFullscreen: true,  // re-enter fullscreen on every tap
  layoutName: "default", // default layout
  telemetry: true,       // anonymous live community tracking
  snapEnabled: true,     // magnetic alignment snapping
  snapGridStep: 2.5,     // grid snap increment
};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / private mode — settings just won't persist */
  }
}

export function loadSettings() {
  let stored = readJSON(SETTINGS_KEY, null);
  if (!stored) {
    stored = readJSON(LEGACY_SETTINGS_KEY, {});
  }
  const res = { ...DEFAULT_SETTINGS, ...(stored && typeof stored === "object" ? stored : {}) };
  if (!res.buttonStyle) res.buttonStyle = DEFAULT_SETTINGS.buttonStyle;
  if (!res.colorPrimary) res.colorPrimary = DEFAULT_SETTINGS.colorPrimary;
  if (!res.colorSecondary) res.colorSecondary = DEFAULT_SETTINGS.colorSecondary;
  if (!res.layoutName) res.layoutName = DEFAULT_SETTINGS.layoutName;
  return res;
}

export function saveSettings(settings) {
  writeJSON(SETTINGS_KEY, settings);
}

export function loadLayouts() {
  let stored = readJSON(LAYOUTS_KEY, null);
  if (!stored) {
    stored = readJSON(LEGACY_LAYOUTS_KEY, {});
  }
  return stored && typeof stored === "object" ? stored : {};
}

export function saveLayouts(layouts) {
  writeJSON(LAYOUTS_KEY, layouts);
}
