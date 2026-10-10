/* Phone vibration: touch feedback + game rumble forwarding. */

let strength = 0.7;
let hapticsOn = true;
let rumbleOn = true;

const supported = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

/* Chrome blocks vibrate() (with an uncatchable console error) until the user
   has tapped the page at least once — e.g. auto-connect vibration right after
   a reload. Skip those calls: they couldn't buzz anyway. */
function activationOk() {
  const ua = typeof navigator !== "undefined" && navigator.userActivation;
  return !ua || !!ua.hasBeenActive;
}

export function configure({ haptics, hapticsStrength, rumble }) {
  hapticsOn = !!haptics;
  rumbleOn = !!rumble;
  strength = Math.max(0, Math.min(100, hapticsStrength ?? 70)) / 100;
}

export function tap(ms = 12) {
  if (!supported || !activationOk() || !hapticsOn || strength <= 0) return;
  try {
    navigator.vibrate(Math.max(4, Math.round(ms * (0.4 + strength * 0.8))));
  } catch {
    /* ignore */
  }
}

export function success() {
  if (!supported || !activationOk() || !hapticsOn) return;
  try {
    navigator.vibrate([18, 40, 18]);
  } catch {
    /* ignore */
  }
}

/* Game rumble from the PC. Intensity 0..1, duration in ms.
   Most phones cannot vary amplitude, so duty-cycle the pattern. */
export function gameRumble(intensity, durationMs) {
  if (!supported || !activationOk() || !rumbleOn) return;
  const i = Math.max(0, Math.min(1, intensity || 0));
  const d = Math.max(30, Math.min(1500, durationMs || 120));
  const on = Math.max(10, Math.round(d * (0.25 + i * 0.75)));
  try {
    navigator.vibrate(on);
  } catch {
    /* ignore */
  }
}
