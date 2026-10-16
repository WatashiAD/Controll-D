/* Runtime configuration for the Controll-D server.
 *
 * Precedence: environment variables > config.json > defaults.
 * No authentication: any client on the network can drive the pad.
 * Only run on a trusted LAN.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = process.env.CONTROLL_CONFIG || process.env.COTRLL_CONFIG || resolve(ROOT, "config.json");

const DEFAULTS = {
  host: "0.0.0.0",
  port: 8765,
  gamepadName: "Controll-D Virtual Gamepad",
  rateLimitPerSec: 800.0,
  rateLimitBurst: 1600.0,
};

function loadFile() {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    const data = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

export function loadConfig() {
  const file = loadFile();
  const pick = (envKeys, fileKey, def, cast) => {
    const keys = Array.isArray(envKeys) ? envKeys : [envKeys];
    let raw = null;
    for (const k of keys) {
      if (process.env[k] != null) { raw = process.env[k]; break; }
    }
    if (raw == null) raw = file[fileKey];
    if (raw == null) return def;
    const v = cast(raw);
    return Number.isNaN(v) && typeof def === "number" ? def : v;
  };
  return {
    host: pick(["CONTROLL_HOST", "COTRLL_HOST"], "host", DEFAULTS.host, String),
    port: pick(["CONTROLL_PORT", "COTRLL_PORT"], "port", DEFAULTS.port, Number),
    gamepadName: pick(["CONTROLL_GAMEPAD_NAME", "COTRLL_GAMEPAD_NAME"], "gamepad_name", DEFAULTS.gamepadName, String),
    rateLimitPerSec: pick(
      ["CONTROLL_RATE_PER_SEC", "COTRLL_RATE_PER_SEC"], "rate_limit_per_sec", DEFAULTS.rateLimitPerSec, Number,
    ),
    rateLimitBurst: pick(
      ["CONTROLL_RATE_BURST", "COTRLL_RATE_BURST"], "rate_limit_burst", DEFAULTS.rateLimitBurst, Number,
    ),
  };
}
