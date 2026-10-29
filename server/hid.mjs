/* Virtual keyboard + trackpad-backed mouse — platform facade.
 *
 * The rest of the server never sees the OS; these factories return a
 * common interface:
 *   Keyboard: key(name, 0|1) -> bool, reset(), syn(), close()
 *   Mouse:    move(dx, dy), button(name, 0|1) -> bool,
 *             wheel(x, y) (y>0 scrolls down), reset(), syn(), close()
 */

import os from "node:os";

export async function createKeyboard() {
  const platform = os.platform();
  if (platform === "win32") {
    const m = await import("./hid-win.mjs");
    return new m.WinKeyboard();
  }
  if (platform === "darwin") {
    const m = await import("./hid-mac.mjs");
    return new m.MacKeyboard();
  }
  const m = await import("./hid-linux.mjs");
  return new m.LinuxKeyboard();
}

export async function createMouse() {
  const platform = os.platform();
  if (platform === "win32") {
    const m = await import("./hid-win.mjs");
    return new m.WinMouse();
  }
  if (platform === "darwin") {
    const m = await import("./hid-mac.mjs");
    return new m.MacMouse();
  }
  const m = await import("./hid-linux.mjs");
  return new m.LinuxMouse();
}

/* Human-readable per-platform setup hint when a feature is blocked. */
export function hidHint() {
  const platform = os.platform();
  if (platform === "darwin") {
    return "System Settings → Privacy & Security → Accessibility → allow Node.js (or your terminal).";
  }
  if (platform === "win32") {
    return "Keyboard & mouse use Windows SendInput — no extra drivers needed.";
  }
  return "Linux routes through /dev/uinput — add your user to the 'input' group (sudo usermod -aG input $USER).";
}
