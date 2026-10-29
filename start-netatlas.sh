#!/bin/sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required."
  exit 1
fi
echo "Starting NetAtlas on http://0.0.0.0:3000"
exec npm start
