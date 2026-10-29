import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadBrowserModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

test("trackpad movement sends immediately without requestAnimationFrame", async () => {
  const { Transport } = await loadBrowserModule("../web/js/transport.js");
  const transport = new Transport();
  const sent = [];
  transport.sendRaw = (message) => {
    sent.push(message);
    return true;
  };
  globalThis.requestAnimationFrame = () => {
    throw new Error("sendMouseNow must not use the frame queue");
  };

  assert.equal(transport.sendMouseNow(2.8, -3.9), true);
  assert.deepEqual(sent, [{ t: "mr", x: 2, y: -3 }]);
  assert.equal(transport.sendMouseNow(0.4, -0.9), false);
  assert.equal(sent.length, 1);
});

test("visual trackpad cursor has no transform easing", async () => {
  const css = await readFile(new URL("../web/css/overlays.css", import.meta.url), "utf8");
  const cursorRule = css.match(/#tp-cursor\s*\{([\s\S]*?)\}/)?.[1] || "";
  assert.match(cursorRule, /will-change:\s*transform/);
  assert.doesNotMatch(cursorRule, /transition:[^;]*transform/);
});

test("pointer movement does not read layout per sample", async () => {
  const source = await readFile(new URL("../web/js/trackpad.js", import.meta.url), "utf8");
  const moveSample = source.match(/_moveSample\([^)]*\)\s*\{([\s\S]*?)\n  \}/)?.[1] || "";
  assert.ok(moveSample.length > 0, "_moveSample body not found");
  assert.doesNotMatch(moveSample, /getBoundingClientRect/);
});
