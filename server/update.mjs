#!/usr/bin/env node
/* Controll-D automatic updater: pulls latest changes and updates dependencies. */

import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

console.log("");
console.log("  🎮 Controll-D Updater");
console.log("  ─────────────────────");
console.log("  Fetching latest updates from git repository...");

try {
  const pullOutput = execSync("git pull origin main", { cwd: ROOT, encoding: "utf-8" });
  console.log(pullOutput.trim().split("\n").map((l) => "    " + l).join("\n"));

  console.log("  Checking dependencies (npm install)...");
  execSync("npm install", { cwd: ROOT, stdio: "inherit" });

  console.log("");
  console.log("  ✅ Controll-D is updated and ready to play!");
  console.log("  Run 'npm start' to start the server.");
  console.log("");
} catch (err) {
  console.error("  ❌ Update failed:", err?.message || err);
  process.exit(1);
}
