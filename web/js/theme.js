/* Theme colors: Primary (buttons/face) and Secondary (labels/knobs/accent). */

export const DEFAULT_PRIMARY = "#655095";
export const DEFAULT_SECONDARY = "#d0bcff";

export function applyColors(primary, secondary) {
  const p = primary || DEFAULT_PRIMARY;
  const s = secondary || DEFAULT_SECONDARY;
  const root = document.documentElement;

  root.dataset.ctheme = "expressive";
  root.setAttribute("data-theme", "dark");

  root.style.setProperty("--ctrl-face", p);
  root.style.setProperty("--accent", s);
  root.style.setProperty("--ctrl-text", s);
  root.style.setProperty("--knob-bg", s);
  root.style.setProperty("--md-sys-color-primary", s);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = "#383838";
}
