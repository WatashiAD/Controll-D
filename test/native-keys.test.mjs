import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { KEYS } from "../server/keys.mjs";

async function loadBrowserModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const encoded = Buffer.from(source).toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

const { keyStrokeForCharacter, strokesForInput, strokesForText } =
  await loadBrowserModule("../web/js/native-keys.js");

test("maps letters, uppercase and shifted symbols to a US PC keyboard", () => {
  assert.deepEqual(keyStrokeForCharacter("a"), { code: "KEY_A", shift: false });
  assert.deepEqual(keyStrokeForCharacter("A"), { code: "KEY_A", shift: true });
  assert.deepEqual(keyStrokeForCharacter("!"), { code: "KEY_1", shift: true });
  assert.deepEqual(keyStrokeForCharacter("/"), { code: "KEY_SLASH", shift: false });
  assert.deepEqual(keyStrokeForCharacter("?"), { code: "KEY_SLASH", shift: true });
});

test("converts inserted native-keyboard text in order", () => {
  assert.deepEqual(strokesForText("Hi!"), [
    { code: "KEY_H", shift: true },
    { code: "KEY_I", shift: false },
    { code: "KEY_1", shift: true },
  ]);
});

test("maps native editing input types to PC keys", () => {
  assert.deepEqual(strokesForInput("deleteContentBackward", null), [
    { code: "KEY_BACKSPACE", shift: false },
  ]);
  assert.deepEqual(strokesForInput("deleteContentForward", null), [
    { code: "KEY_DELETE", shift: false },
  ]);
  assert.deepEqual(strokesForInput("insertLineBreak", null), [
    { code: "KEY_ENTER", shift: false },
  ]);
  assert.deepEqual(strokesForInput("insertText", "ok"), [
    { code: "KEY_O", shift: false },
    { code: "KEY_K", shift: false },
  ]);
});

test("ignores characters that cannot be represented by the virtual key table", () => {
  assert.equal(keyStrokeForCharacter("😀"), null);
  assert.deepEqual(strokesForText("a😀b"), [
    { code: "KEY_A", shift: false },
    { code: "KEY_B", shift: false },
  ]);
});

test("every printable US-ASCII character maps to a server-whitelisted key", () => {
  const allowed = new Set(Object.keys(KEYS));
  for (let codePoint = 32; codePoint <= 126; codePoint += 1) {
    const char = String.fromCharCode(codePoint);
    const stroke = keyStrokeForCharacter(char);
    assert.ok(stroke, `missing mapping for ${JSON.stringify(char)}`);
    assert.ok(allowed.has(stroke.code), `${stroke.code} is not server-whitelisted`);
  }
});
