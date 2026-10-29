/* Native phone keyboard bridge.
 *
 * The visible textarea is focused synchronously when the Keys mode is
 * selected, which opens iOS/Android's own software keyboard. beforeinput
 * events are translated to whitelisted physical PC key presses.
 */

import { strokesForInput, strokesForText } from "./native-keys.js";

const MODS = [
  ["KEY_LEFTCTRL", "Ctrl"],
  ["KEY_LEFTALT", "Alt"],
  ["KEY_LEFTSHIFT", "Shift"],
  ["KEY_LEFTMETA", "Meta"],
];

const ARROW = (path) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;

const QUICK_KEYS = [
  ["KEY_ESC", "Esc"],
  ["KEY_TAB", "Tab"],
  ["KEY_HOME", "Home"],
  ["KEY_END", "End"],
  ["KEY_LEFT", ARROW("m15 6-6 6 6 6"), "Left arrow"],
  ["KEY_DOWN", ARROW("m6 9 6 6 6-6"), "Down arrow"],
  ["KEY_UP", ARROW("m6 15 6-6 6 6"), "Up arrow"],
  ["KEY_RIGHT", ARROW("m9 6 6 6-6 6"), "Right arrow"],
  ["KEY_DELETE", "Del"],
];

const KEYBOARD_ICON = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M7 13h10"/></svg>`;

export class KeyboardOverlay {
  constructor(transport, haptics) {
    this.transport = transport;
    this.haptics = haptics;
    this.el = document.getElementById("kb-overlay");
    this.rows = document.getElementById("kb-rows");
    this.nav = document.getElementById("kb-nav");
    this.latched = new Set();
    this.composing = false;

    this._render();
    this._bindInput();
    this._renderNav();
  }

  /* --------------------------------------------------------------- UI */

  _render() {
    this.rows.innerHTML = `
      <div class="kb-native-card">
        <label class="kb-native-label" for="kb-native-input">
          <span class="kb-native-icon">${KEYBOARD_ICON}</span>
          <span><strong>Phone keyboard</strong><small>Typing is sent directly to your PC</small></span>
        </label>
        <textarea id="kb-native-input" rows="1" inputmode="text"
          enterkeyhint="enter" autocomplete="off" autocorrect="on"
          autocapitalize="sentences" spellcheck="true"
          aria-label="Type on the connected PC"
          placeholder="Tap here to type on PC…"></textarea>
      </div>`;
    this.input = document.getElementById("kb-native-input");
  }

  _renderNav() {
    const mods = MODS.map(([code, label]) => `
      <button type="button" tabindex="-1" class="kb-key kb-mod ${this.latched.has(code) ? "on" : ""}"
        data-mod="${code}" aria-pressed="${this.latched.has(code)}">${label}</button>`).join("");
    const keys = QUICK_KEYS.map(([code, label, aria]) => `
      <button type="button" tabindex="-1" class="kb-key" data-key="${code}"
        ${aria ? `aria-label="${aria}"` : ""}>${label}</button>`).join("");
    this.nav.innerHTML = `${mods}<span class="kb-nav-divider" aria-hidden="true"></span>${keys}`;

    this.nav.querySelectorAll("[data-mod]").forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        this._toggleModifier(button.dataset.mod);
      });
    });
    this.nav.querySelectorAll("[data-key]").forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        this.haptics.tap();
        this._sendStroke({ code: button.dataset.key, shift: false });
        this._focus();
      });
    });
  }

  /* ------------------------------------------------------ native input */

  _bindInput() {
    this.input.addEventListener("beforeinput", (event) => {
      if (this.composing || event.isComposing || event.inputType === "insertCompositionText") return;
      const strokes = strokesForInput(event.inputType, event.data);
      if (strokes.length) {
        event.preventDefault();
        this._sendStrokes(strokes);
        this.input.value = "";
      }
    });

    this.input.addEventListener("compositionstart", () => {
      this.composing = true;
    });
    this.input.addEventListener("compositionend", (event) => {
      this.composing = false;
      this._sendStrokes(strokesForText(event.data || this.input.value));
      this.input.value = "";
    });

    /* Browser fallback for keyboards that omit beforeinput.data. */
    this.input.addEventListener("input", () => {
      if (this.composing || !this.input.value) return;
      this._sendStrokes(strokesForText(this.input.value));
      this.input.value = "";
    });

    this.input.addEventListener("paste", (event) => {
      const text = event.clipboardData?.getData("text") || "";
      if (!text) return;
      event.preventDefault();
      this._sendStrokes(strokesForText(text));
      this.input.value = "";
    });

    /* Some mobile keyboards emit editing keys through keydown rather than
       beforeinput. preventDefault also prevents a duplicate beforeinput. */
    this.input.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      const code = {
        Tab: "KEY_TAB",
        Backspace: "KEY_BACKSPACE",
        Delete: "KEY_DELETE",
        Enter: "KEY_ENTER",
        Escape: "KEY_ESC",
      }[event.key];
      if (!code) return;
      event.preventDefault();
      this._sendStroke({ code, shift: false });
    });

    this.rows.addEventListener("pointerdown", (event) => {
      if (event.target !== this.input) this._focus();
    });
  }

  /* --------------------------------------------------------- key sends */

  _sendStrokes(strokes) {
    for (const stroke of strokes) this._sendStroke(stroke);
  }

  _sendStroke({ code, shift }) {
    if (!code) return;
    const commandHeld = ["KEY_LEFTCTRL", "KEY_LEFTALT", "KEY_LEFTMETA"]
      .some((mod) => this.latched.has(mod));
    const transientShift = shift && !commandHeld && !this.latched.has("KEY_LEFTSHIFT");
    if (transientShift) this.transport.sendKeyName("KEY_LEFTSHIFT", 1);
    this.transport.sendKeyName(code, 1);
    this.transport.sendKeyName(code, 0);
    if (transientShift) this.transport.sendKeyName("KEY_LEFTSHIFT", 0);
    this._consumeModifiers();
  }

  _toggleModifier(code) {
    this.haptics.tap();
    if (this.latched.has(code)) {
      this.latched.delete(code);
      this.transport.sendKeyName(code, 0);
    } else {
      this.latched.add(code);
      this.transport.sendKeyName(code, 1);
    }
    this._renderNav();
    this._focus();
  }

  _consumeModifiers() {
    if (this.latched.size === 0) return;
    for (const code of this.latched) this.transport.sendKeyName(code, 0);
    this.latched.clear();
    this._renderNav();
  }

  _focus() {
    if (!this.input || this.el.hidden) return;
    try {
      this.input.focus({ preventScroll: true });
      this.input.setSelectionRange(0, 0);
    } catch {
      this.input.focus();
    }
  }

  /* ---------------------------------------------------------- lifecycle */

  show() {
    this.el.hidden = false;
    this._focus(); // synchronous: required for iOS software keyboard
  }

  hide() {
    this.release();
    this.input?.blur();
    this.el.hidden = true;
  }

  release() {
    this.composing = false;
    this.latched.clear();
    if (this.input) this.input.value = "";
    this.transport.resetKeys();
    this._renderNav();
  }
}
