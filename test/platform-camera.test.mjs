import assert from "node:assert/strict";
import test from "node:test";
import * as platform from "../server/platform.mjs";

test("uses a direct webcam only when ffmpeg and loopback are available", () => {
  assert.equal(platform.cameraMode(true, "/dev/video9"), "ok");
});

test("falls back to the browser relay without v4l2loopback", () => {
  assert.equal(platform.cameraMode(true, null), "relay");
});

test("browser relay remains usable without ffmpeg", () => {
  assert.equal(platform.cameraMode(false, null), "relay");
});
