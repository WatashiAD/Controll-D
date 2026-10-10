/* Fullscreen helpers + best-effort auto-enter.
   Browsers only allow requestFullscreen from a user gesture (or special
   contexts like installed PWAs), so autoFullscreen() retries on every
   tap/keypress until fullscreen. All failures are silent by design. */

export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

export function fullscreenSupported() {
  const el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

export async function enterFullscreen() {
  if (isFullscreen()) return true;
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    return isFullscreen();
  } catch {
    return false;
  }
}

export async function exitFullscreen() {
  try {
    if (document.exitFullscreen && isFullscreen()) await document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  } catch {
    /* ignore */
  }
}

export function toggleFullscreen() {
  if (isFullscreen()) void exitFullscreen();
  else void enterFullscreen();
}

export function autoFullscreen(shouldRun) {
  if (!fullscreenSupported()) return () => {};
  void enterFullscreen(); // best effort: works in PWA/kiosk contexts
  const onGesture = () => {
    try {
      if (shouldRun && !shouldRun()) return;
    } catch {
      return;
    }
    if (!isFullscreen()) void enterFullscreen();
  };
  window.addEventListener("pointerdown", onGesture, { capture: true });
  window.addEventListener("keydown", onGesture, { capture: true });
  return () => {
    window.removeEventListener("pointerdown", onGesture, { capture: true });
    window.removeEventListener("keydown", onGesture, { capture: true });
  };
}
