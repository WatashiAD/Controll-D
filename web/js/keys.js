/* Client mirror of server/keys.mjs. The native keyboard bridge emits only
 * these whitelisted KEY_* names; npm run check enforces exact parity.
 */

export const KEY_NAMES = [
  "KEY_A", "KEY_B", "KEY_C", "KEY_D", "KEY_E", "KEY_F", "KEY_G", "KEY_H",
  "KEY_I", "KEY_J", "KEY_K", "KEY_L", "KEY_M", "KEY_N", "KEY_O", "KEY_P",
  "KEY_Q", "KEY_R", "KEY_S", "KEY_T", "KEY_U", "KEY_V", "KEY_W", "KEY_X",
  "KEY_Y", "KEY_Z",
  "KEY_1", "KEY_2", "KEY_3", "KEY_4", "KEY_5", "KEY_6", "KEY_7", "KEY_8",
  "KEY_9", "KEY_0",
  "KEY_MINUS", "KEY_EQUAL", "KEY_LEFTBRACE", "KEY_RIGHTBRACE",
  "KEY_SEMICOLON", "KEY_APOSTROPHE", "KEY_GRAVE", "KEY_BACKSLASH",
  "KEY_COMMA", "KEY_DOT", "KEY_SLASH",
  "KEY_ESC", "KEY_BACKSPACE", "KEY_TAB", "KEY_ENTER", "KEY_SPACE",
  "KEY_CAPSLOCK", "KEY_LEFTCTRL", "KEY_LEFTSHIFT", "KEY_LEFTALT",
  "KEY_LEFTMETA", "KEY_RIGHTCTRL", "KEY_RIGHTSHIFT", "KEY_RIGHTALT",
  "KEY_RIGHTMETA",
  "KEY_INSERT", "KEY_DELETE", "KEY_HOME", "KEY_END", "KEY_PAGEUP",
  "KEY_PAGEDOWN", "KEY_UP", "KEY_LEFT", "KEY_RIGHT", "KEY_DOWN",
  "KEY_F1", "KEY_F2", "KEY_F3", "KEY_F4", "KEY_F5", "KEY_F6", "KEY_F7",
  "KEY_F8", "KEY_F9", "KEY_F10", "KEY_F11", "KEY_F12",
];
