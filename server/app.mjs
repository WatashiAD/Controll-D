/* Controll-D server: HTTP (static client) + WebSocket (input & streams) +
 * virtual devices per platform (Linux/Windows/macOS).
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import dgram from "node:dgram";
import { WebSocketServer } from "ws";

import { loadConfig } from "./config.mjs";
import { VirtualGamepad } from "./gamepad.mjs";
import { VirtualGamepadWin } from "./gamepad-win.mjs";
import { RateLimiter, parseMessage } from "./protocol.mjs";
import { createKeyboard, createMouse, hidHint } from "./hid.mjs";
import { StreamManager } from "./media.mjs";
import { probePlatform } from "./platform.mjs";
import QRCode from "qrcode";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, "..", "web");
const MAX_WS_BYTES = 8192;          // control socket frame cap
const MAX_STREAM_BYTES = 6 * 1024 * 1024; // mic/cam chunk cap (MediaRecorder)
const RATE_BUDGET = 16 * 1024 * 1024; // per-stream bytes per 2 s window

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

async function serveFile(res, path) {
  try {
    const data = await readFile(path);
    res.writeHead(200, {
      "content-type": MIME[extname(path).toLowerCase()] || "application/octet-stream",
      "content-length": data.length,
      /* Dev-friendly: phone sees edits immediately on reload. */
      "cache-control": "no-store",
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

async function serveCamWatch(res) {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(camWatchPage());
}

export function createState(cfg) {
  return { cfg, pad: null, kb: null, mouse: null, active: null, stream: null, feats: null };
}

function clientIp(req) {
  const addr = req.socket?.remoteAddress || "?";
  return addr.startsWith("::ffff:") ? addr.slice(7) : addr;
}

export function createServerFromState(state) {
  const { cfg } = state;
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_BYTES });
  const wssStream = new WebSocketServer({ noServer: true, maxPayload: MAX_STREAM_BYTES });

  wss.on("connection", (ws, req) => handleSocket(state, ws, req));
  wssStream.on("connection", (ws, req, kind) => handleStreamSocket(state, ws, req, kind));

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://x");
      const isStreamRoute = url.pathname === "/api/stream/start" || url.pathname === "/api/stream/stop";
      if (req.method !== "GET" && req.method !== "HEAD" && !(isStreamRoute && req.method === "POST")) {
        res.writeHead(405, { "cache-control": "no-store" });
        res.end();
        return;
      }
      if (url.pathname === "/api/info") {
        sendJson(res, 200, {
          name: "controll-d",
          version: "2.0.0",
          platform: process.platform,
          pad: state.pad !== null,
          keyboard: state.kb !== null,
          mouse: state.mouse !== null,
          clients: state.active ? 1 : 0,
          features: state.feats || {},
          hint: hidHint(),
        });
        return;
      }
      if (isStreamRoute) {
        const kind = url.searchParams.get("kind");
        const op = url.pathname.endsWith("start") ? "start" : "stop";
        if (kind !== "mic" && kind !== "cam") {
          sendJson(res, 400, { ok: false, why: "kind must be mic or cam" });
          return;
        }
        sendJson(res, 200, op === "start" ? await state.stream.start(kind) : state.stream.stop(kind));
        return;
      }
      if (url.pathname === "/api/check-update") {
        sendJson(res, 200, {
          name: "controll-d",
          version: "2.0.0",
          updateCommand: "npm run update",
        });
        return;
      }
      if (url.pathname === "/cam/watch") {
        if (req.method === "HEAD") {
          res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" });
          res.end();
          return;
        }
        await serveCamWatch(res);
        return;
      }
      if (url.pathname === "/" || url.pathname === "/index.html") {
        if (req.method === "HEAD") {
          res.writeHead(200, {
            "content-type": MIME[".html"],
            "cache-control": "no-store",
          });
          res.end();
          return;
        }
        if (!(await serveFile(res, join(WEB_ROOT, "index.html")))) {
          sendJson(res, 500, { error: "index missing" });
        }
        return;
      }
      if (url.pathname === "/ws" || url.pathname === "/ws/mic" || url.pathname === "/ws/cam") {
        res.writeHead(400, { "cache-control": "no-store" });
        res.end();
        return;
      }
      /* Static file (path traversal is rejected below). */
      const rel = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, "");
      const abs = resolve(WEB_ROOT, rel);
      if (abs !== WEB_ROOT && !abs.startsWith(WEB_ROOT + sep)) {
        sendJson(res, 403, { error: "forbidden" });
        return;
      }
      if (req.method === "HEAD") {
        res.writeHead(200, {
          "content-type": MIME[extname(abs).toLowerCase()] || "application/octet-stream",
          "cache-control": "no-store",
        });
        res.end();
        return;
      }
      if (!(await serveFile(res, abs))) sendJson(res, 404, { error: "not found" });
    } catch {
      try {
        sendJson(res, 500, { error: "internal" });
      } catch {
        /* ignore */
      }
    }
  });

  server.on("upgrade", (req, socket, head) => {
    try {
      const url = new URL(req.url || "/", "http://x");
      const kind = url.pathname === "/ws/mic" ? "mic"
        : url.pathname === "/ws/cam" ? "cam"
        : url.pathname === "/ws" ? "control" : null;
      if (!kind) {
        socket.destroy();
        return;
      }
      if (kind === "control") {
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
      } else {
        wssStream.handleUpgrade(req, socket, head, (ws) => wssStream.emit("connection", ws, req, kind));
      }
    } catch {
      socket.destroy();
      return;
    }
  });

  return server;
}

function activateSession(state, session) {
  const previous = state.active;
  if (previous && previous !== session && previous.ws.readyState === previous.ws.OPEN) {
    try {
      previous.ws.send(JSON.stringify({ t: "kick" }));
    } catch {
      /* ignore */
    }
  }
  state.active = session;
  session.authed = true;
  session.ws.send(JSON.stringify({
    t: "ok",
    pad: state.pad !== null,
    keyboard: state.kb !== null,
    mouse: state.mouse !== null,
  }));
  console.log(`Session activated (pad=${state.pad !== null}, kb=${state.kb !== null})`);
}

function handleSocket(state, ws, req) {
  const { cfg } = state;
  const ip = clientIp(req);
  const session = {
    ws,
    limiter: new RateLimiter(cfg.rateLimitPerSec, cfg.rateLimitBurst),
    authed: false,
    peer: ip,
    alive: true,
  };
  console.log(`WS connected from ${ip}`);
  activateSession(state, session);

  const heartbeat = setInterval(() => {
    if (!session.alive) {
      try {
        ws.terminate();
      } catch {
        /* ignore */
      }
      return;
    }
    session.alive = false;
    try {
      ws.ping();
    } catch {
      /* ignore */
    }
  }, 20000);
  if (heartbeat.unref) heartbeat.unref();
  ws.on("pong", () => {
    session.alive = true;
  });

  ws.on("message", (data, isBinary) => {
    if (!session.limiter.allow()) {
      console.warn(`Rate limit exceeded for ${ip}`);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      return;
    }
    const parsed = parseMessage(isBinary ? Buffer.from(data) : data.toString("utf-8"));
    if (!parsed) return;
    dispatchControl(state, session, parsed);
  });

  const cleanup = () => {
    clearInterval(heartbeat);
    releaseAllDevices(state);
    if (state.active === session) state.active = null;
    console.log(`WS disconnected from ${ip}`);
  };
  ws.on("close", cleanup);
  ws.on("error", () => {
    /* close follows */
  });
}

function dispatchControl(state, session, parsed) {
  const pad = state.pad;
  const kb = state.kb;
  const mouse = state.mouse;
  switch (parsed.t) {
    case "p":
      if (session.ws.readyState === session.ws.OPEN) {
        session.ws.send(JSON.stringify({ t: "p", ts: parsed.ts ?? null }));
      }
      return;
    case "z":
      releaseAllDevices(state);
      return;
    case "m":
      if (!pad) return;
      for (const [kind, code, value] of parsed.e) {
        if (kind === "b") pad.setButton(code, value);
        else pad.setAxis(code, value);
      }
      pad.syn();
      return;
    case "b":
      if (pad) {
        pad.setButton(parsed.c, parsed.v);
        pad.syn();
      }
      return;
    case "a":
      if (pad) {
        pad.setAxis(parsed.c, parsed.v);
        pad.syn();
      }
      return;
    case "k":
      if (kb) {
        kb.key(parsed.c, parsed.v);
        kb.syn();
      }
      return;
    case "kr":
      if (kb) kb.reset();
      return;
    case "mr":
      if (mouse) {
        mouse.move(parsed.x, parsed.y);
        mouse.syn();
      }
      return;
    case "mb":
      if (mouse) {
        mouse.button(parsed.c, parsed.v);
        mouse.syn();
      }
      return;
    case "mw":
      if (mouse) {
        mouse.wheel(parsed.x, parsed.y);
        mouse.syn();
      }
      return;
    default:
      return;
  }
}

function releaseAllDevices(state) {
  try {
    if (state.pad) state.pad.reset();
    if (state.kb) state.kb.reset();
    if (state.mouse) state.mouse.reset();
  } catch {
    /* reset is best-effort */
  }
}

/* ------------------------------------------------ mic/cam stream sockets */

function handleStreamSocket(state, ws, req, kind) {
  const stream = state.stream;
  /* Only the camera page uses a viewer role (/ws/cam plain == viewer). */
  const role = kind === "cam"
    ? (new URL(req.url || "/", "http://x").searchParams.get("role") || "viewer")
    : "phone";

  if (role === "viewer") {
    if (!stream || !stream[kind]) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      return;
    }
    if (stream[kind].type === "relay") {
      stream.attachViewer(ws);
      ws.on("close", () => stream.detachViewer(ws));
      ws.on("error", () => stream.detachViewer(ws));
      return;
    }
    /* Real device backend (Linux) — nothing to relay. */
    try {
      ws.send(JSON.stringify({ t: "err", w: "direct device active; no viewer relay" }));
      ws.close();
    } catch {
      /* ignore */
    }
    return;
  }

  /* Role: phone producer. */
  if (!stream || !stream[kind]) {
    try {
      ws.send(JSON.stringify({ t: "err", w: "stream not started (call /api/stream/start first)" }));
      ws.close();
    } catch {
      /* ignore */
    }
    return;
  }
  const budget = { bytes: 0, window: Date.now() };
  clearTimeout(stream.stopTimer);
  const attached = stream.attach(kind, ws);
  if (!attached.ok) {
    try {
      ws.send(JSON.stringify({ t: "err", w: attached.why || "unavailable" }));
      ws.close();
    } catch {
      /* ignore */
    }
    return;
  }
  console.log(`${kind} stream attached`);
  ws.on("message", (data) => {
    const now = Date.now();
    if (now - budget.window > 2000) {
      budget.window = now;
      budget.bytes = 0;
    }
    budget.bytes += data.length;
    if (budget.bytes > RATE_BUDGET) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      return;
    }
    stream.feed(kind, data);
  });
  ws.on("close", () => {
    console.log(`${kind} stream detached`);
    stream.stopTimer = setTimeout(() => {
      if (state.stream[kind]) {
        try {
          state.stream.stop(kind);
        } catch {
          /* ignore */
        }
      }
    }, 6000);
    if (stream.stopTimer.unref) stream.stopTimer.unref();
  });
  ws.on("error", () => {
    /* close follows */
  });
}

/* ------------------------------------------------------------ /cam/watch */

function camWatchPage() {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Controll-D camera</title>
<style>
  body{margin:0;background:#101014;color:#e6e0e9;font:14px system-ui;display:grid;place-items:center;min-height:100vh}
  main{width:min(92vw,720px);text-align:center}
  video{width:100%;aspect-ratio:16/9;background:#000;border-radius:16px;object-fit:contain}
  p{color:#938f99}
</style></head><body><main>
<video id="v" autoplay muted playsinline></video>
<p id="s">Waiting for the phone's camera&hellip;</p>
</main>
<script>
const video = document.getElementById("v");
const status = document.getElementById("s");
let ws = null, retry = null, msTimer = null;

function open() {
  if (retry) { clearTimeout(retry); retry = null; }
  if (msTimer) { clearInterval(msTimer); msTimer = null; }
  ws = new WebSocket((location.protocol==="https:"?"wss:":"ws:")+"//"+location.host+"/ws/cam");
  ws.binaryType = "arraybuffer";
  let ms = null, sb = null, queue = [];

  ws.onopen = () => {
    ms = new MediaSource();
    video.src = URL.createObjectURL(ms);
    ms.addEventListener("sourceopen", () => {
      try { sb = ms.addSourceBuffer('video/webm; codecs="vp8"'); }
      catch { try { sb = ms.addSourceBuffer("video/webm"); } catch { status.textContent = "This browser cannot decode the stream."; } }
      if (sb) sb.mode = "segments";
    });
    const pump = () => {
      if (sb && !sb.updating && queue.length && ms.readyState === "open") {
        try { sb.appendBuffer(queue.shift()); } catch { /* stale segment */ }
      }
    };
    msTimer = setInterval(pump, 120);
    status.textContent = "Relay connected — waiting for frames\\u2026";
  };
  ws.onmessage = (ev) => {
    if (ev.data instanceof ArrayBuffer) {
      queue.push(ev.data);
      if (queue.length > 24) queue.shift();
    }
  };
  ws.onclose = () => {
    if (msTimer) { clearInterval(msTimer); msTimer = null; }
    try { video.src = ""; } catch { /* ignore */ }
    ms = null; sb = null; queue = [];
    status.textContent = "No camera stream yet — start it on the phone. Retrying\\u2026";
    if (!retry) retry = setTimeout(open, 2000);
  };
  ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
}
open();
</script></body></html>`;
}

/* --------------------------------------------------------------- boot */

function lanIp() {
  return new Promise((resolveIp) => {
    const sock = dgram.createSocket("udp4");
    sock.on("error", () => {
      sock.close();
      resolveIp("127.0.0.1");
    });
    sock.connect(80, "1.1.1.1", () => {
      try {
        resolveIp(sock.address().address);
      } catch {
        resolveIp("127.0.0.1");
      }
      sock.close();
    });
  });
}

async function makeGamepad(cfg) {
  if (process.platform === "linux") {
    return { pad: new VirtualGamepad(cfg.gamepadName), err: null };
  }
  if (process.platform === "win32") {
    try {
      return { pad: new VirtualGamepadWin(cfg.gamepadName), err: null };
    } catch (err) {
      return { pad: null, err: err.message };
    }
  }
  return { pad: null, err: "No gamepad support on macOS (needs a DriverKit system extension)" };
}

export async function ensureHid(state) {
  if (state.kb && state.mouse) return { ok: true };
  try {
    state.kb = await createKeyboard();
    state.mouse = await createMouse();
    return { ok: true, hint: hidHint() };
  } catch (err) {
    state.kb = state.mouse = null;
    return { ok: false, hint: err.message };
  }
}

export async function main() {
  const cfg = loadConfig();
  const state = createState(cfg);

  state.feats = await probePlatform();
  state.stream = new StreamManager(state.feats);

  const { pad, err } = await makeGamepad(cfg);
  state.pad = pad;
  if (pad) {
    try {
      pad.startRumbleWatcher((strong, weak, durationMs) => {
        const session = state.active;
        if (!session?.authed || session.ws.readyState !== session.ws.OPEN) return;
        const intensity = Math.max(strong, weak) / 65535.0;
        try {
          session.ws.send(
            JSON.stringify({ t: "v", i: Math.round(intensity * 1000) / 1000, d: Math.min(durationMs, 2000) }),
          );
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* rumble unsupported on this backend */
    }
  }

  const hid = await ensureHid(state);

  const server = createServerFromState(state);

  await new Promise((resolveListen) => {
    server.once("error", (e) => {
      if (e.code === "EADDRINUSE") {
        console.error(`\nError: port ${cfg.port} already in use — run: fuser -k ${cfg.port}/tcp\n`);
        process.exit(1);
      }
      throw e;
    });
    server.listen(cfg.port, cfg.host, () => resolveListen());
  });

  const lan = await lanIp();
  const phoneUrl = `http://${lan}:${cfg.port}/`;

  const okBadge = (f) => (f === "ok" ? "OK " : f === "relay" ? "relay" : `${f}`);
  console.log("");
  console.log(`  Controll-D v2.0 — ${process.platform} virtual devices`);
  console.log("  ----------------------------------------------");
  console.log(`  Gamepad  : ${err || (pad ? "OK (Xbox 360 class)" : "unavailable")}`);
  console.log(`  Keyboard : ${hid.ok || state.kb ? "OK" : hid.hint}`);
  console.log(`  Mouse    : ${state.mouse ? "OK" : hid.ok ? "unavailable" : hid.hint}`);
  console.log(`  Mic      : ${okBadge(state.feats.mic)}${state.feats.mic === "monitor" ? " (beta: plays to default output)" : ""}`);
  console.log(`  Camera   : ${okBadge(state.feats.cam)}${state.feats.cam === "relay" ? "" : state.feats.loopback ? ` (${state.feats.loopback})` : ""}`);
  console.log(`  Phone URL: ${phoneUrl}`);
  console.log(`  Local URL: http://127.0.0.1:${cfg.port}/`);
  if (cfg.host !== "127.0.0.1" && cfg.host !== "localhost") {
    console.log("  Network  : bound to 0.0.0.0 (all interfaces)");
  }
  console.log("");

  try {
    const qr = await QRCode.toString(phoneUrl, { type: "terminal", small: true });
    console.log("  Scan with your phone:\n");
    console.log(qr.split("\n").map((l) => "    " + l).join("\n"));
    console.log("");
  } catch {
    /* ignore qr generation failure */
  }

  const shutdown = () => {
    state.stream.shutdown();
    if (state.pad) state.pad.close();
    if (state.kb) state.kb.close();
    if (state.mouse) state.mouse.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
