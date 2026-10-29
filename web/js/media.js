/* Microphone + camera streaming to the PC.
 *
 * Linux   : ffmpeg feeds a virtual mic (PipeWire/Pulse) and, when present,
 *           a v4l2loopback webcam.
 * Win/mac : audio is relayed through ffplay on the default output device
 *           (beta — install a virtual cable for best results) and the
 *           camera is watched in a browser at /cam/watch.
 */

const MIC_MIMES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];
const CAM_MIMES = [
  "video/webm;codecs=vp8",
  "video/webm;codecs=vp9",
  "video/webm;codecs=h264",
  "video/webm",
  "video/mp4",
];
const CHUNK_MS = 250;
const WS_BACKPRESSURE = 3 * 1024 * 1024;

function pickMime(candidates) {
  if (!window.MediaRecorder) return null;
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

export class MediaHub {
  constructor({ banner }) {
    this.banner = banner || (() => {});
    this.features = null;
    this.state = { mic: null, cam: null }; // active session objects
  }

  /* ------------------------------------------------------------ probe */

  async probe() {
    try {
      const res = await fetch("/api/info", { cache: "no-store" });
      const info = await res.json();
      this.features = info.features || {};
      this.platform = info.platform;
      this.serverUrl = `${location.protocol}//${location.host}`;
      return info;
    } catch {
      this.features = {};
      return null;
    }
  }

  status(kind) {
    return (this.features || {})[kind] || "unsupported";
  }

  isLive(kind) {
    return !!this.state[kind];
  }

  /* ------------------------------------------------------------ toggle */

  async toggle(kind) {
    if (this.state[kind]) {
      await this.stop(kind);
      return true;
    }
    await this.start(kind);
    return this.isLive(kind);
  }

  async start(kind) {
    const status = this.status(kind);
    if (kind === "mic" && (status === "ok" || status === "monitor")) {
      if (status === "monitor") {
        this.banner(
          "Beta: mic is relayed through the PC's default output device. Install a virtual audio cable (VB-Cable / BlackHole) and set it as default for best results.",
          { kind: "info" },
        );
      }
      return this._capture(kind, MIC_MIMES, {
        audio: {
          echoCancellation: false,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
    }
    if (kind === "mic") return this._failMic(status);
    if (kind === "cam") {
      if (status === "ok" || status === "relay") {
        if (status === "relay") {
          this.banner(
            "Camera relay: open this page on the PC to watch the feed — see Help for the /cam/watch link.",
            { kind: "info" },
          );
        }
        return this._capture(kind, CAM_MIMES, {
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 },
          },
        });
      }
      return this._failCam(status);
    }
  }

  _failMic(status) {
    const p = this.platform;
    if (status === "no-ffmpeg") {
      this.banner(
        p === "win32"
          ? "Mic needs ffmpeg+ffplay on the PC: winget install ffmpeg"
          : p === "darwin"
            ? "Mic needs ffmpeg+ffplay on the PC: brew install ffmpeg"
            : "Mic needs ffmpeg on the PC: sudo apt install ffmpeg",
      );
    } else {
      this.banner("Mic unavailable: no PipeWire/Pulse session on the PC (run Controll-D inside your desktop session).");
    }
  }

  _failCam(status) {
    if (status === "no-ffmpeg") {
      const p = this.platform;
      this.banner(
        p === "win32"
          ? "Camera relay needs ffmpeg on the PC: winget install ffmpeg"
          : p === "darwin"
            ? "Camera relay needs ffmpeg on the PC: brew install ffmpeg"
            : "Camera needs ffmpeg on the PC: sudo apt install ffmpeg",
      );
    } else {
      this.banner("Camera streaming is not supported on this platform yet.");
    }
  }

  /* ----------------------------------------------------------- capture */

  async _capture(kind, mimes, constraints) {
    const mime = pickMime(mimes);
    if (!mime) {
      this.banner("This browser cannot encode media streams (MediaRecorder missing).");
      return false;
    }
    /* spin up the PC-side pipe (virtual device or ffplay) first */
    try {
      const res = await fetch(`/api/stream/start?kind=${kind}`, { method: "POST" });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.ok === false) {
        throw new Error(out.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      this.banner(`Could not start the ${kind === "mic" ? "microphone" : "camera"} pipe on the PC.` + (err && err.message ? ` (${err.message})` : ""));
      return false;
    }
    let media;
    try {
      media = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      this.banner(
        err && err.name === "NotAllowedError"
          ? `${kind === "mic" ? "Microphone" : "Camera"} permission was denied.`
          : `${kind === "mic" ? "Microphone" : "Camera"} could not be opened.` + (err && err.message ? ` (${err.message})` : ""),
      );
      return false;
    }

    const session = { kind, media, chunks: 0 };
    try {
      session.ws = await this._openWs(kind);
      session.recorder = new MediaRecorder(media, {
        mimeType: mime,
        audioBitsPerSecond: kind === "mic" ? 128000 : undefined,
        videoBitsPerSecond: kind === "cam" ? 2500000 : undefined,
      });
    } catch (err) {
      this._teardownSession(session);
      this.banner(err && err.message ? `Stream failed: ${err.message}` : "Stream failed to start.");
      return false;
    }

    session.recorder.ondataavailable = (ev) => {
      if (!(ev.data && ev.data.size) || !session.ws || session.ws.readyState !== 1) return;
      if (session.ws.bufferedAmount > WS_BACKPRESSURE) return; // drop, stay real-time
      session.ws.send(ev.data);
    };
    session.ws.onclose = () => {
      if (this.state[kind] === session) this.stop(kind, { silent: true });
    };

    session.recorder.start(CHUNK_MS);
    this.state[kind] = session;
    if (kind === "mic") this._startVU(session);
    if (kind === "cam") this._pipShow(session);
    return true;
  }

  _openWs(kind) {
    return new Promise((resolve, reject) => {
      const query = kind === "cam" ? "?role=phone" : "";
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/${kind}${query}`,
      );
      ws.binaryType = "arraybuffer";
      const timer = setTimeout(() => reject(new Error("stream link timed out")), 6000);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve(ws);
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error("stream link refused (is the stream started on the server?)"));
      };
    });
  }

  async stop(kind, { silent } = {}) {
    const session = this.state[kind];
    this.state[kind] = null;
    if (kind === "mic") this._stopVU();
    if (kind === "cam") this._pipHide();
    if (!session) return;
    this._teardownSession(session);
    try {
      await fetch(`/api/stream/stop?kind=${kind}`, { method: "POST" });
    } catch {
      if (!silent) this.banner("Could not reach the server to fully stop the stream.");
    }
  }

  _teardownSession(session) {
    try {
      if (session.recorder && session.recorder.state !== "inactive") {
        session.recorder.stop();
      }
    } catch {
      /* ignore */
    }
    try {
      if (session.ws) session.ws.close();
    } catch {
      /* ignore */
    }
    try {
      session.media?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
  }

  /* ---------------------------------------------------------------- VU |

   * Live input level ring on the mic button (rAF driven, cheap).   */

  _startVU(session) {
    const btn = document.getElementById("btn-mic");
    if (!btn || !window.AudioContext) return;
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(session.media);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        if (this.state.mic !== session) {
          ctx.close().catch(() => {});
          return;
        }
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i += 4) {
          const d = Math.abs(buf[i] - 128);
          if (d > peak) peak = d;
        }
        btn.style.setProperty("--vu", String(Math.min(1, peak / 96)));
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      btn.classList.add("live");
    } catch {
      /* analyser unavailable — button just shows the on state */
      btn.classList.add("live");
    }
  }

  _stopVU() {
    const btn = document.getElementById("btn-mic");
    if (btn) {
      btn.classList.remove("live");
      btn.style.removeProperty("--vu");
    }
  }

  /* --------------------------------------------------------------- PiP */

  _pipShow(session) {
    const pip = document.getElementById("cam-pip");
    const video = document.getElementById("cam-video");
    if (!pip || !video) return;
    video.srcObject = session.media;
    pip.hidden = false;
  }

  _pipHide() {
    const pip = document.getElementById("cam-pip");
    const video = document.getElementById("cam-video");
    if (video) video.srcObject = null;
    if (pip) pip.hidden = true;
  }

  /* ---------------------------------------------------------- lifecycle */

  async stopAll() {
    await Promise.allSettled([this.stop("mic", { silent: true }), this.stop("cam", { silent: true })]);
  }
}
