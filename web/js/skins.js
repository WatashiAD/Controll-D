/* UI Skinning & Background Customization System for Controll-D.
 *
 * Allows users and community creators to import/export skins, set custom
 * background images/gradients, and share theme configurations.
 */

import { applyColors, DEFAULT_PRIMARY, DEFAULT_SECONDARY } from "./theme.js";
import { saveSettings } from "./settings.js";

export const BUILTIN_SKINS = [
  {
    id: "expressive",
    name: "Material Expressive",
    author: "Controll-D",
    colors: { primary: "#655095", secondary: "#d0bcff", bg: "#383838" },
    buttonStyle: "xbox",
    shape: "cookie",
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk Volt",
    author: "Controll-D",
    colors: { primary: "#2b2d42", secondary: "#fcee0a", bg: "#111216" },
    buttonStyle: "xbox",
    shape: "cookie",
  },
  {
    id: "playstation",
    name: "PlayStation Blue",
    author: "Sony",
    colors: { primary: "#0b3954", secondary: "#48cae4", bg: "#1e2029" },
    buttonStyle: "playstation",
    shape: "cookie",
  },
  {
    id: "switch-neon",
    name: "Switch Joy-Con Neon",
    author: "Nintendo",
    colors: { primary: "#e60012", secondary: "#00b5e2", bg: "#1b1b1b" },
    buttonStyle: "nintendo",
    shape: "cookie",
  },
  {
    id: "obsidian",
    name: "Stealth Obsidian",
    author: "Controll-D",
    colors: { primary: "#212529", secondary: "#adb5bd", bg: "#121316" },
    buttonStyle: "xbox",
    shape: "cookie",
  },
  {
    id: "retro-gb",
    name: "Retro DMG GameBoy",
    author: "Retro",
    colors: { primary: "#8b1d43", secondary: "#9bbc0f", bg: "#8bac0f" },
    buttonStyle: "nintendo",
    shape: "cookie",
  },
];

/**
 * Applies custom stage background (solid color, gradient, or image URL/Data URL).
 */
export function applyStageBackground(bgStyle) {
  const stage = document.getElementById("stage");
  if (!stage) return;

  if (!bgStyle || bgStyle.type === "default") {
    stage.style.removeProperty("--stage-custom-bg");
    stage.classList.remove("has-custom-bg");
    return;
  }

  stage.classList.add("has-custom-bg");
  if (bgStyle.type === "image" && bgStyle.value) {
    stage.style.setProperty("--stage-custom-bg", `url("${bgStyle.value}")`);
  } else if (bgStyle.type === "gradient" && bgStyle.value) {
    stage.style.setProperty("--stage-custom-bg", bgStyle.value);
  } else if (bgStyle.type === "color" && bgStyle.value) {
    stage.style.setProperty("--stage-custom-bg", bgStyle.value);
  }
}

/**
 * Exports current active skin as a downloadable JSON file.
 */
export function exportCurrentSkin(settings, skinName = "custom-skin") {
  const bundle = {
    controllDSkin: 1,
    name: skinName,
    created: new Date().toISOString(),
    theme: {
      colorPrimary: settings.colorPrimary || DEFAULT_PRIMARY,
      colorSecondary: settings.colorSecondary || DEFAULT_SECONDARY,
    },
    background: settings.background || { type: "default" },
    buttonStyle: settings.buttonStyle || "xbox",
    shape: settings.defaultShape || "cookie",
  };

  const jsonStr = JSON.stringify(bundle, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${skinName.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}.controll-d-skin.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Imports a skin bundle from JSON text or object.
 */
export function parseSkinJSON(raw) {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!data || typeof data !== "object") return null;

    const colors = data.theme || data.colors || {};
    return {
      name: data.name || "Imported Skin",
      colorPrimary: colors.colorPrimary || colors.primary || DEFAULT_PRIMARY,
      colorSecondary: colors.colorSecondary || colors.secondary || DEFAULT_SECONDARY,
      background: data.background || { type: "default" },
      buttonStyle: data.buttonStyle || "xbox",
      shape: data.shape || "cookie",
    };
  } catch {
    return null;
  }
}

/**
 * Community Skinning Instructions Guide HTML
 */
export const SKINNING_GUIDE_HTML = `
  <div class="skinning-guide">
    <h4>🎨 Controll-D Skinning Guide</h4>
    <p>Anyone can build custom skins for Controll-D! Skins customize colors, wallpaper backgrounds, button glyphs, and shapes.</p>

    <h5>1. Skin File Format (.json)</h5>
    <pre><code>{
  "controllDSkin": 1,
  "name": "My Custom Theme",
  "theme": {
    "colorPrimary": "#2b2d42",
    "colorSecondary": "#fcee0a"
  },
  "background": {
    "type": "image",
    "value": "data:image/jpeg;base64,..."
  },
  "buttonStyle": "xbox",
  "shape": "cookie"
}</code></pre>

    <h5>2. Supported Properties</h5>
    <ul>
      <li><strong>colorPrimary</strong>: Color of face buttons, D-pad, and borders.</li>
      <li><strong>colorSecondary</strong>: Color of labels, analog stick knobs, and active glow.</li>
      <li><strong>background</strong>: <code>"default"</code>, <code>"color"</code>, <code>"gradient"</code>, or <code>"image"</code> (base64 Data URL or direct URL).</li>
      <li><strong>buttonStyle</strong>: <code>"xbox"</code> (A/B/X/Y), <code>"playstation"</code> (✕/●/■/▲), or <code>"nintendo"</code>.</li>
      <li><strong>shape</strong>: <code>"cookie"</code> (4-sided cookie), <code>"squircle"</code>, <code>"circle"</code>, <code>"pill"</code>, etc.</li>
    </ul>

    <h5>3. Sharing with Community</h5>
    <p>Export your skin using the button below and share your <code>.controll-d-skin.json</code> file with other players or submit it to the repository!</p>
  </div>
`;
