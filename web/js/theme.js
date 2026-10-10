/* Theme application: preset + optional user accent override. */

export const THEMES = [
  ["expressive", "M3 Expressive"],
  ["gus", "Gus"],
  ["midnight", "Midnight"],
  ["retro", "Retro"],
  ["light", "Light"],
];

export function applyTheme(theme, accent) {
  let name = theme === "lavender" ? "expressive" : theme;
  name = THEMES.some(([id]) => id === name) ? name : "expressive";
  document.documentElement.dataset.ctheme = name;
  if (name === "light") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", "dark");
  if (accent) {
    document.documentElement.style.setProperty("--accent-user", accent);
    document.documentElement.setAttribute("data-accent", "");
  } else {
    document.documentElement.style.removeProperty("--accent-user");
    document.documentElement.removeAttribute("data-accent");
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    if (bg) meta.content = bg;
  }
}
