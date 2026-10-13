# Controll-D v1.0 🎮

Turn your smartphone or tablet into a fully customizable, low-latency wireless game controller for your PC.

No apps to download on your phone — just scan the terminal QR code or open the link in any mobile browser (iOS Safari, Android Chrome).

---

## ⚡ Instant Install (1 Command)

### **Linux & macOS (Terminal)**
```bash
curl -fsSL https://raw.githubusercontent.com/WatashiAD/Cotrll-D/main/install.sh | bash
```

### **Windows (PowerShell)**
```powershell
irm https://raw.githubusercontent.com/WatashiAD/Cotrll-D/main/install.ps1 | iex
```

After installation, simply run **`cotrll-d`** from any terminal or open it from your app launcher.

---

## 🚀 How to Play

1. **Start the server on your PC**:
   ```bash
   cotrll-d
   ```
2. **Scan the QR code**:
   A compact QR code will appear right in your terminal. Scan it with your phone's camera.
3. **Start gaming!**:
   Your PC instantly detects a standard Xbox 360 controller. Launch any game on Steam, Epic, or an emulator and play!

---

## ✨ Features

- 🌸 **Material 3 Expressive Design**: Pixel-accurate clover ABXY cluster, 8-lobed analog stick flower wells, smooth D-pad, and pill shoulders.
- ⚡ **Ultra-Low Latency**: Lightweight binary WebSocket pipeline delivering sub-millisecond input responsiveness over local Wi-Fi.
- 📳 **Haptic Feedback & Rumble**: In-game force feedback rumble is forwarded directly to your phone's vibration motor.
- 🛠️ **Built-in Layout Editor**: Tap **Edit** to drag, resize, or customize button shapes and positions on the fly.
- 🎨 **Theme Presets**: Switch between Expressive Lavender, Midnight, Retro, Light, or customize your own accent colors.
- 📱 **Zero Install on Phone**: Pure web standards (HTML5, Pointer Events, WebSockets). Works on iOS, Android, tablets, and folding phones.

---

## 💻 Manual Setup (From Source)

If you prefer to clone and run from source:

```bash
git clone https://github.com/WatashiAD/Cotrll-D.git
cd Cotrll-D
npm install
npm start
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
