/* Custom in-app color picker for Cotrll-D.
 *
 * Avoids native OS color pickers that break fullscreen and feel jarring on mobile.
 * Features curated gaming presets, HSL tuning sliders, hex input, and live preview.
 */

import { DEFAULT_PRIMARY, DEFAULT_SECONDARY } from "./theme.js";

export const PRESET_PALETTES = [
  { name: "Expressive Purple", primary: "#655095", secondary: "#d0bcff" },
  { name: "PlayStation Blue", primary: "#0b3954", secondary: "#48cae4" },
  { name: "Xbox Green", primary: "#107c10", secondary: "#70e000" },
  { name: "Switch Neon", primary: "#e60012", secondary: "#00b5e2" },
  { name: "Cyberpunk Volt", primary: "#2b2d42", secondary: "#fcee0a" },
  { name: "Crimson Blaze", primary: "#780000", secondary: "#ff8fab" },
  { name: "Oceanic Teal", primary: "#004e64", secondary: "#25a18e" },
  { name: "Sunset Amber", primary: "#9d0208", secondary: "#faa307" },
  { name: "Midnight Stealth", primary: "#212529", secondary: "#adb5bd" },
];

export function hexToHsl(hex) {
  let c = (hex || "").replace("#", "").trim();
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  if (c.length !== 6) return { h: 260, s: 50, l: 50 };
  const num = parseInt(c, 16);
  if (Number.isNaN(num)) return { h: 260, s: 50, l: 50 };

  const r = (num >> 16) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hslToHex(h, s, l) {
  const normS = Math.max(0, Math.min(100, s)) / 100;
  const normL = Math.max(0, Math.min(100, l)) / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = normS * Math.min(normL, 1 - normL);
  const f = (n) => normL - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export class ColorPicker {
  constructor(rootEl, { initialPrimary, initialSecondary, onChange }) {
    this.root = rootEl;
    this.primary = initialPrimary || DEFAULT_PRIMARY;
    this.secondary = initialSecondary || DEFAULT_SECONDARY;
    this.activeTarget = "primary"; // "primary" | "secondary"
    this.onChange = onChange || (() => {});

    this.render();
    this.bindEvents();
    this.syncUI();
  }

  setColors(primary, secondary) {
    this.primary = primary || this.primary;
    this.secondary = secondary || this.secondary;
    this.syncUI();
  }

  render() {
    this.root.innerHTML = `
      <div class="cp-container">
        <!-- Target Selector & Live Controller Preview -->
        <div class="cp-targets">
          <button type="button" class="cp-target-btn active" data-target="primary">
            <span class="cp-target-swatch" id="cp-swatch-primary"></span>
            <div class="cp-target-label">
              <strong>Primary</strong>
              <small>Buttons & D-Pad</small>
            </div>
          </button>
          <button type="button" class="cp-target-btn" data-target="secondary">
            <span class="cp-target-swatch" id="cp-swatch-secondary"></span>
            <div class="cp-target-label">
              <strong>Secondary</strong>
              <small>Labels & Accent</small>
            </div>
          </button>
        </div>

        <!-- Curated Preset Palettes -->
        <div class="cp-section-label">Quick Themes</div>
        <div class="cp-palettes-grid">
          ${PRESET_PALETTES.map(
            (p) => `
            <button type="button" class="cp-palette-chip" data-primary="${p.primary}" data-secondary="${p.secondary}" title="${p.name}">
              <span class="cp-chip-split" style="background: linear-gradient(135deg, ${p.primary} 50%, ${p.secondary} 50%);"></span>
              <span class="cp-chip-name">${p.name}</span>
            </button>
          `,
          ).join("")}
        </div>

        <!-- Fine-Tuning Sliders -->
        <div class="cp-tuning-card">
          <div class="cp-section-label cp-tune-head">
            <span>Custom Color (<span id="cp-active-target-text">Primary</span>)</span>
            <input type="text" id="cp-hex-input" class="cp-hex-field" maxlength="7" spellcheck="false" placeholder="#000000">
          </div>

          <div class="cp-slider-row">
            <span class="cp-slider-name">Hue</span>
            <input type="range" id="cp-hue" min="0" max="360" step="1" class="cp-slider cp-hue-slider">
            <span class="cp-slider-val" id="cp-hue-val">0°</span>
          </div>

          <div class="cp-slider-row">
            <span class="cp-slider-name">Saturation</span>
            <input type="range" id="cp-sat" min="0" max="100" step="1" class="cp-slider cp-sat-slider">
            <span class="cp-slider-val" id="cp-sat-val">50%</span>
          </div>

          <div class="cp-slider-row">
            <span class="cp-slider-name">Lightness</span>
            <input type="range" id="cp-lit" min="10" max="90" step="1" class="cp-slider cp-lit-slider">
            <span class="cp-slider-val" id="cp-lit-val">50%</span>
          </div>

          <div class="cp-actions">
            <md-text-button id="cp-btn-reset">Reset to Default</md-text-button>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    // Target switching
    this.root.querySelectorAll(".cp-target-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.target;
        if (target && target !== this.activeTarget) {
          this.activeTarget = target;
          this.syncUI();
        }
      });
    });

    // Preset palette click
    this.root.querySelectorAll(".cp-palette-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        this.primary = chip.dataset.primary;
        this.secondary = chip.dataset.secondary;
        this.syncUI();
        this.emitChange();
      });
    });

    // Sliders
    const onSlider = () => {
      const h = Number(this.root.querySelector("#cp-hue").value);
      const s = Number(this.root.querySelector("#cp-sat").value);
      const l = Number(this.root.querySelector("#cp-lit").value);
      const hex = hslToHex(h, s, l);

      if (this.activeTarget === "primary") this.primary = hex;
      else this.secondary = hex;

      this.syncUI({ skipSliders: true });
      this.emitChange();
    };

    this.root.querySelector("#cp-hue").addEventListener("input", onSlider);
    this.root.querySelector("#cp-sat").addEventListener("input", onSlider);
    this.root.querySelector("#cp-lit").addEventListener("input", onSlider);

    // Hex field input
    const hexField = this.root.querySelector("#cp-hex-input");
    hexField.addEventListener("input", () => {
      let val = hexField.value.trim();
      if (!val.startsWith("#")) val = `#${val}`;
      if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        if (this.activeTarget === "primary") this.primary = val.toLowerCase();
        else this.secondary = val.toLowerCase();
        this.syncUI();
        this.emitChange();
      }
    });

    // Reset button
    this.root.querySelector("#cp-btn-reset").addEventListener("click", () => {
      this.primary = DEFAULT_PRIMARY;
      this.secondary = DEFAULT_SECONDARY;
      this.syncUI();
      this.emitChange();
    });
  }

  syncUI(opts = {}) {
    // Update target button active states
    this.root.querySelectorAll(".cp-target-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.target === this.activeTarget);
    });

    // Swatches
    const swatchPrimary = this.root.querySelector("#cp-swatch-primary");
    const swatchSecondary = this.root.querySelector("#cp-swatch-secondary");
    if (swatchPrimary) swatchPrimary.style.backgroundColor = this.primary;
    if (swatchSecondary) swatchSecondary.style.backgroundColor = this.secondary;

    // Active label
    const targetLabel = this.root.querySelector("#cp-active-target-text");
    if (targetLabel) {
      targetLabel.textContent = this.activeTarget === "primary" ? "Primary" : "Secondary";
    }

    const currentHex = this.activeTarget === "primary" ? this.primary : this.secondary;
    const hexField = this.root.querySelector("#cp-hex-input");
    if (hexField && document.activeElement !== hexField) {
      hexField.value = currentHex.toUpperCase();
    }

    const hsl = hexToHsl(currentHex);

    if (!opts.skipSliders) {
      const hueEl = this.root.querySelector("#cp-hue");
      const satEl = this.root.querySelector("#cp-sat");
      const litEl = this.root.querySelector("#cp-lit");
      if (hueEl) hueEl.value = hsl.h;
      if (satEl) satEl.value = hsl.s;
      if (litEl) litEl.value = hsl.l;
    }

    const hueVal = this.root.querySelector("#cp-hue-val");
    const satVal = this.root.querySelector("#cp-sat-val");
    const litVal = this.root.querySelector("#cp-lit-val");
    if (hueVal) hueVal.textContent = `${hsl.h}°`;
    if (satVal) satVal.textContent = `${hsl.s}%`;
    if (litVal) litVal.textContent = `${hsl.l}%`;

    // Dynamic slider gradient styling
    const satEl = this.root.querySelector("#cp-sat");
    if (satEl) {
      satEl.style.background = `linear-gradient(to right, hsl(${hsl.h}, 0%, ${hsl.l}%), hsl(${hsl.h}, 100%, ${hsl.l}%))`;
    }
    const litEl = this.root.querySelector("#cp-lit");
    if (litEl) {
      litEl.style.background = `linear-gradient(to right, #000, hsl(${hsl.h}, ${hsl.s}%, 50%), #fff)`;
    }
  }

  emitChange() {
    this.onChange({
      primary: this.primary,
      secondary: this.secondary,
    });
  }
}
