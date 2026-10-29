/* Low-latency WebSocket transport.
   - Buttons flush immediately (single tiny frame)
   - Axes coalesce per animation frame into one batch message
   - Trackpad motion can bypass the frame queue via sendMouseNow()
   - Heartbeat ping measures RTT for the HUD
   - Auto-reconnect with backoff; sends a neutral-state reset when hidden
*/

const CONNECT_TIMEOUT_MS = 6000;
const PING_INTERVAL_MS = 2000;
const BACKOFF_MS = [400, 800, 1600, 3200, 6000, 8000];

export class Transport extends EventTarget {
  constructor() {
    super();
    this.ws = null;
    this.status = "idle"; // idle | connecting | on | reconnecting | kicked | error
    this.rtt = null;
    this._pending = new Map();
    this._raf = 0;
    this._mouse = { x: 0, y: 0 };
    this._wheel = { x: 0, y: 0 };
    this._mouseRaf = 0;
    this._pingTimer = 0;
    this._connectTimer = 0;
    this._retries = 0;
    this._closedByUs = false;
  }

  get url() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}/ws`;
  }

  setStatus(status, text) {
    this.status = status;
    this.dispatchEvent(new CustomEvent("status", { detail: { status, text } }));
  }

  connect() {
    this._closedByUs = false;
    this._open();
  }

  _open() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.setStatus(this._retries > 0 ? "reconnecting" : "connecting", "connecting…");
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.setStatus("error", "cannot reach server");
      this._scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      if (ws !== this.ws) return;
      // The server activates us immediately and answers with {"t":"ok"}.
      this._connectTimer = setTimeout(() => {
        if (this.status === "connecting") {
          this.setStatus("error", "server not responding");
          this._hardClose();
        }
      }, CONNECT_TIMEOUT_MS);
    };

    ws.onmessage = (ev) => {
      if (ws !== this.ws) return;
      this._onMessage(ev.data);
    };

    ws.onerror = () => {};

    ws.onclose = () => {
      if (ws !== this.ws) return;
      clearTimeout(this._connectTimer);
      this._stopPing();
      if (this._closedByUs) {
        this.setStatus("idle", "disconnected");
        return;
      }
      if (this.status === "kicked") return;
      this.setStatus("reconnecting", "reconnecting…");
      this._scheduleReconnect();
    };
  }

  _onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.t) {
      case "ok":
        clearTimeout(this._connectTimer);
        this._retries = 0;
        this.setStatus("on", msg.pad ? "connected" : "connected (no device)");
        this._startPing();
        this.dispatchEvent(new CustomEvent("ready", { detail: msg }));
        break;
      case "p":
        if (typeof msg.ts === "number") {
          this.rtt = Math.max(0, performance.now() - msg.ts);
          this.dispatchEvent(new CustomEvent("rtt", { detail: this.rtt }));
        }
        break;
      case "v":
        this.dispatchEvent(new CustomEvent("rumble", { detail: msg }));
        break;
      case "kick":
        this.setStatus("kicked", "controller taken over");
        this._closedByUs = true;
        this._hardClose();
        this.dispatchEvent(new CustomEvent("kick"));
        break;
      default:
        break;
    }
  }

  _scheduleReconnect() {
    if (this._closedByUs) return;
    const delay = BACKOFF_MS[Math.min(this._retries, BACKOFF_MS.length - 1)];
    this._retries += 1;
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => this._open(), delay);
  }

  _hardClose() {
    clearTimeout(this._reconnectTimer);
    this._stopPing();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  }

  disconnect() {
    this._closedByUs = true;
    if (this._openSend({ t: "z" })) {
      /* best effort neutral reset */
    }
    this._hardClose();
    this.setStatus("idle", "disconnected");
  }

  _startPing() {
    this._stopPing();
    this._pingTimer = setInterval(() => {
      this.sendRaw({ t: "p", ts: performance.now() });
    }, PING_INTERVAL_MS);
  }

  _stopPing() {
    clearInterval(this._pingTimer);
    this._pingTimer = 0;
  }

  _openSend(obj) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(typeof obj === "string" ? obj : JSON.stringify(obj));
      return true;
    } catch {
      return false;
    }
  }

  sendRaw(obj) {
    return this._openSend(obj);
  }

  sendButton(code, value) {
    this._pending.set(`b:${code}`, ["b", code, value ? 1 : 0]);
    this._flush();
  }

  sendAxis(code, value) {
    const v = Math.round(Math.max(-1, Math.min(1, value)) * 1000) / 1000;
    const key = `a:${code}`;
    const prev = this._pending.get(key);
    if (prev && prev[1] === code && prev[2] === v) return;
    this._pending.set(key, ["a", code, v]);
    this._scheduleFlush();
  }

  releaseAll() {
    this.sendRaw({ t: "z" });
    this.sendRaw({ t: "kr" });
    this._pending.clear();
  }

  /* ---------------- virtual keyboard ---------------- */

  sendKeyName(code, value) {
    this.sendRaw({ t: "k", c: code, v: value ? 1 : 0 });
  }

  resetKeys() {
    this.sendRaw({ t: "kr" });
  }

  /* ---------------- virtual trackpad/mouse ---------------- */

  sendMouse(dx, dy) {
    this._mouse.x += Math.trunc(dx);
    this._mouse.y += Math.trunc(dy);
    this._scheduleMouseFlush();
  }

  /* Trackpad pointer samples are already rate-limited by the browser. Send
     immediately to avoid adding a full animation-frame of perceived drag. */
  sendMouseNow(dx, dy) {
    const x = Math.trunc(dx);
    const y = Math.trunc(dy);
    if (!x && !y) return false;
    return this.sendRaw({ t: "mr", x, y });
  }

  sendMouseButton(code, value) {
    this.sendRaw({ t: "mb", c: code, v: value ? 1 : 0 });
  }

  sendWheel(x, y) {
    this._wheel.x += Math.trunc(x);
    this._wheel.y += Math.trunc(y);
    this._scheduleMouseFlush();
  }

  _scheduleMouseFlush() {
    if (this._mouseRaf) return;
    this._mouseRaf = requestAnimationFrame(() => {
      this._mouseRaf = 0;
      if (this._mouse.x || this._mouse.y) {
        this.sendRaw({ t: "mr", x: this._mouse.x, y: this._mouse.y });
        this._mouse.x = 0;
        this._mouse.y = 0;
      }
      if (this._wheel.x || this._wheel.y) {
        this.sendRaw({ t: "mw", x: this._wheel.x, y: this._wheel.y });
        this._wheel.x = 0;
        this._wheel.y = 0;
      }
    });
  }

  _scheduleFlush() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this._flush();
    });
  }

  _flush() {
    if (this._pending.size === 0) return;
    const events = [];
    for (const entry of this._pending.values()) events.push(entry);
    this._pending.clear();
    if (this._openSend({ t: "m", e: events })) return;
    // socket busy/closed: keep values so the next open send includes them
    for (const ev of events) {
      const key = `${ev[0]}:${ev[1]}`;
      if (!this._pending.has(key)) this._pending.set(key, ev);
    }
  }

  neutralize() {
    this._pending.clear();
    this._mouse.x = 0;
    this._mouse.y = 0;
    this._wheel.x = 0;
    this._wheel.y = 0;
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
    if (this._mouseRaf) {
      cancelAnimationFrame(this._mouseRaf);
      this._mouseRaf = 0;
    }
    this.sendRaw({ t: "z" });
    this.sendRaw({ t: "kr" });
    this.sendRaw({ t: "mb", c: "BTN_LEFT", v: 0 });
    this.sendRaw({ t: "mb", c: "BTN_RIGHT", v: 0 });
  }
}
