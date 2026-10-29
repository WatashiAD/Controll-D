/* Preset & background customization for Controll-D.
 *
 * Built-in color presets, stage backgrounds, and import/export of
 * shareable .controll-d-skin.json bundles.
 */

import { applyColors, DEFAULT_PRIMARY, DEFAULT_SECONDARY } from "./theme.js";

export const BUILTIN_SKINS = [
  {
    id: "cyberpunk",
    name: "Cyberpunk Volt",
    author: "Controll-D",
    colors: { primary: "#2b2d42", secondary: "#fcee0a", bg: "#111216" },
    buttonStyle: "xbox",
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
      buttonStyle: data.buttonStyle === "nintendo" ? "nintendo" : "xbox",
      shape: data.shape || "cookie",
    };
  } catch {
    return null;
  }
}

