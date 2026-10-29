/* Whitelist sync check (hard rule #1):
 *
 *   server/gamepad.mjs BUTTONS/AXES  <->  web/js/codes.js BUTTON_CODES/AXIS_CODES
 *   server/keys.mjs    KEYS          <->  web/js/keys.js KEY_NAMES
 *
 * Browser modules are ESM-in-.js, so they are copied to a temp dir as .mjs
 * for import (the same trick used for `node --check`).
 *
 * Run: npm run check
 */

import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const temp = mkdtempSync(join(tmpdir(), "controld-check-"));
try {
  cpSync(join(ROOT, "web/js/codes.js"), join(temp, "codes.mjs"));
  cpSync(join(ROOT, "web/js/keys.js"), join(temp, "keys.mjs"));

  const [{ BUTTONS, AXES }, { KEYS }, clientCodes, clientKeys] = await Promise.all([
    import(pathToFileURL(join(ROOT, "server/gamepad.mjs"))),
    import(pathToFileURL(join(ROOT, "server/keys.mjs"))),
    import(pathToFileURL(join(temp, "codes.mjs"))),
    import(pathToFileURL(join(temp, "keys.mjs"))),
  ]);

  const setOf = (entries) => new Set(entries.map(([code]) => code));

  const checks = [
    ["gamepad BUTTONS", new Set(Object.keys(BUTTONS)), setOf(clientCodes.BUTTON_CODES)],
    ["gamepad AXES", new Set(Object.keys(AXES)), setOf(clientCodes.AXIS_CODES)],
    ["keyboard KEYS", new Set(Object.keys(KEYS)), new Set(clientKeys.KEY_NAMES)],
  ];

  let bad = false;
  for (const [label, serverSet, clientSet] of checks) {
    const onlyServer = [...serverSet].filter((c) => !clientSet.has(c));
    const onlyClient = [...clientSet].filter((c) => !serverSet.has(c));
    if (onlyServer.length || onlyClient.length) {
      bad = true;
      if (onlyServer.length) console.error(`${label}: missing on client -> ${onlyServer.join(", ")}`);
      if (onlyClient.length) console.error(`${label}: missing on server -> ${onlyClient.join(", ")}`);
    } else {
      console.log(`${label}: in sync (${serverSet.size} codes)`);
    }
  }

  if (bad) process.exit(1);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
