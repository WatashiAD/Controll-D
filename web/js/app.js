/* App bootstrap: screens, HUD, settings, editor glue. */

import "../vendor/material-web/material-web.esm.js"; // Official Material 3 web components (@material/web)
import { loadSettings, saveSettings } from "./settings.js";
import { Transport } from "./transport.js";
import * as haptics from "./haptics.js";
import { applyTheme, THEMES } from "./theme.js";
import { autoFullscreen, isFullscreen, toggleFullscreen } from "./screen.js";
import { Stage } from "./controls.js";
import { defaultLayout, sanitizeLayout, listLayouts, LAYOUT_VERSION, PRESET_TITLES } from "./layout.js";
import { Editor } from "./editor.js";

const $ = (id) => document.getElementById(id);

const settings = loadSettings();
haptics.configure(settings);
applyTheme(settings.theme, settings.accent);

const transport = new Transport();
const stage = new Stage($("stage"), {
  transport,
  haptics,
  settings: () => settings,
});

const app = {
  dirty: false,
  layoutName: settings.layoutName || "expressive",
  storeLayoutName(name) {
    settings.layoutName = name;
    saveSettings(settings);
  },
  banner,
  exitEditor,
};

/* ---------------- banner (M3 Expressive toast) ---------------- */

let bannerTimer = null;
function banner(text, ms = 2600) {
  const el = $("banner");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    el.classList.remove("show");
  }, ms);
}

/* ---------------- layout ---------------- */

function loadCurrentLayout() {
  const layouts = listLayouts();
  const stored = layouts[app.layoutName];
  /* Migrate once: pre-Switch layouts (older version) fall back to default. */
  const fresh = stored && stored.version === LAYOUT_VERSION ? stored : null;
  const layout = sanitizeLayout(fresh) || defaultLayout();
  app.layoutName = fresh ? layout.name : "expressive";
  stage.load(layout);
}
loadCurrentLayout();

/* ---------------- connection (no pairing — open the URL and play) ---------------- */

const appEl = $("app");

function showController() {
  appEl.hidden = false;
  requestAnimationFrame(() => stage.relayout());
}

showController();
autoFullscreen(() => settings.autoFullscreen !== false);
transport.connect();

/* ---------------- transport wiring ---------------- */

transport.addEventListener("status", (e) => {
  const { status, text } = e.detail;

  const dot = $("status-dot");
  dot.className = "dot";
  if (status === "on") dot.classList.add("ok");
  else if (status === "reconnecting" || status === "connecting") dot.classList.add("warn");
  else if (status === "error" || status === "kicked") dot.classList.add("err");
  $("status-text").textContent = text || status;

  if (status === "on") {
    showController();
    if (transport.rtt == null) $("rtt-pill").hidden = !settings.showRtt;
  } else if (status === "error") {
    banner(`Connection failed (${text || "error"}) — retrying…`);
  } else if (status === "kicked") {
    showController();
    banner("This phone was disconnected — another controller took over", 4000);
    $("status-dot").className = "dot err";
  }
});

transport.addEventListener("rtt", (e) => {
  const pill = $("rtt-pill");
  pill.hidden = !settings.showRtt;
  pill.textContent = `${Math.round(e.detail)} ms`;
});

transport.addEventListener("rumble", (e) => {
  haptics.gameRumble(e.detail.i, e.detail.d);
});

transport.addEventListener("kick", () => {
  banner("Controller taken over — use Settings → Reconnect to take it back", 4000);
});

transport.addEventListener("ready", () => {
  haptics.success();
});

/* release keys when the tab hides / page unloads */
document.addEventListener("visibilitychange", () => {
  if (document.hidden) transport.neutralize();
});
window.addEventListener("pagehide", () => transport.neutralize());

/* ---------------- editor ---------------- */

const editor = new Editor(stage, app);

function syncEditBtn() {
  const btn = $("btn-edit-settings");
  if (!btn) return;
  btn.classList.toggle("toggle", stage.editMode);
  btn.textContent = stage.editMode ? "Done" : "Edit";
}

function enterEditor() {
  stage.setEditMode(true);
  editor.enter();
  syncEditBtn();
}

function exitEditor() {
  stage.setEditMode(false);
  editor.exit();
  syncEditBtn();
  syncPresetSelect();
  if (app.dirty) {
    app.dirty = false;
  }
}

/* ---------------- HUD controls & settings dialog ---------------- */

const fsBtn = $("btn-fullscreen");
if (fsBtn) {
  const syncFsBtn = () => {
    const fs = isFullscreen();
    const enterSvg = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`;
    const exitSvg = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>`;
    fsBtn.innerHTML = fs ? exitSvg : enterSvg;
  };
  fsBtn.addEventListener("click", () => {
    toggleFullscreen();
  });
  document.addEventListener("fullscreenchange", syncFsBtn);
  document.addEventListener("webkitfullscreenchange", syncFsBtn);
  syncFsBtn();
}

const modal = $("settings-modal");

const settingsBtn = $("btn-settings");
if (settingsBtn) {
  settingsBtn.addEventListener("click", () => {
    syncEditBtn();
    syncPresetSelect();
    void modal.show();
  });
}
$("btn-edit-settings").addEventListener("click", () => {
  if (stage.editMode) {
    exitEditor();
  } else {
    void modal.close();
    enterEditor();
  }
});
$("settings-close").addEventListener("click", () => {
  void modal.close();
});

/* layout presets in settings dialog */
const presetSelect = $("settings-preset-select");
function syncPresetSelect() {
  if (!presetSelect) return;
  const layouts = listLayouts();
  const names = Object.keys(layouts);
  const order = ["expressive", "default", "playstation", "xbox", "retro"];
  names.sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
  presetSelect.innerHTML =
    names.map((n) => {
      const title = (PRESET_TITLES && PRESET_TITLES[n]) || n;
      return `<md-select-option value="${n}"><div slot="headline">${title}</div></md-select-option>`;
    }).join("");
  presetSelect.value = app.layoutName || "expressive";
}

if (presetSelect) {
  syncPresetSelect();
  presetSelect.addEventListener("change", () => {
    const chosen = presetSelect.value;
    const layouts = listLayouts();
    const l = sanitizeLayout(layouts[chosen]);
    if (l) {
      stage.load(l);
      app.storeLayoutName(chosen);
      app.layoutName = chosen;
      editor.refreshLayoutSelect(chosen);
      banner(`Preset: ${PRESET_TITLES[chosen] || chosen}`);
    }
  });
}

/* themes */
const themeList = $("theme-list");
function renderThemes() {
  themeList.innerHTML = "";
  for (const [id, label] of THEMES) {
    const btn = document.createElement("button");
    btn.className = "theme-chip" + (settings.theme === id ? " active" : "");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      settings.theme = id;
      saveSettings(settings);
      applyTheme(settings.theme, settings.accent);
      renderThemes();
    });
    themeList.appendChild(btn);
  }
}
renderThemes();

const accentInput = $("accent-input");
accentInput.value = settings.accent || "#39ff88";
accentInput.addEventListener("input", () => {
  settings.accent = accentInput.value;
  saveSettings(settings);
  applyTheme(settings.theme, settings.accent);
});

/* options (md-switch / md-slider) */
function bindSwitch(id, key, after) {
  const el = $(id);
  if (!el) return;
  el.selected = !!settings[key];
  el.addEventListener("change", () => {
    settings[key] = !!el.selected;
    saveSettings(settings);
    if (after) after(settings[key]);
  });
}

bindSwitch("opt-haptics", "haptics", () => haptics.configure(settings));
bindSwitch("opt-rumble", "rumble", () => haptics.configure(settings));
bindSwitch("opt-autofs", "autoFullscreen");
bindSwitch("opt-show-rtt", "showRtt", () => {
  $("rtt-pill").hidden = !settings.showRtt;
});

const strengthInput = $("opt-haptics-strength");
strengthInput.value = settings.hapticsStrength;
strengthInput.addEventListener("input", () => {
  settings.hapticsStrength = Math.round(Number(strengthInput.value));
  saveSettings(settings);
  haptics.configure(settings);
});

const deadzoneInput = $("opt-deadzone");
deadzoneInput.value = settings.deadzone;
deadzoneInput.addEventListener("input", () => {
  settings.deadzone = Math.round(Number(deadzoneInput.value));
  saveSettings(settings);
});

$("conn-host").textContent = location.host;
$("btn-disconnect").addEventListener("click", () => {
  void modal.close();
  banner("Reconnecting…");
  transport.disconnect();
  setTimeout(() => transport.connect(), 400);
});

/* ---------------- battery (best effort) ---------------- */

const BOLT_ICON = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>`;

if (navigator.getBattery) {
  navigator.getBattery().then((bat) => {
    const pill = $("batt-pill");
    const update = () => {
      pill.hidden = false;
      pill.innerHTML = `${Math.round(bat.level * 100)}%${bat.charging ? BOLT_ICON : ""}`;
    };
    update();
    bat.addEventListener("levelchange", update);
    bat.addEventListener("chargingchange", update);
  }).catch(() => {});
}

/* debug/test hook */
window.__cotrll = { stage, transport, settings, app };
