/* Minimal floating editor: tap a control to tweak size + opacity.
   Small draggable card that never docks over the whole stage.
   Named layouts persist in localStorage and the last one is restored. */

import { listLayouts, persistLayout, sanitizeLayout, PRESET_TITLES } from "./layout.js";

const PANEL_KEY = "controll.v1.panel";
const LEGACY_PANEL_KEY = "cotrll.v1.panel";
const NEW_OPTION = "__new__";
const PANEL_W = 270;

function readPanelPos() {
  try {
    const raw = localStorage.getItem(PANEL_KEY) || localStorage.getItem(LEGACY_PANEL_KEY);
    const p = raw ? JSON.parse(raw) : null;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return p;
  } catch {
    /* ignore */
  }
  return null;
}

function writePanelPos(p) {
  try {
    localStorage.setItem(PANEL_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export class Editor {
  constructor(stage, app) {
    this.stage = stage;
    this.app = app;
    this.panel = document.getElementById("editor");
    this.props = document.getElementById("ed-props");
    this.select = document.getElementById("layout-select");
    this._drag = null;

    document.getElementById("ed-done").addEventListener("click", () => this.app.exitEditor());
    document.getElementById("layout-save").addEventListener("click", () => this.saveLayout());
    this.select.addEventListener("change", () => this.loadSelected());

    const snapBtn = document.getElementById("btn-toggle-snap");
    if (snapBtn) {
      this._syncSnapBtn();
      snapBtn.addEventListener("click", () => {
        const next = !this.app.getSnapEnabled();
        this.app.setSnapEnabled(next);
        this._syncSnapBtn();
        this.app.banner(next ? "Magnetic snapping on" : "Magnetic snapping off");
      });
    }

    this._initDrag();

    stage.onSelectionChange = () => this.renderProps();
    stage.onLayoutMutation = () => {
      this.syncSliders();
      this._autosave();
    };

    this.refreshLayoutSelect(app.layoutName);
  }

  _syncSnapBtn() {
    const snapBtn = document.getElementById("btn-toggle-snap");
    if (!snapBtn) return;
    const enabled = this.app.getSnapEnabled ? this.app.getSnapEnabled() : true;
    snapBtn.classList.toggle("active", enabled);
    snapBtn.style.color = enabled ? "var(--accent, #a8c7fa)" : "var(--txt-dim, #777)";
  }

  enter() {
    this.stage.setGrid(false);
    this.panel.hidden = false;
    this._placePanel();
    this._syncSnapBtn();
    this.refreshLayoutSelect(this.app.layoutName);
    this.renderProps();
    /* Re-assert: must stay visible while edit mode is on. */
    this.panel.hidden = false;
  }

  exit() {
    this._autosave();
    this.panel.hidden = true;
  }

  /* ---------------- floating panel drag ---------------- */

  _initDrag() {
    const handle = document.getElementById("ed-drag");
    handle.addEventListener("pointerdown", (e) => {
      if (e.target.closest("md-outlined-select,md-filled-button,md-text-button,md-outlined-button,md-slider,input,button")) return;
      e.preventDefault();
      const r = this.panel.getBoundingClientRect();
      this._drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });
    handle.addEventListener("pointermove", (e) => {
      if (!this._drag) return;
      e.preventDefault();
      this._movePanel(e.clientX - this._drag.dx, e.clientY - this._drag.dy);
    });
    const end = () => {
      this._drag = null;
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  _placePanel() {
    const saved = readPanelPos();
    if (saved) {
      this._movePanel(saved.x, saved.y);
    } else {
      this.panel.style.left = "";
      this.panel.style.right = "12px";
      this.panel.style.top = "42px";
    }
  }

  _movePanel(x, y) {
    const panelH = this.panel.offsetHeight || 200;
    const maxX = Math.max(0, window.innerWidth - PANEL_W - 8);
    const maxY = Math.max(8, window.innerHeight - panelH - 8);
    const cx = Math.max(8, Math.min(maxX, x));
    const cy = Math.max(8, Math.min(maxY, y));
    this.panel.style.right = "";
    this.panel.style.left = `${cx}px`;
    this.panel.style.top = `${cy}px`;
    writePanelPos({ x: cx, y: cy });
  }

  /* ---------------- property form (size + opacity only) ---------------- */

  renderProps() {
    const sel = this.stage.selected();
    if (!sel) {
      this.props.hidden = true;
      this.props.innerHTML = "";
      return;
    }
    const d = sel.data;
    this.props.hidden = false;

    const opacityPct = Math.round((d.opacity ?? 1) * 100);
    const rows = [
      row("Size", `<md-slider data-k="size" min="4" max="60" step="0.5" value="${d.size}" labeled aria-label="Size"></md-slider>`),
      row("Opacity", `<md-slider data-k="opacity" min="20" max="100" step="1" value="${opacityPct}" labeled aria-label="Opacity"></md-slider>`),
    ];

    this.props.innerHTML = rows.join("");

    this.props.querySelectorAll("[data-k]").forEach((input) => {
      const key = input.dataset.k;
      input.addEventListener("input", () => this._applyKey(key, input.value));
    });
  }

  _applyKey(key, rawValue) {
    let value = Number(rawValue);
    if (key === "opacity") value = Math.max(0.2, Math.min(1, value / 100));
    this.stage.patchSelected({ [key]: value });
    this._autosave();
  }

  /* Keep size slider in sync when resizing via the handle. */
  syncSliders() {
    const sel = this.stage.selected();
    if (!sel || this.props.hidden) return;
    const sizeInput = this.props.querySelector('[data-k="size"]');
    if (sizeInput && !sizeInput.matches(":focus-within")) {
      sizeInput.value = sel.data.size;
    }
  }

  /* ---------------- remembered layouts ---------------- */

  refreshLayoutSelect(current) {
    const layouts = listLayouts();
    const names = Object.keys(layouts);
    const order = ["xbox", "nintendo"];
    names.sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });

    this.select.innerHTML =
      names.map((n) => {
        const title = (PRESET_TITLES && PRESET_TITLES[n]) || n;
        return `<md-select-option value="${escapeAttr(n)}"><div slot="headline">${escapeHTML(title)}</div></md-select-option>`;
      }).join("") +
      `<md-select-option value="${NEW_OPTION}"><div slot="headline">+ New…</div></md-select-option>`;
    if (current && names.includes(current)) this.select.value = current;
    else this.select.value = names[0] || NEW_OPTION;
  }

  saveLayout() {
    let name = this.select.value;
    if (name === NEW_OPTION) {
      name = (window.prompt("Layout name", this.app.layoutName || "my-pad") || "").trim().slice(0, 40);
      if (!name) {
        this.refreshLayoutSelect(this.app.layoutName);
        return;
      }
    }
    persistLayout(this.stage.toJSON(name));
    this.app.layoutName = name;
    this.app.storeLayoutName(name);
    this.refreshLayoutSelect(name);
    this.app.banner(`Saved “${name}”`);
  }

  loadSelected() {
    const name = this.select.value;
    if (name === NEW_OPTION) return;
    const layouts = listLayouts();
    const layout = sanitizeLayout(layouts[name]);
    if (!layout) {
      this.app.banner("Layout is corrupt");
      return;
    }
    this.stage.load(layout);
    this.app.layoutName = name;
    this.app.storeLayoutName(name);
    this.renderProps();
  }

  _autosave() {
    try {
      const name = this.app.layoutName || "default";
      persistLayout(this.stage.toJSON(name));
      this.app.storeLayoutName(name);
    } catch {
      /* storage full / private mode — edits just won't persist */
    }
  }
}

function row(label, control) {
  return `<div class="prop"><span>${label}</span>${control}</div>`;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function escapeAttr(s) {
  return escapeHTML(s);
}
