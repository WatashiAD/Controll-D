/* Virtual mic + webcam bridge.
 *
 * Linux  : mic = PipeWire/Pulse (module-pipe-source + ffmpeg decode),
 *          cam = v4l2loopback device written by ffmpeg.
 * Win/mac: no unprivileged virtual devices — the phone stream is relayed to
 *          browser viewers on http://<host>:<port>/cam/watch (usable as an
 *          OBS browser source), and microphone monitoring uses ffplay on the
 *          default output device ("monitor" quality — beta).
 */

import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export class StreamManager {
  constructor(features) {
    this.features = features || {};
    this.mic = null;
    this.cam = null;
    this.viewers = new Set(); // cam/watch relays
  }

  /* ------------------------------------------------------------ mic */

  streamOk(kind) {
    const st = this.features[kind];
    if (kind === "mic") {
      if (st === "ok") return { ok: true };
      if (st === "monitor") return { ok: true, monitor: true };
      return { ok: false, why: st || "unsupported" };
    }
    if (st === "ok" || st === "relay") return { ok: true };
    return { ok: false, why: st || "unsupported" };
  }

  async start(kind) {
    const gate = this.streamOk(kind);
    if (!gate.ok) return gate;
    if (this[kind]) return { ok: true };
    try {
      this[kind] = kind === "mic" ? await this._micStart() : await this._camStart();
      return { ok: true };
    } catch (err) {
      this.stop(kind);
      return { ok: false, why: err.message || "start failed" };
    }
  }

  async _micStart() {
    if (os.platform() === "linux") return { type: "fifo", ...(await this._micPulse()) };
    /* monitor mode (win/mac): decode the phone's stream → ffplay on the
       default output device. Works best when that device is a virtual
       audio cable (VB-Cable / BlackHole). */
    const proc = spawn(
      "ffplay",
      ["-hide_banner", "-loglevel", "quiet", "-nodisp", "-autoexit", "-i", "pipe:0"],
      { stdio: ["pipe", "ignore", "ignore"] },
    );
    return { type: "ffplay", proc };
  }

  async _micPulse() {
    const fifo = path.join(os.tmpdir(), `controld-mic-${process.pid}.pcm`);
    fs.rmSync(fifo, { force: true });
    await run("mkfifo", [fifo]);
    const load = await run("pactl", [
      "load-module", "module-pipe-source",
      "source_name=controld_vec",
      `file=${fifo}`, "format=s16le", "rate=48000", "channels=1",
      "source_properties=device.description=Controll-D-Microphone",
    ]);
    if (!load.ok) {
      rl(`pactl load-module failed: ${load.stderr || load.stdout}`);
      throw new Error("could not create virtual mic (PipeWire/Pulse)");
    }
    const idx = (load.stdout || "").trim();
    const proc = spawnFF([
      "-f", "s16le", "-ar", "48000", "-ac", "1", fifo,
    ]);
    drainStderr(proc);
    return { type: "fifo", fifo, idx, proc };
  }

  async _camStart() {
    if (this.features.cam === "relay") {
      return { type: "relay" };
    }
    const dev = this.features.loopback;
    const proc = spawnFF([
      "-f", "v4l2", "-pix_fmt", "yuyv422",
      "-vf", "fps=30,scale=1280:720", dev,
    ]);
    drainStderr(proc);
    return { type: "v4l2", dev, proc };
  }

  /* ------------------------------------------------ attach / stop */

  attach(kind, ws) {
    if (kind !== "mic" && kind !== "cam") return { ok: false, why: "unknown kind" };
    const stream = this[kind];
    if (!stream) return { ok: false, why: "not started" };
    stream.ws = ws;
    return { ok: true };
  }

  feed(kind, chunk) {
    const stream = this[kind];
    if (!stream) return;
    if (stream.proc?.stdin && !stream.proc.stdin.destroyed) {
      /* fifo (ffmpeg→pulse), v4l2 (ffmpeg→loopback), ffplay-monitor */
      stream.proc.stdin.write(chunk);
    } else if (stream.type === "relay") {
      for (const viewer of this.viewers) {
        try {
          if (viewer.readyState === viewer.OPEN) viewer.send(chunk);
          else this.viewers.delete(viewer);
        } catch {
          this.viewers.delete(viewer);
        }
      }
    }
  }

  stop(kind) {
    const stream = this[kind];
    this[kind] = null;
    if (!stream) return { ok: true };
    killStream(stream);
    if (stream.type === "fifo" && stream.idx) {
      void run("pactl", ["unload-module", stream.idx], 3000);
    }
    if (kind === "mic") {
      if (stream.fifo) fs.rmSync(stream.fifo, { force: true });
    }
    return { ok: true };
  }

  attachViewer(ws) {
    this.viewers.add(ws);
  }

  detachViewer(ws) {
    this.viewers.delete(ws);
  }

  shutdown() {
    for (const kind of ["mic", "cam"]) {
      this.stop(kind);
    }
    for (const viewer of this.viewers) {
      try {
        viewer.close();
      } catch {
        /* ignore */
      }
    }
    this.viewers.clear();
  }
}

function rl(msg) {
  console.warn(`media: ${msg}`);
}

/* ffmpeg input pipeline helper: stdin = raw dump from the phone. */
function spawnFF(outArgs) {
  const args = [
    "-hide_banner", "-loglevel", "error",
    "-fflags", "nobuffer", "-flags", "low_delay",
    "-i", "pipe:0",
    ...outArgs,
  ];
  return spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
}

/* Attach stderr draining so the pipe can't back up (loglevel=error only). */
export function drainStderr(proc) {
  if (proc?.stderr) {
    proc.stderr.on("data", (d) => {
      const text = d.toString().trim();
      if (text) console.warn(`ffmpeg: ${text.slice(0, 240)}`);
    });
  }
}

/* One ffplay instance shared by stream type. */
function killStream(stream) {
  if (!stream) return;
  if (stream.proc) {
    try {
      stream.proc.stdin?.end?.();
    } catch {
      /* ignore */
    }
    try {
      stream.proc.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
}

function run(cmd, args, timeoutMs = 4000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout, stderr });
    });
  });
}
