/* App bootstrap: screens, HUD, settings, editor glue. */

import "../vendor/material-web/material-web.esm.js"; // Official Material 3 web components (@material/web)
import { loadSettings, saveSettings } from "./settings.js";
import { Transport } from "./transport.js";
import * as haptics from "./haptics.js";
import { applyColors, DEFAULT_PRIMARY, DEFAULT_SECONDARY } from "./theme.js";
import { autoFullscreen, isFullscreen, toggleFullscreen } from "./screen.js";
import { Stage } from "./controls.js";
import { defaultLayout, sanitizeLayout, listLayouts, LAYOUT_VERSION, PRESET_TITLES, applyButtonStyleToLayout, BUTTON_STYLES } from "./layout.js";
import { Editor } from "./editor.js";
import { ColorPicker } from "./color-picker.js";
import { BUILTIN_SKINS, applyStageBackground, exportCurrentSkin, parseSkinJSON, SKINNING_GUIDE_HTML } from "./skins.js";

const $ = (id) => document.getElementById(id);

const settings = loadSettings();
haptics.configure(settings);
applyColors(settings.colorPrimary, settings.colorSecondary);
applyStageBackground(settings.background);

const transport = new Transport();
const stage = new Stage($("stage"), {
  transport,
  haptics,
  settings: () => settings,
});

const app = {
  dirty: false,
  layoutName: settings.layoutName || "default",
  storeLayoutName(name) {
    settings.layoutName = name;
    saveSettings(settings);
  },
  getSnapEnabled() {
    return settings.snapEnabled !== false;
  },
  setSnapEnabled(v) {
    settings.snapEnabled = v;
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
  app.layoutName = fresh ? layout.name : (settings.layoutName || "default");
  applyButtonStyleToLayout(layout, settings.buttonStyle || "nintendo");
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

  const pill = $("rtt-pill");
  if (status === "on") {
    showController();
    if (transport.rtt != null) {
      pill.textContent = `${Math.round(transport.rtt)} ms`;
      pill.hidden = !settings.showRtt;
    } else {
      pill.hidden = !settings.showRtt;
    }
  } else if (status === "reconnecting" || status === "connecting") {
    pill.hidden = false;
    pill.innerHTML = '<span class="dot-loader"><span></span><span></span><span></span></span>';
  } else if (status === "error") {
    pill.hidden = true;
    banner(`Connection failed (${text || "error"}) — retrying…`);
  } else if (status === "kicked") {
    pill.hidden = true;
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
      if (chosen === "xbox" || chosen === "playstation" || chosen === "nintendo") {
        settings.buttonStyle = chosen;
        if (buttonStyleSelect) buttonStyleSelect.value = chosen;
        saveSettings(settings);
      }
      applyButtonStyleToLayout(l, settings.buttonStyle || "xbox");
      stage.load(l);
      app.storeLayoutName(chosen);
      app.layoutName = chosen;
      editor.refreshLayoutSelect(chosen);
      banner(`Preset: ${PRESET_TITLES[chosen] || chosen}`);
    }
  });
}

/* controller button style (Xbox / PlayStation / Nintendo Switch) */
const buttonStyleSelect = $("settings-button-style");
function applyActiveButtonStyle(styleName = settings.buttonStyle) {
  const current = stage.toJSON(app.layoutName);
  applyButtonStyleToLayout(current, styleName);
  stage.load(current);
}

if (buttonStyleSelect) {
  buttonStyleSelect.value = settings.buttonStyle || "xbox";
  buttonStyleSelect.addEventListener("change", () => {
    const chosen = buttonStyleSelect.value;
    settings.buttonStyle = chosen;
    saveSettings(settings);
    applyActiveButtonStyle(chosen);
    const title = (BUTTON_STYLES[chosen] && BUTTON_STYLES[chosen].title) || chosen;
    banner(`Buttons: ${title}`);
  });
}

/* settings tabs navigation */
const settingsTabs = $("settings-tabs");
const settingsPanels = [
  $("panel-controls"),
  $("panel-input"),
  $("panel-about"),
];

if (settingsTabs) {
  settingsTabs.addEventListener("change", () => {
    const activeIdx = Number(settingsTabs.activeTabIndex) || 0;
    settingsPanels.forEach((p, idx) => {
      if (p) p.hidden = idx !== activeIdx;
    });
  });
}

/* custom in-app color picker */
const cpRoot = $("custom-color-picker-root");
if (cpRoot) {
  new ColorPicker(cpRoot, {
    initialPrimary: settings.colorPrimary || DEFAULT_PRIMARY,
    initialSecondary: settings.colorSecondary || DEFAULT_SECONDARY,
    onChange: ({ primary, secondary }) => {
      settings.colorPrimary = primary;
      settings.colorSecondary = secondary;
      saveSettings(settings);
      applyColors(primary, secondary);
    },
  });
}

/* UI Skins & Custom Background */
const skinSelect = $("settings-skin-select");
if (skinSelect) {
  skinSelect.innerHTML =
    BUILTIN_SKINS.map((s) => `<md-select-option value="${s.id}"><div slot="headline">${s.name}</div></md-select-option>`).join("") +
    `<md-select-option value="custom"><div slot="headline">Custom</div></md-select-option>`;
  skinSelect.value = settings.skinPreset || "expressive";
  skinSelect.addEventListener("change", () => {
    const chosen = skinSelect.value;
    const found = BUILTIN_SKINS.find((s) => s.id === chosen);
    if (found) {
      settings.skinPreset = found.id;
      settings.colorPrimary = found.colors.primary;
      settings.colorSecondary = found.colors.secondary;
      settings.buttonStyle = found.buttonStyle;
      settings.defaultShape = found.shape;
      applyColors(found.colors.primary, found.colors.secondary);
      applyActiveButtonStyle(found.buttonStyle);
      if (buttonStyleSelect) buttonStyleSelect.value = found.buttonStyle;
      saveSettings(settings);
      banner(`Skin: ${found.name}`);
    }
  });
}

const bgFileInput = $("skin-bg-file");
const bgUploadBtn = $("btn-upload-bg");
const bgResetBtn = $("btn-reset-bg");

if (bgUploadBtn && bgFileInput) {
  bgUploadBtn.addEventListener("click", () => bgFileInput.click());
  bgFileInput.addEventListener("change", () => {
    const file = bgFileInput.files && bgFileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      settings.background = { type: "image", value: e.target.result };
      saveSettings(settings);
      applyStageBackground(settings.background);
      banner("Custom background applied");
    };
    reader.readAsDataURL(file);
  });
}

if (bgResetBtn) {
  bgResetBtn.addEventListener("click", () => {
    settings.background = { type: "default" };
    saveSettings(settings);
    applyStageBackground(settings.background);
    banner("Background reset to default");
  });
}

const exportBtn = $("btn-export-skin");
if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    exportCurrentSkin(settings, `controll-d-${settings.skinPreset || "skin"}`);
    banner("Skin exported");
  });
}

const importBtn = $("btn-import-skin");
const importFileInput = $("skin-import-file");
if (importBtn && importFileInput) {
  importBtn.addEventListener("click", () => importFileInput.click());
  importFileInput.addEventListener("change", () => {
    const file = importFileInput.files && importFileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const imported = parseSkinJSON(e.target.result);
      if (!imported) {
        banner("Invalid skin JSON file");
        return;
      }
      settings.skinPreset = "custom";
      if (skinSelect) skinSelect.value = "custom";
      settings.colorPrimary = imported.colorPrimary;
      settings.colorSecondary = imported.colorSecondary;
      settings.buttonStyle = imported.buttonStyle;
      settings.defaultShape = imported.shape;
      settings.background = imported.background;
      saveSettings(settings);

      applyColors(imported.colorPrimary, imported.colorSecondary);
      applyStageBackground(imported.background);
      applyActiveButtonStyle(imported.buttonStyle);
      if (buttonStyleSelect) buttonStyleSelect.value = imported.buttonStyle;
      banner(`Skin loaded: ${imported.name}`);
    };
    reader.readAsText(file);
  });
}

const guideModal = $("skin-guide-dialog");
const guideOpenBtn = $("btn-open-skin-guide");
const guideCloseBtn = $("skin-guide-close");
const guideContent = $("skin-guide-content");

if (guideOpenBtn && guideModal) {
  guideOpenBtn.addEventListener("click", () => {
    if (guideContent) guideContent.innerHTML = SKINNING_GUIDE_HTML;
    void guideModal.show();
  });
}
if (guideCloseBtn && guideModal) {
  guideCloseBtn.addEventListener("click", () => {
    void guideModal.close();
  });
}

/* ---------------- landscape rotation hint ---------------- */
const rotateHint = $("rotate-hint");
const rotateClose = $("rotate-hint-close");
if (rotateClose && rotateHint) {
  rotateClose.addEventListener("click", () => {
    rotateHint.setAttribute("data-dismissed", "true");
  });
}

/* ---------------- update check ---------------- */
async function checkForUpdates() {
  try {
    const res = await fetch("/api/check-update");
    if (!res.ok) return;
    const data = await res.json();
    if (data.updateAvailable) {
      const badge = $("update-badge");
      if (badge) {
        badge.hidden = false;
        badge.title = `Update available (${data.behind || 1} commit(s) behind). Run: npm run update`;
        badge.addEventListener("click", () => {
          banner("Update available! Run 'npm run update' in terminal on the host PC.", 5000);
        });
      }
    }
  } catch {
    /* LAN-only or offline */
  }
}
checkForUpdates();

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
bindSwitch("opt-telemetry", "telemetry");
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
window.__controll = { stage, transport, settings, app };
window.__cotrll = window.__controll;
