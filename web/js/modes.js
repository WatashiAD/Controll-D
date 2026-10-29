/* HUD mode tabs: Pad / Keys / Touch. Exactly one overlay is visible; the
 * gamepad stage owns `pad`. Editing the layout always forces `pad`.
 */

export function initModes({ stage, keyboard, trackpad, isEditing }) {
  const bar = document.getElementById("mode-tabs");
  let mode = "pad";

  const views = {
    pad: () => {
      if (stage) stage.el.hidden = false;
      keyboard.hide();
    },
    keyboard: () => {
      if (stage) stage.el.hidden = true;
      keyboard.show();
    },
    trackpad: () => {
      if (stage) stage.el.hidden = true;
      trackpad.show();
    },
  };

  function syncBar() {
    if (!bar) return;
    bar.querySelectorAll("[data-mode]").forEach((btn) => {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    bar.classList.toggle("locked", isEditing());
  }

  function set(next) {
    if (isEditing() || next === mode) {
      syncBar();
      return false;
    }
    /* leaving keyboard/trackpad releases their held inputs first */
    if (mode === "keyboard") keyboard.release();
    if (mode === "trackpad") trackpad.release();
    mode = next;
    views[next]();
    syncBar();
    return true;
  }

  if (bar) {
    bar.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-mode]");
      if (!btn) return;
      if (set(btn.dataset.mode)) {
        btn.blur();
      }
    });
  }

  syncBar();
  return {
    set,
    get: () => mode,
    forcePad: () => set("pad"),
    sync: syncBar,
  };
}
