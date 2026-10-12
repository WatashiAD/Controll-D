/* Stage: renders controls, handles multi-touch input and edit-mode gestures. */

import { BUTTON_CODES, shortButtonLabel } from "./codes.js";
import { toggleFullscreen, isFullscreen } from "./screen.js";
import { computeSnap, renderGuides, clearGuides } from "./snapping.js";

/* Local (non-gamepad) actions a control can trigger. */
import {
  ACTION_OPTIONS,
  ACTION_SET,
  STICK_PAIRS,
  ACTION_ICON,
  ACTION_EXIT_ICON,
  SHAPE_ICONS,
  DPAD_ARROWS,
  FLOWER_PATH,
  CLOVER_PATH,
  COOKIE_PATH,
  createShapeSvg,
  clamp,
  applyDeadzone,
} from "./vectors.js";

export { ACTION_OPTIONS, ACTION_SET, FLOWER_PATH, CLOVER_PATH, COOKIE_PATH, SHAPE_ICONS };

class BaseControl {
  constructor(data, stage) {
    this.data = data;
    this.stage = stage;
    this.pointerId = null;
    this.el = document.createElement("div");
    this.el.className = `ctrl ${data.type}`;
    this.el.dataset.id = data.id;

    this.face = document.createElement("div");
    this.face.className = "face";
    this.el.appendChild(this.face);

    this.label = document.createElement("div");
    this.label.className = "lbl";
    this.el.appendChild(this.label);

    this.handle = document.createElement("div");
    this.handle.className = "resize-handle";
    this.el.appendChild(this.handle);

    this.el.addEventListener("pointerdown", (e) => this._down(e));
    this.el.addEventListener("pointermove", (e) => this._move(e));
    this.el.addEventListener("pointerup", (e) => this._up(e));
    this.el.addEventListener("pointercancel", (e) => this._up(e));
    this.el.addEventListener("lostpointercapture", () => this._forceRelease());
  }

  _down(e) {
    if (this.stage.editMode || this.pointerId !== null) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.el.classList.add("active");
    this.onPress(e);
  }

  _move(e) {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    this.onMove(e);
  }

  _up(e) {
    if (e.pointerId !== this.pointerId) return;
    this._forceRelease();
  }

  _forceRelease() {
    if (this.pointerId === null) return;
    this.pointerId = null;
    if (!this.data.behavior || this.data.behavior !== "toggle") {
      this.el.classList.remove("active");
    }
    this.onRelease();
  }

  onPress() {}
  onMove() {}
  onRelease() {}

  applyLayout() {
    const stage = this.stage.rect();
    const unit = Math.min(stage.width, stage.height) / 100;
    const w = this.data.size * unit;
    const h = w * this.data.aspect;
    const el = this.el;
    el.style.left = `${this.data.x}%`;
    el.style.top = `${this.data.y}%`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.transform = "translate(-50%, -50%)";
    el.style.opacity = String(this.data.opacity ?? 1);
    el.style.setProperty("--r", `${Math.min(w, h) * (this.data.type === "dpad" ? 0.28 : 0.5)}px`);
    let fs = clamp(w * 0.26, 9, 22);
    const labelKey = this.data.label || "";
    if (labelKey.length > 3) {
      fs = clamp(fs * (3.5 / labelKey.length), 7, 14);
    }
    el.style.setProperty("--fs", `${fs}px`);
    const defaultShape = (this.data.aspect && this.data.aspect < 0.75) ? "pill" : "cookie";
    el.dataset.shape = this.data.shape || defaultShape;

    const iconHtml = SHAPE_ICONS[labelKey] || SHAPE_ICONS[labelKey.toUpperCase()] || SHAPE_ICONS[labelKey.toLowerCase()];
    if (iconHtml) {
      this.label.innerHTML = iconHtml;
      this.label.hidden = false;
    } else {
      this.label.textContent = labelKey;
      this.label.hidden = !labelKey;
    }

    const glyphMap = { "▲": "triangle", "●": "circle", "✕": "cross", "■": "square" };
    if (glyphMap[labelKey]) {
      this.el.classList.add("shape-btn");
      this.el.dataset.glyph = glyphMap[labelKey];
    } else {
      delete this.el.dataset.glyph;
    }
  }

  setActive(on) {
    this.el.classList.toggle("active", on);
  }

  destroy() {
    this.el.remove();
  }
}

class ButtonControl extends BaseControl {
  constructor(data, stage) {
    super(data, stage);
    this.cookieSvg = createShapeSvg(COOKIE_PATH, "face-cookie");
    this.face.appendChild(this.cookieSvg);
  }

  onPress() {
    const { transport, haptics } = this.stage.ctx;
    haptics.tap();
    if (this.data.behavior === "toggle") {
      const next = !this.el.classList.contains("active") ? 1 : 0;
      this.setActive(!!next);
      transport.sendButton(this.data.map.code, next);
    } else {
      this.setActive(true);
      transport.sendButton(this.data.map.code, 1);
    }
  }

  onRelease() {
    if (this.data.behavior === "toggle") return;
    this.stage.ctx.transport.sendButton(this.data.map.code, 0);
  }
}

class StickControl extends BaseControl {
  constructor(data, stage) {
    super(data, stage);
    this.el.classList.add("stick");
    this.well = document.createElement("div");
    this.well.className = "well";

    this.wellFlower = createShapeSvg(FLOWER_PATH, "well-flower");
    this.well.appendChild(this.wellFlower);

    this.knob = document.createElement("div");
    this.knob.className = "knob";
    this.el.appendChild(this.well);
    this.el.appendChild(this.knob);
    this.knob.style.transition = "transform 130ms ease";
    this.origin = null;
    this.rect = null;
  }

  onPress(e) {
    this.knob.style.transition = "none";
    this.rect = this.el.getBoundingClientRect();
    this.origin = {
      x: this.rect.left + this.rect.width / 2,
      y: this.rect.top + this.rect.height / 2,
    };
    this.onMove(e);
  }

  onMove(e) {
    if (!this.origin || !this.rect) return;
    const scale = this.rect.width / 2;
    let nx = clamp((e.clientX - this.origin.x) / scale, -1, 1);
    let ny = clamp((e.clientY - this.origin.y) / scale, -1, 1);
    const len = Math.hypot(nx, ny);
    if (len > 1) {
      nx /= len;
      ny /= len;
    }
    this._emit(nx, ny, true);
  }

  _emit(nx, ny, visual) {
    const globalDz = (this.stage.ctx.settings().deadzone || 0) / 100;
    const dz = clamp(Math.max((this.data.deadzone || 0) / 100, globalDz), 0, 0.9);
    let [sx, sy] = applyDeadzone(nx, ny, dz);
    if (this.data.invertY) sy = -sy;
    if (visual) {
      const travel = 0.5 * (1 - 0.44); // knob diameter is 44% of the well
      const px = nx * this.rect.width * travel;
      const py = ny * this.rect.height * travel;
      this.knob.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
    }
    this.stage.ctx.transport.sendAxis(this.data.map.x, sx);
    this.stage.ctx.transport.sendAxis(this.data.map.y, sy);
  }

  onRelease() {
    this.origin = null;
    this.knob.style.transition = "";
    this.knob.style.transform = "translate(-50%, -50%)";
    this.stage.ctx.transport.sendAxis(this.data.map.x, 0);
    this.stage.ctx.transport.sendAxis(this.data.map.y, 0);
  }
}

class DpadControl extends BaseControl {
  constructor(data, stage) {
    super(data, stage);
    this.el.classList.add("dpad");

    this.cloverSvg = createShapeSvg(CLOVER_PATH, "face-clover");
    this.face.appendChild(this.cloverSvg);

    this.segs = {};
    for (const name of ["up", "down", "left", "right"]) {
      const seg = document.createElement("div");
      seg.className = `seg ${name}`;
      seg.innerHTML = DPAD_ARROWS[name] || "";
      this.el.appendChild(seg);
      this.segs[name] = seg;
    }
    this.rect = null;
  }

  onPress(e) {
    this.rect = this.el.getBoundingClientRect();
    this._track(e);
  }

  onMove(e) {
    this._track(e);
  }

  _track(e) {
    const r = this.rect;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const nx = clamp((e.clientX - cx) / (r.width / 2), -1, 1);
    const ny = clamp((e.clientY - cy) / (r.height / 2), -1, 1);
    const th = 0.28;
    const hx = Math.abs(nx) < th ? 0 : Math.sign(nx);
    const hy = Math.abs(ny) < th ? 0 : Math.sign(ny);
    this.segs.up.classList.toggle("on", hy < 0);
    this.segs.down.classList.toggle("on", hy > 0);
    this.segs.left.classList.toggle("on", hx < 0);
    this.segs.right.classList.toggle("on", hx > 0);
    let sy = hy;
    if (this.data.invertY) sy = -sy;
    this.stage.ctx.transport.sendAxis(this.data.map.x, hx);
    this.stage.ctx.transport.sendAxis(this.data.map.y, sy);
  }

  onRelease() {
    for (const seg of Object.values(this.segs)) seg.classList.remove("on");
    this.stage.ctx.transport.sendAxis(this.data.map.x, 0);
    this.stage.ctx.transport.sendAxis(this.data.map.y, 0);
  }
}

class TriggerControl extends BaseControl {
  constructor(data, stage) {
    super(data, stage);
    this.el.classList.add("trigger");
    this.fill = document.createElement("div");
    this.fill.className = "fill";
    this.el.appendChild(this.fill);
    this.rect = null;
  }

  onPress(e) {
    this.rect = this.el.getBoundingClientRect();
    this._track(e);
  }

  onMove(e) {
    this._track(e);
  }

  _track(e) {
    const r = this.rect;
    const v = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
    this.fill.style.height = `${v * 100}%`;
    this.setActive(v > 0.01);
    this.stage.ctx.transport.sendAxis(this.data.map.code, v);
  }

  onRelease() {
    this.fill.style.height = "0%";
    this.setActive(false);
    this.stage.ctx.transport.sendAxis(this.data.map.code, 0);
  }
}

/* Local action button (e.g. fullscreen toggle): no gamepad traffic,
   fully customisable like any other control (move/resize/rename). */
class ActionControl extends BaseControl {
  constructor(data, stage) {
    super(data, stage);
    this.el.classList.add("action");
    this._fsHandler = () => this._syncState();
    document.addEventListener("fullscreenchange", this._fsHandler);
    document.addEventListener("webkitfullscreenchange", this._fsHandler);
    this._syncState();
  }

  onPress() {
    this.stage.ctx.haptics.tap();
    if (this.data.map.action === "fullscreen") toggleFullscreen();
    this.setActive(true);
  }

  onRelease() {
    this.setActive(false);
    this._syncState();
  }

  _syncState() {
    const fs = isFullscreen();
    this.el.classList.toggle("on", fs);
    if (!this.data.label || this.data.label === "⛶" || this.data.label === "fullscreen") {
      this.label.innerHTML = fs ? ACTION_EXIT_ICON : ACTION_ICON;
      this.label.hidden = false;
    }
  }

  destroy() {
    document.removeEventListener("fullscreenchange", this._fsHandler);
    document.removeEventListener("webkitfullscreenchange", this._fsHandler);
    super.destroy();
  }
}

class IslandControl extends BaseControl {
  constructor(data, stage) {
    super(data, stage);
    this.el.classList.add("island");
    const shapePath = data.shape === "flower" ? FLOWER_PATH : CLOVER_PATH;
    this.islandSvg = createShapeSvg(shapePath, "island-svg");
    this.face.appendChild(this.islandSvg);
  }

  applyLayout() {
    super.applyLayout();
    const shapePath = this.data.shape === "flower" ? FLOWER_PATH : CLOVER_PATH;
    if (this.islandSvg) {
      this.islandSvg.innerHTML = `<path d="${shapePath}"/>`;
    }
  }
}

class ClusterControl extends BaseControl {
  constructor(data, stage) {
    super(data, stage);
    this.el.classList.add("cluster");

    const shapePath = data.shape === "flower" ? FLOWER_PATH : CLOVER_PATH;
    this.cloverSvg = createShapeSvg(shapePath, "face-clover");
    this.face.appendChild(this.cloverSvg);

    this.buttons = {};
    const subDefs = [
      { dir: "north", defaultCode: "BTN_WEST",  defaultLabel: "Y" },
      { dir: "west",  defaultCode: "BTN_NORTH", defaultLabel: "X" },
      { dir: "east",  defaultCode: "BTN_EAST",  defaultLabel: "B" },
      { dir: "south", defaultCode: "BTN_SOUTH", defaultLabel: "A" },
    ];

    for (const def of subDefs) {
      const bEl = document.createElement("div");
      bEl.className = `cluster-btn ${def.dir}`;
      const code = (this.data.map && this.data.map[def.dir]) || def.defaultCode;
      const lbl = (this.data.labels && this.data.labels[def.dir]) || def.defaultLabel;
      bEl.textContent = lbl;
      this.el.appendChild(bEl);
      this.buttons[def.dir] = { el: bEl, code };
    }

    this._activePointers = new Map();
  }

  applyLayout() {
    super.applyLayout();
    const shapePath = this.data.shape === "flower" ? FLOWER_PATH : CLOVER_PATH;
    if (this.cloverSvg) {
      this.cloverSvg.innerHTML = `<path d="${shapePath}"/>`;
    }
    for (const dir of ["north", "west", "east", "south"]) {
      if (this.buttons[dir]) {
        if (this.data.labels && this.data.labels[dir]) this.buttons[dir].el.textContent = this.data.labels[dir];
        if (this.data.map && this.data.map[dir]) this.buttons[dir].code = this.data.map[dir];
      }
    }
  }

  _getDir(e) {
    const r = this.el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = (e.clientX - cx) / (r.width / 2);
    const dy = (e.clientY - cy) / (r.height / 2);
    if (Math.hypot(dx, dy) < 0.12) return null;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "east" : "west") : (dy > 0 ? "south" : "north");
  }

  _pressDir(pointerId, dir) {
    const cur = this._activePointers.get(pointerId);
    if (cur === dir) return;
    if (cur) this._releasePointer(pointerId);
    if (!dir || !this.buttons[dir]) return;
    this._activePointers.set(pointerId, dir);
    const b = this.buttons[dir];
    b.el.classList.add("active");
    this.stage.ctx.haptics.tap();
    this.stage.ctx.transport.sendButton(b.code, 1);
  }

  _releasePointer(pointerId) {
    const dir = this._activePointers.get(pointerId);
    if (!dir) return;
    this._activePointers.delete(pointerId);
    const stillActive = Array.from(this._activePointers.values()).includes(dir);
    if (!stillActive && this.buttons[dir]) {
      this.buttons[dir].el.classList.remove("active");
      this.stage.ctx.transport.sendButton(this.buttons[dir].code, 0);
    }
  }

  _down(e) {
    if (this.stage.editMode) return;
    e.preventDefault();
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.el.classList.add("active");
    const dir = this._getDir(e);
    if (dir) this._pressDir(e.pointerId, dir);
  }

  _move(e) {
    if (this.stage.editMode) return;
    if (!this._activePointers.has(e.pointerId)) return;
    e.preventDefault();
    const dir = this._getDir(e);
    if (dir) this._pressDir(e.pointerId, dir);
    else this._releasePointer(e.pointerId);
  }

  _up(e) {
    if (this.stage.editMode) return;
    e.preventDefault();
    this._releasePointer(e.pointerId);
    if (this._activePointers.size === 0) {
      this.el.classList.remove("active");
    }
  }

  _forceRelease() {
    for (const pid of Array.from(this._activePointers.keys())) {
      this._releasePointer(pid);
    }
    this.el.classList.remove("active");
  }
}

const FACTORY = {
  button: ButtonControl,
  stick: StickControl,
  dpad: DpadControl,
  trigger: TriggerControl,
  action: ActionControl,
  island: IslandControl,
  cluster: ClusterControl,
};

export class Stage {
  constructor(el, ctx) {
    this.el = el;
    this.ctx = ctx; // { transport, haptics, settings }
    this.controls = [];
    this.editMode = false;
    this.gridOn = false;
    this.selectedId = null;
    this.onSelectionChange = null;
    this._editGesture = null;

    this._ro = new ResizeObserver(() => this.relayout());
    this._ro.observe(el);

    el.addEventListener("pointerdown", (e) => this._editDown(e));
    el.addEventListener("pointermove", (e) => this._editMove(e));
    el.addEventListener("pointerup", (e) => this._editUp(e));
    el.addEventListener("pointercancel", (e) => this._editUp(e));
  }

  rect() {
    return this.el.getBoundingClientRect();
  }

  load(layout) {
    for (const c of this.controls) c.destroy();
    this.controls = layout.controls.map((data) => {
      const Cls = FACTORY[data.type] || ButtonControl;
      const impl = new Cls(data, this);
      this.el.appendChild(impl.el);
      impl.applyLayout();
      return impl;
    });
    this.selectedId = null;
    this._notifySelection();
  }

  toJSON(name) {
    return {
      version: 1,
      name: name || "layout",
      controls: this.controls.map((c) => JSON.parse(JSON.stringify(c.data))),
    };
  }

  relayout() {
    for (const c of this.controls) c.applyLayout();
  }

  /* ---------------- selection / edit API ---------------- */

  select(id) {
    this.selectedId = id;
    for (const c of this.controls) {
      c.el.classList.toggle("selected", c.data.id === id);
    }
    this._notifySelection();
  }

  selected() {
    return this.controls.find((c) => c.data.id === this.selectedId) || null;
  }

  _notifySelection() {
    if (this.onSelectionChange) this.onSelectionChange(this.selected());
  }

  usedCodes() {
    const buttons = new Set();
    const axes = new Set();
    for (const c of this.controls) {
      const m = c.data.map;
      if (c.data.type === "button") buttons.add(m.code);
      else if (c.data.type === "cluster" && m) {
        if (m.north) buttons.add(m.north);
        if (m.west) buttons.add(m.west);
        if (m.east) buttons.add(m.east);
        if (m.south) buttons.add(m.south);
      } else if (c.data.type === "trigger") axes.add(m.code);
      else if (c.data.type === "action" || c.data.type === "island") { /* local/visual */ }
      else if (m) {
        if (m.x) axes.add(m.x);
        if (m.y) axes.add(m.y);
      }
    }
    return { buttons, axes };
  }

  addControl(type) {
    const used = this.usedCodes();
    const id = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const base = { id, type, x: 50, y: 25, opacity: 1 };
    let data;
    if (type === "button") {
      const entry = BUTTON_CODES.find(([code]) => !used.buttons.has(code)) || BUTTON_CODES[0];
      data = { ...base, label: shortButtonLabel(entry[0]), size: 12, aspect: 1, map: { code: entry[0] }, behavior: "press" };
    } else if (type === "stick") {
      const pair = STICK_PAIRS.find(([x, y]) => !used.axes.has(x) && !used.axes.has(y)) || STICK_PAIRS[0];
      data = { ...base, label: "", size: 26, aspect: 1, map: { x: pair[0], y: pair[1] }, mode: "floating", deadzone: 12, invertY: false };
    } else if (type === "dpad") {
      data = { ...base, label: "", size: 24, aspect: 1, map: { x: "ABS_HAT0X", y: "ABS_HAT0Y" }, deadzone: 0, invertY: false };
    } else if (type === "action") {
      data = { ...base, label: "⛶", size: 10, aspect: 1, map: { action: "fullscreen" } };
    } else {
      const code = used.axes.has("ABS_Z") ? "ABS_RZ" : "ABS_Z";
      data = { ...base, label: code === "ABS_Z" ? "LT" : "RT", size: 9, aspect: 3.2, map: { code } };
    }
    const Cls = FACTORY[type] || ButtonControl;
    const impl = new Cls(data, this);
    this.el.appendChild(impl.el);
    this.controls.push(impl);
    impl.applyLayout();
    this.select(data.id);
    return impl;
  }

  duplicateSelected() {
    const sel = this.selected();
    if (!sel) return;
    const copy = JSON.parse(JSON.stringify(sel.data));
    copy.id = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    copy.x = clamp(copy.x + 6, 0, 100);
    copy.y = clamp(copy.y + 6, 0, 100);
    const Cls = FACTORY[copy.type];
    const impl = new Cls(copy, this);
    this.el.appendChild(impl.el);
    this.controls.push(impl);
    impl.applyLayout();
    this.select(copy.id);
  }

  removeSelected() {
    const sel = this.selected();
    if (!sel) return;
    sel.destroy();
    this.controls = this.controls.filter((c) => c !== sel);
    this.selectedId = null;
    this._notifySelection();
  }

  patchSelected(patch) {
    const sel = this.selected();
    if (!sel) return;
    Object.assign(sel.data, patch);
    sel.applyLayout();
    if (this.onLayoutMutation) this.onLayoutMutation();
  }

  setEditMode(on) {
    this.editMode = on;
    this.el.classList.toggle("editing", on);
    if (!on) {
      this.select(null);
      this.setGrid(false);
      clearGuides(document.getElementById("snap-guides-layer"));
    }
  }

  setGrid(on) {
    this.gridOn = on;
    const grid = document.getElementById("grid");
    if (grid) grid.hidden = !on;
  }

  /* ---------------- edit-mode gestures ---------------- */

  _snap(v) {
    return this.gridOn ? Math.round(v) : Math.round(v * 10) / 10;
  }

  _editDown(e) {
    if (!this.editMode) return;
    const handle = e.target.closest(".resize-handle");
    const ctrlEl = e.target.closest(".ctrl");
    const stageRect = this.rect();

    if (handle && ctrlEl) {
      const impl = this._byEl(ctrlEl);
      if (!impl) return;
      this.select(impl.data.id);
      const cx = stageRect.left + (impl.data.x / 100) * stageRect.width;
      const cy = stageRect.top + (impl.data.y / 100) * stageRect.height;
      this._editGesture = {
        kind: "resize",
        id: impl.data.id,
        startSize: impl.data.size,
        startDist: Math.max(8, Math.hypot(e.clientX - cx, e.clientY - cy)),
      };
      this.el.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (ctrlEl) {
      const impl = this._byEl(ctrlEl);
      if (!impl) return;
      this.select(impl.data.id);
      this._editGesture = {
        kind: "move",
        id: impl.data.id,
        dx: (e.clientX - stageRect.left) / stageRect.width * 100 - impl.data.x,
        dy: (e.clientY - stageRect.top) / stageRect.height * 100 - impl.data.y,
        didSnap: false,
      };
      this.el.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    this.select(null);
  }

  _editMove(e) {
    const g = this._editGesture;
    if (!g) return;
    const impl = this.controls.find((c) => c.data.id === g.id);
    if (!impl) return;
    const stageRect = this.rect();

    if (g.kind === "move") {
      const rawX = (e.clientX - stageRect.left) / stageRect.width * 100 - g.dx;
      const rawY = (e.clientY - stageRect.top) / stageRect.height * 100 - g.dy;
      const cfg = typeof this.ctx?.settings === "function" ? this.ctx.settings() : this.ctx?.settings;
      const snapLayer = document.getElementById("snap-guides-layer");
      const snapResult = computeSnap(
        { x: rawX, y: rawY, size: impl.data.size, aspect: impl.data.aspect },
        this.controls.filter((c) => c.data.id !== impl.data.id).map((c) => c.data),
        stageRect,
        {
          enabled: cfg ? cfg.snapEnabled !== false : true,
          gridStep: cfg ? cfg.snapGridStep || 2.5 : 2.5,
          useGrid: this.gridOn,
        }
      );

      if ((snapResult.snappedX || snapResult.snappedY) && !g.didSnap) {
        if (this.ctx?.haptics?.tap) this.ctx.haptics.tap();
        g.didSnap = true;
      } else if (!snapResult.snappedX && !snapResult.snappedY) {
        g.didSnap = false;
      }

      renderGuides(snapLayer, snapResult.guides);
      impl.data.x = clamp(snapResult.x, 0, 100);
      impl.data.y = clamp(snapResult.y, 0, 100);
    } else {
      const cx = stageRect.left + (impl.data.x / 100) * stageRect.width;
      const cy = stageRect.top + (impl.data.y / 100) * stageRect.height;
      const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
      const raw = (dist / g.startDist) * g.startSize;
      const step = this.gridOn ? 1 : 0.5;
      impl.data.size = clamp(Math.round(raw / step) * step, 4, 60);
    }
    impl.applyLayout();
    if (this.onLayoutMutation) this.onLayoutMutation();
  }

  _editUp(e) {
    if (!this._editGesture) return;
    this._editGesture = null;
    clearGuides(document.getElementById("snap-guides-layer"));
    try {
      this.el.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (this.onLayoutMutation) this.onLayoutMutation();
  }

  _byEl(el) {
    const id = el.dataset.id;
    return this.controls.find((c) => c.data.id === id) || null;
  }

  destroy() {
    this._ro.disconnect();
  }
}
