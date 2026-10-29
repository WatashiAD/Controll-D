/* Trackpad overlay → virtual mouse on the PC.
 *
 *   1 finger        move (tap = left click)
 *   2 fingers       scroll (two-finger tap = right click)
 *   bottom bar      explicit left/right click (hold to drag)
 *
 * Tap detection: release within 260ms having moved < 12px. Wheel direction
 * follows the "natural scroll" setting; speed follows pointer speed.
 */

const TAP_MS = 260;
const TAP_SLOP = 12;
const SCROLL_SCALE = 0.02; // notches per CSS px
const HINT_FADE_MS = 3200;

export class TrackpadOverlay {
  constructor(transport, haptics, getSettings) {
    this.transport = transport;
    this.haptics = haptics;
    this.getSettings = getSettings;
    this.el = document.getElementById("tp-overlay");
    this.surface = document.getElementById("tp-surface");
    this.cursor = document.getElementById("tp-cursor");
    this.hintEl = document.getElementById("tp-hint");
    this.touches = new Map(); // pointerId → { x, y, startX, startY, resX, resY, ... }
    this.gesture = null;      // { n, t0, still }
    this.hintShown = false;
    this._rect = null;        // cached surface rect (layout reads are expensive)

    for (const ev of ["resize", "orientationchange"])
      window.addEventListener(ev, () => { this._rect = null; });
    window.visualViewport?.addEventListener("resize", () => { this._rect = null; });

    this._bindSurface();
    this._bindBar();
  }

  _surfaceRect() {
    if (!this._rect) this._rect = this.surface.getBoundingClientRect();
    return this._rect;
  }

  /* ----------------------------------------------------------- surface */

  _bindSurface() {
    const s = this.surface;
    s.addEventListener("pointerdown", (e) => this._down(e));
    const moveEvent = "onpointerrawupdate" in window ? "pointerrawupdate" : "pointermove";
    s.addEventListener(moveEvent, (e) => this._move(e));
    s.addEventListener("pointerup", (e) => this._up(e));
    s.addEventListener("pointercancel", (e) => this._up(e));
  }

  _down(e) {
    e.preventDefault();
    try {
      this.surface.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const rect = this._surfaceRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const first = this.touches.size === 0;
    this.touches.set(e.pointerId, {
      x, y, startX: x, startY: y,
      resX: 0, resY: 0, wheelX: 0, wheelY: 0,
    });
    if (first) {
      /* gesture spans first-finger-down → last-finger-up */
      this.gesture = { n: 1, t0: Date.now(), still: true };
    } else if (this.gesture) {
      this.gesture.n = Math.max(this.gesture.n, this.touches.size);
    }
    this.haptics.tap();
    this._cursorAt(x, y, true);
    this._showHintOnce();
  }

  _move(e) {
    if (e.cancelable) e.preventDefault();
    const samples = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    for (const sample of samples.length ? samples : [e]) {
      this._moveSample(e.pointerId, sample);
    }
  }

  _moveSample(pointerId, e) {
    const touch = this.touches.get(pointerId);
    if (!touch) return;
    const rect = this._surfaceRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const s = this.getSettings();
    const gain = (s.pointerSpeed || 100) / 100;
    if (this.gesture && Math.hypot(x - touch.startX, y - touch.startY) >= TAP_SLOP) {
      this.gesture.still = false;
    }

    if (this.touches.size === 1) {
      const dx = x - touch.x;
      const dy = y - touch.y;
      touch.resX += dx * gain;
      touch.resY += dy * gain;
      const sendX = Math.trunc(touch.resX);
      const sendY = Math.trunc(touch.resY);
      if (sendX || sendY) {
        touch.resX -= sendX;
        touch.resY -= sendY;
        this.transport.sendMouseNow(sendX, sendY);
      }
    } else if (this.touches.size === 2) {
      /* scroll = mean finger delta (both fingers conventionally move together) */
      const other = [...this.touches.values()].find((t) => t !== touch);
      if (other) {
        const dx = (x - touch.x) / 2;
        const dy = (y - touch.y) / 2;
        touch.wheelY += dy * SCROLL_SCALE;
        touch.wheelX += dx * SCROLL_SCALE;
        let wy = Math.trunc(touch.wheelY);
        let wx = Math.trunc(touch.wheelX);
        touch.wheelY -= wy;
        touch.wheelX -= wx;
        if (!s.naturalScroll) {
          wy = -wy;
          wx = -wx;
        }
        if (wy || wx) {
          this.transport.sendWheel(wx, wy);
        }
      }
    }
    touch.x = x;
    touch.y = y;
    this._cursorAt(x, y, true);
  }

  _up(e) {
    const touch = this.touches.get(e.pointerId);
    if (!touch) return;
    e.preventDefault();
    this.touches.delete(e.pointerId);
    const g = this.gesture;
    if (g && g.still && Date.now() - g.t0 < TAP_MS && this.touches.size === 0) {
      this._tapClick(g.n);
    }
    if (this.touches.size === 0) {
      this.gesture = null;
      this._cursorAt(touch.x, touch.y, false);
    }
    /* 2 → 1 fingers: keep the gesture (its n + t0) so the last lift can
       still complete a two-finger tap; clear per-finger residues. */
    for (const t of this.touches.values()) {
      t.resX = 0;
      t.resY = 0;
      t.wheelX = 0;
      t.wheelY = 0;
    }
  }

  _tapClick(n) {
    const code = n >= 2 ? "BTN_RIGHT" : "BTN_LEFT";
    this.transport.sendMouseButton(code, 1);
    this.transport.sendMouseButton(code, 0);
    this.haptics.tap();
  }

  _cursorAt(x, y, show) {
    if (!this.cursor) return;
    if (show) {
      this.cursor.style.transform = `translate(${x}px, ${y}px)`;
      this.cursor.classList.add("active");
    } else {
      this.cursor.classList.remove("active");
    }
  }

  _showHintOnce() {
    if (this.hintShown || !this.hintEl) return;
    this.hintShown = true;
    this.hintEl.classList.add("show");
    setTimeout(() => this.hintEl.classList.remove("show"), HINT_FADE_MS);
  }

  /* --------------------------------------------------------------- bar */

  _bindBar() {
    const press = (code) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.transport.sendMouseButton(code, 1);
      this.haptics.tap();
    };
    const release = (code) => (e) => {
      e.preventDefault();
      this.transport.sendMouseButton(code, 0);
    };
    for (const [id, code] of [
      ["tp-left", "BTN_LEFT"],
      ["tp-right", "BTN_RIGHT"],
    ]) {
      const btn = document.getElementById(id);
      if (!btn) continue;
      btn.addEventListener("pointerdown", press(code));
      btn.addEventListener("pointerup", release(code));
      btn.addEventListener("pointercancel", release(code));
      btn.addEventListener("pointerleave", (e) => {
        if (e.buttons & 1) release(code)(e);
      });
    }
  }

  /* --------------------------------------------------------- lifecycle */

  show() {
    this.el.hidden = false;
  }

  hide() {
    this.release();
    this.el.hidden = true;
  }

  release() {
    if (this.touches.size && this.gesture?.still && Date.now() - this.gesture.t0 < TAP_MS) {
      this._tapClick(this.gesture.n);
    }
    this.touches.clear();
    this.gesture = null;
    this.transport.sendMouseButton("BTN_LEFT", 0);
    this.transport.sendMouseButton("BTN_RIGHT", 0);
    this._cursorAt(0, 0, false);
  }
}
