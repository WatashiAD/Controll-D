/* Cotrll-D server: HTTP (static client) + WebSocket (input stream) + uinput pad. */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import dgram from "node:dgram";
import { WebSocketServer } from "ws";

import { loadConfig } from "./config.mjs";
import { GamepadError, VirtualGamepad } from "./gamepad.mjs";
import { RateLimiter, parseMessage } from "./protocol.mjs";
import { TelemetryReporter } from "./telemetry.mjs";
import QRCode from "qrcode";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, "..", "web");
const MAX_WS_BYTES = 8192;

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

export function createState(cfg) {
  return { cfg, pad: null, active: null, telemetry: new TelemetryReporter(cfg) };
}

function clientIp(req) {
  const addr = req.socket?.remoteAddress || "?";
  return addr.startsWith("::ffff:") ? addr.slice(7) : addr;
}

export function createServerFromState(state) {
  const { cfg } = state;
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_BYTES });

  wss.on("connection", (ws, req) => handleSocket(state, ws, req));

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://x");
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { "cache-control": "no-store" });
        res.end();
        return;
      }
      if (url.pathname === "/api/info") {
        sendJson(res, 200, {
          name: "cotrll-d",
          version: "1.0.0",
          pad: state.pad !== null,
          clients: state.active ? 1 : 0,
          telemetry: !!state.telemetry?.enabled,
        });
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
      if (url.pathname === "/ws") {
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
      if (url.pathname !== "/ws") {
        socket.destroy();
        return;
      }
    } catch {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
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
  session.ws.send(JSON.stringify({ t: "ok", pad: state.pad !== null }));
  state.telemetry?.notifySessionChange();
  console.log(`Session activated (pad=${state.pad !== null})`);
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

    if (parsed.t === "p") {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: "p", ts: parsed.ts ?? null }));
      return;
    }
    const pad = state.pad;
    if (!pad) return;
    if (parsed.t === "z") {
      pad.reset();
      return;
    }
    if (parsed.t === "m") {
      for (const [kind, code, value] of parsed.e) {
        if (kind === "b") pad.setButton(code, value);
        else pad.setAxis(code, value);
      }
      pad.syn();
    } else if (parsed.t === "b") {
      pad.setButton(parsed.c, parsed.v);
      pad.syn();
    } else if (parsed.t === "a") {
      pad.setAxis(parsed.c, parsed.v);
      pad.syn();
    }
  });

  const cleanup = () => {
    clearInterval(heartbeat);
    if (state.active === session) {
      state.active = null;
      if (state.pad) state.pad.reset();
      state.telemetry?.notifySessionChange();
    }
    console.log(`WS disconnected from ${ip}`);
  };
  ws.on("close", cleanup);
  ws.on("error", () => {
    /* close follows */
  });
}

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

export async function main() {
  const cfg = loadConfig();
  const state = createState(cfg);
  try {
    state.pad = new VirtualGamepad(cfg.gamepadName);
    state.pad.startRumbleWatcher(async (strong, weak, durationMs) => {
      const session = state.active;
      if (!session || !session.authed || session.ws.readyState !== session.ws.OPEN) return;
      const intensity = Math.max(strong, weak) / 65535.0;
      try {
        session.ws.send(
          JSON.stringify({ t: "v", i: Math.round(intensity * 1000) / 1000, d: Math.min(durationMs, 2000) }),
        );
      } catch {
        /* ignore */
      }
    });
  } catch (err) {
    if (err instanceof GamepadError) console.error(`${err.message}`);
    else console.error(`${err?.message || err}`);
    state.pad = null;
  }

  const server = createServerFromState(state);
  const lan = await lanIp();
  const phoneUrl = `http://${lan}:${cfg.port}/`;

  console.log("");
  console.log("  🎮 Cotrll-D v1.0 — Wireless Virtual Gamepad");
  console.log("  ───────────────────────────────────────────");
  console.log(`  Gamepad   : ${state.pad ? `Active (${cfg.gamepadName})` : "Virtual pad disabled"}`);
  console.log(`  Phone URL : ${phoneUrl}`);
  console.log(`  Local URL : http://127.0.0.1:${cfg.port}/`);
  if (cfg.host !== "127.0.0.1" && cfg.host !== "localhost") {
    console.log("  Network   : Bound to 0.0.0.0 (all interfaces)");
  }
  if (state.telemetry?.enabled) {
    console.log("  Telemetry : Anonymous live tracker active");
  }
  console.log("");

  server.listen(cfg.port, cfg.host);
  state.telemetry.start(state);

  try {
    const qr = await QRCode.toString(phoneUrl, { type: "terminal", small: true });
    console.log("  📱 Scan with your phone to start gaming:\n");
    console.log(qr.split("\n").map((l) => "    " + l).join("\n"));
    console.log("");
  } catch {
    /* ignore qr generation failure */
  }

  const shutdown = () => {
    state.telemetry?.stop();
    if (state.pad) state.pad.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
