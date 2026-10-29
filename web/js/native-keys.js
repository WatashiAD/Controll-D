/* Translate text produced by a phone's native software keyboard to the
 * physical US-keyboard codes accepted by server/keys.mjs.
 *
 * Unicode that has no physical-key representation is intentionally ignored;
 * this transport sends key presses, not clipboard text.
 */

const DIRECT = {
  " ": "KEY_SPACE",
  "\n": "KEY_ENTER",
  "\r": "KEY_ENTER",
  "\t": "KEY_TAB",
  "`": "KEY_GRAVE",
  "-": "KEY_MINUS",
  "=": "KEY_EQUAL",
  "[": "KEY_LEFTBRACE",
  "]": "KEY_RIGHTBRACE",
  "\\": "KEY_BACKSLASH",
  ";": "KEY_SEMICOLON",
  "'": "KEY_APOSTROPHE",
  ",": "KEY_COMMA",
  ".": "KEY_DOT",
  "/": "KEY_SLASH",
};

const SHIFTED = {
  "~": "KEY_GRAVE",
  "_": "KEY_MINUS",
  "+": "KEY_EQUAL",
  "{": "KEY_LEFTBRACE",
  "}": "KEY_RIGHTBRACE",
  "|": "KEY_BACKSLASH",
  ":": "KEY_SEMICOLON",
  '"': "KEY_APOSTROPHE",
  "<": "KEY_COMMA",
  ">": "KEY_DOT",
  "?": "KEY_SLASH",
  "!": "KEY_1",
  "@": "KEY_2",
  "#": "KEY_3",
  "$": "KEY_4",
  "%": "KEY_5",
  "^": "KEY_6",
  "&": "KEY_7",
  "*": "KEY_8",
  "(": "KEY_9",
  ")": "KEY_0",
};

export function keyStrokeForCharacter(char) {
  if (typeof char !== "string" || [...char].length !== 1) return null;
  if (/^[a-z]$/.test(char)) return { code: `KEY_${char.toUpperCase()}`, shift: false };
  if (/^[A-Z]$/.test(char)) return { code: `KEY_${char}`, shift: true };
  if (/^[0-9]$/.test(char)) return { code: `KEY_${char}`, shift: false };
  if (DIRECT[char]) return { code: DIRECT[char], shift: false };
  if (SHIFTED[char]) return { code: SHIFTED[char], shift: true };
  return null;
}

export function strokesForText(text) {
  if (typeof text !== "string" || text.length === 0) return [];
  return [...text].map(keyStrokeForCharacter).filter(Boolean);
}

export function strokesForInput(inputType, data) {
  if (typeof inputType !== "string") return [];
  if (inputType.startsWith("delete") && inputType.endsWith("Backward")) {
    return [{ code: "KEY_BACKSPACE", shift: false }];
  }
  if (inputType.startsWith("delete") && inputType.endsWith("Forward")) {
    return [{ code: "KEY_DELETE", shift: false }];
  }
  if (inputType === "insertLineBreak" || inputType === "insertParagraph") {
    return [{ code: "KEY_ENTER", shift: false }];
  }
  if (inputType.startsWith("insert")) return strokesForText(data || "");
  return [];
}
