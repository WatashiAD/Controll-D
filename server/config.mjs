/* Runtime configuration for the Cotrll-D server.
 *
 * Precedence: environment variables > config.json > defaults.
 * No authentication: any client on the network can drive the pad.
 * Only run on a trusted LAN.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = process.env.COTRLL_CONFIG || resolve(ROOT, "config.json");

const DEFAULTS = {
  host: "0.0.0.0",
  port: 8765,
  gamepadName: "Cotrll-D Virtual Gamepad",
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
  const pick = (envKey, fileKey, def, cast) => {
    const raw = process.env[envKey] ?? file[fileKey];
    if (raw == null) return def;
    const v = cast(raw);
    return Number.isNaN(v) && typeof def === "number" ? def : v;
  };
  return {
    host: pick("COTRLL_HOST", "host", DEFAULTS.host, String),
    port: pick("COTRLL_PORT", "port", DEFAULTS.port, Number),
    gamepadName: pick("COTRLL_GAMEPAD_NAME", "gamepad_name", DEFAULTS.gamepadName, String),
    rateLimitPerSec: pick(
      "COTRLL_RATE_PER_SEC", "rate_limit_per_sec", DEFAULTS.rateLimitPerSec, Number,
    ),
    rateLimitBurst: pick(
      "COTRLL_RATE_BURST", "rate_limit_burst", DEFAULTS.rateLimitBurst, Number,
    ),
  };
}
