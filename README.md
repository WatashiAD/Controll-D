# Controll-D

You already own a gamepad. You already own a webcam. You already own a
microphone. They're all the same device — the phone sitting next to you.

Controll-D is a small server for your PC and a web page for your phone.
Open the link, and your phone becomes:

- **🎮 a gamepad** — a real Xbox 360 controller as far as your games are
  concerned. Steam, emulators, couch co-op. With rumble, sent back to your
  phone.
- **⌨️ a keyboard** — your phone's own keyboard, typing straight into the PC.
  Ctrl/Alt/Shift/Meta and arrow keys included.
- **🖱️ a trackpad** — glide to move the cursor, tap to click, two fingers to
  scroll. If you've used a laptop trackpad, you know it.
- **🎙️ a microphone** — talk into your phone, apps on the PC see a mic.
- **📷 a camera** — your phone's camera as a webcam feed for the PC.

No app store. No account. No cloud. No dongles. Just a browser.

## Why not just buy the hardware?

Because this is free, and the hardware already exists in your pocket:

| Instead of buying... | You already have... |
|----------------------|---------------------|
| An Xbox/PC controller ($40–70) | the **Pad** mode |
| A wireless trackpad ($20–100) | the **Touch** mode |
| A USB microphone ($30+) | the **Mic** toggle |
| A webcam ($30–100) | the **Cam** toggle |

Your phone has better sensors than most of that hardware anyway — it just
needed a way to plug into the PC. That's what Controll-D is.

## Quick start

On the PC:

```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/WatashiAD/Controll-D/main/install.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/WatashiAD/Controll-D/main/install.ps1 | iex
```

Or from source:

```bash
git clone https://github.com/WatashiAD/Controll-D.git
cd Controll-D
npm install
npm start
```

On the phone: scan the QR code the server prints (or type the address into
your browser). Pick a mode from the on-screen tabs:

- **Pad** — touchscreen controller, Xbox or Nintendo layout, fully
  customizable in the built-in layout editor.
- **Keys** — opens your phone's normal keyboard; what you type lands on the
  PC. A small toolbar carries the keys phones don't have (Ctrl, Esc,
  arrows…).
- **Touch** — the trackpad. One finger moves, tap clicks, two fingers scroll
  and right-click.
- **Mic / Cam** buttons — start streaming to the PC whenever you need them.

Games see a standard Xbox 360 controller (VID `045E` / PID `028E`).

## What works where

| Feature | Linux | Windows | macOS |
|---------|-------|---------|-------|
| Gamepad | ✅ works | 🟡 needs [ViGEmBus](https://github.com/nefarius/ViGEmBus/releases) driver | ❌ macOS has no virtual driver API |
| Keyboard + trackpad | ✅ works | ✅ works | ✅ works (grant Accessibility permission) |
| Rumble → phone | ✅ works | ❌ not yet | ❌ |
| Microphone | ✅ real mic device | 🟡 monitor mode (beta) | 🟡 monitor mode (beta) |
| Camera | ✅ webcam or relay | 🟡 relay | 🟡 relay |

The server checks what your system supports at boot and tells you plainly —
no mysteries, no silent failures.

### The honest fine print

- **Windows gamepad** — one driver install ([ViGEmBus](https://github.com/nefarius/ViGEmBus/releases)),
  then drop `ViGEmClient.dll` into `vendor/`. The server prints the exact
  steps if something's missing.
- **Camera without extras** — works everywhere through the relay: open
  `http://<pc>:8765/cam/watch` on the PC, or use it as an OBS Browser
  Source. If you want Zoom/Discord to *see a webcam device* on Linux, that
  needs the optional `v4l2loopback` kernel module — install it only if
  you're comfortable with DKMS; otherwise relay mode is fine.
- **Linux permissions** — if keyboard/trackpad don't respond, put yourself
  in the `input` group: `sudo usermod -aG input $USER`, then re-login.
- **macOS first run** — approve the Accessibility permission when asked.
- **Mic on Windows/macOS** — beta: audio plays through the PC's default
  output. A virtual audio cable (VB-Cable / BlackHole) makes it usable as a
  real mic.

## Privacy & trust

- Everything runs on **your** machines. There is no cloud service, no
  account, no telemetry. If the phone and PC are on the same network,
  it works — offline from the internet, too.
- It's plain HTTP on your LAN by design, so keep it that way: don't port
  forward it, don't expose it to the internet. Your Wi-Fi password is the
  only gate.

## Under the hood

Node.js server, no native build step; the phone side is plain HTML/JS
served by the same server. Input reaches the PC through the platform's
virtual-device APIs (uinput / SendInput / CGEvent), media through ffmpeg.
Architecture notes live in [ARCHITECTURE.md](ARCHITECTURE.md).

Developers: `npm test` runs the unit suite, and `npm run check` enforces
that the client's button/axis/key tables exactly mirror the server's
whitelists.

## License

MIT — see [LICENSE](LICENSE).
