/* Platform capability detection — one honest matrix used by the HUD,
 * the health endpoint and the boot banner.
 *
 * Results are cached per process (the expensive probes run at boot).
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const OS = os.platform(); // "linux" | "win32" | "darwin"

function run(cmd, args, timeoutMs = 3000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout, stderr });
    });
  });
}

async function which(name) {
  if (OS === "win32") {
    const res = await run("where", [name]);
    return res.ok && res.stdout.trim().length > 0;
  }
  const res = await run("sh", ["-lc", `command -v ${name} >/dev/null 2>&1 && echo yes`]);
  return /\byes\b/.test(res.stdout);
}

/* Find a v4l2loopback device node (Linux webcam target). */
function loopbackDevice() {
  if (OS !== "linux") return null;
  try {
    const base = "/sys/class/video4linux";
    const found = [];
    for (const name of fs.readdirSync(base)) {
      let label = "";
      try {
        label = fs.readFileSync(path.join(base, name, "name"), "utf-8");
      } catch {
        continue;
      }
      if (/v4l2loopback|dummy video device/i.test(label)) {
        found.push(`/dev/${name}`);
      }
    }
    return found.length ? found[found.length - 1] : null;
  } catch {
    return null;
  }
}

/* Does ViGEmClient.dll exist where gamepad-win.mjs looks for it? */
function vigemDllPresent() {
  if (OS !== "win32") return false;
  const exeDir = path.dirname(process.argv[1] || ".");
  for (const p of [
    process.env.VIGEM_DLL,
    path.join(process.cwd(), "ViGEmClient.dll"),
    path.join(exeDir, "ViGEmClient.dll"),
    path.join(process.cwd(), "vendor", "vigem", "ViGEmClient.dll"),
  ]) {
    if (p && fs.existsSync(p)) return true;
  }
  return false;
}

/* A real /dev/video target needs both ffmpeg and v4l2loopback. Otherwise
 * camera frames can still be relayed directly to /cam/watch (no ffmpeg). */
export function cameraMode(ffmpeg, loopback) {
  return ffmpeg && loopback ? "ok" : "relay";
}

export async function probePlatform() {
  const feats = {
    gamepad: "unsupported",
    keyboard: "ok",
    mouse: "ok",
    mic: "unsupported",
    cam: "unsupported",
    loopback: null,   // /dev/videoN for the webcam target (linux)
    ffmpeg: false,
    pactl: false,
    ffscale: false,   // ffplay present (mic/cam monitor path)
  };

  if (OS === "linux") {
    feats.gamepad = "ok";
    const [ff, pactl, ffplay] = await Promise.all([which("ffmpeg"), which("pactl"), which("ffplay")]);
    feats.ffmpeg = ff;
    feats.pactl = pactl;
    feats.ffscale = ffplay;
    feats.mic = ff && pactl ? "ok" : pactl ? "no-ffmpeg" : "no-pulse";
    feats.loopback = loopbackDevice();
    feats.cam = cameraMode(ff, feats.loopback);
  } else if (OS === "win32") {
    feats.gamepad = vigemDllPresent() ? "ok" : "no-vigem";
    const [ff] = await Promise.all([which("ffmpeg"), which("ffplay")]);
    feats.ffmpeg = ff;
    /* Win/mac mic + cam are relay/monitor workflows — no kernel devices. */
    feats.mic = ff ? "monitor" : "no-ffmpeg";
    feats.cam = cameraMode(ff, null);
  } else if (OS === "darwin") {
    feats.gamepad = "unsupported"; // needs a DriverKit system extension
    const [ff] = await Promise.all([which("ffmpeg"), which("ffplay")]);
    feats.ffmpeg = ff;
    feats.mic = ff ? "monitor" : "no-ffmpeg";
    feats.cam = cameraMode(ff, null);
    try {
      const hid = await import("./hid-mac.mjs");
      if (!hid.macPostAccess()) {
        feats.keyboard = "needs-accessibility";
        feats.mouse = "needs-accessibility";
      }
    } catch {
      /* koffi/framework missing — report the plain state */
    }
  }
  return feats;
}
