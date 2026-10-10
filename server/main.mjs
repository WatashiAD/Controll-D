#!/usr/bin/env node
import { main } from "./app.mjs";

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
