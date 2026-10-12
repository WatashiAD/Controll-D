/* Persistent settings + layout storage. */

const SETTINGS_KEY = "cotrll.v1.settings";
const LAYOUTS_KEY = "cotrll.v1.layouts";

export const DEFAULT_SETTINGS = {
  buttonStyle: "xbox",   // "xbox" | "playstation" | "nintendo"
  colorPrimary: "#655095",
  colorSecondary: "#d0bcff",
  haptics: true,
  hapticsStrength: 70,
  rumble: true,
  showRtt: true,
  deadzone: 10,          // global deadzone percent
  autoFullscreen: true,  // re-enter fullscreen on every tap
  layoutName: "expressive",
  telemetry: true,       // anonymous live community tracking
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
  const stored = readJSON(SETTINGS_KEY, {});
  const res = { ...DEFAULT_SETTINGS, ...(stored && typeof stored === "object" ? stored : {}) };
  if (!res.buttonStyle) res.buttonStyle = DEFAULT_SETTINGS.buttonStyle;
  if (!res.colorPrimary) res.colorPrimary = DEFAULT_SETTINGS.colorPrimary;
  if (!res.colorSecondary) res.colorSecondary = DEFAULT_SETTINGS.colorSecondary;
  // Migrate existing devices to expressive layout if they have older version
  if (!stored || !stored._v || stored._v < 4) {
    res.colorPrimary = DEFAULT_SETTINGS.colorPrimary;
    res.colorSecondary = DEFAULT_SETTINGS.colorSecondary;
    res.layoutName = "expressive";
    res._v = 4;
    saveSettings(res);
    const layouts = loadLayouts();
    if (layouts.expressive) {
      delete layouts.expressive;
      saveLayouts(layouts);
    }
  }
  return res;
}

export function saveSettings(settings) {
  writeJSON(SETTINGS_KEY, settings);
}

export function loadLayouts() {
  const stored = readJSON(LAYOUTS_KEY, {});
  return stored && typeof stored === "object" ? stored : {};
}

export function saveLayouts(layouts) {
  writeJSON(LAYOUTS_KEY, layouts);
}
