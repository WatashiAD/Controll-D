/* Message validation, whitelisting and rate limiting for the WS protocol. */

import { AXES, BUTTONS } from "./gamepad.mjs";

export const MAX_MESSAGE_BYTES = 4096;
const VALID_TYPES = new Set(["m", "b", "a", "p", "z"]);

export class RateLimiter {
  /* Token bucket, sized for gamepad event streams. */
  constructor(perSec, burst) {
    this.perSec = perSec;
    this.burst = burst;
    this.tokens = burst;
    this.updated = performance.now() / 1000;
  }

  allow() {
    const now = performance.now() / 1000;
    this.tokens = Math.min(this.burst, this.tokens + (now - this.updated) * this.perSec);
    this.updated = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

function clampFloat(value, lo, hi, def = 0.0) {
  if (typeof value === "boolean" || typeof value !== "number" || Number.isNaN(value)) {
    return def;
  }
  return Math.max(lo, Math.min(hi, value));
}

function isNum(value) {
  return typeof value === "number" && !Number.isNaN(value);
}

/* Parse and structurally validate one client message. */
export function parseMessage(raw) {
  let text = raw;
  if (Buffer.isBuffer(raw) || raw instanceof Uint8Array) {
    if (raw.length > MAX_MESSAGE_BYTES) return null;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    } catch {
      return null;
    }
  } else if (typeof text !== "string" || text.length > MAX_MESSAGE_BYTES) {
    return null;
  }
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return null;
  }
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return null;
  const type = msg.t;
  if (!VALID_TYPES.has(type)) return null;
  if (type === "b") {
    if (!(msg.c in BUTTONS)) return null;
    if (typeof msg.v !== "number" || Number.isNaN(msg.v)) return null;
    return { t: "b", c: msg.c, v: msg.v ? 1 : 0 };
  }
  if (type === "a") {
    if (!(msg.c in AXES)) return null;
    return { t: "a", c: msg.c, v: clampFloat(msg.v, -1.0, 1.0) };
  }
  if (type === "m") {
    const events = msg.e;
    if (!Array.isArray(events) || events.length > 64) return null;
    const out = [];
    for (const item of events) {
      if (!Array.isArray(item) || item.length !== 3) return null;
      const [kind, code, value] = item;
      if (kind === "b") {
        if (!(code in BUTTONS)) return null;
        if (!isNum(value)) return null;
        out.push(["b", code, value ? 1 : 0]);
      } else if (kind === "a") {
        if (!(code in AXES)) return null;
        out.push(["a", code, clampFloat(value, -1.0, 1.0)]);
      } else {
        return null;
      }
    }
    return { t: "m", e: out };
  }
  if (type === "p") return { t: "p", ts: msg.ts };
  if (type === "z") return { t: "z" };
  return null;
}
