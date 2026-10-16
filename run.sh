#!/bin/bash
# Start the Controll-D controller server (Node.js).
# Config precedence: environment > config.json > defaults.
set -e
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund
fi
exec node server/main.mjs
