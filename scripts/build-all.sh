#!/usr/bin/env bash
# Runs the full build pipeline end to end, in order:
#   1. build-espeak-ng.sh   — native (data) + emscripten (static libs) builds
#   2. gen-constants.mjs    — src/constants.mjs from the pinned commit's headers
#   3. trim-data.mjs        — espeak-ng-data trimmed to voice-map.json's languages
#   4. bundle-data.mjs      — bin-packs trimmed data into size-capped dist/data/*.data buckets + manifest.json
#   5. build-wasm.sh        — links the wasm module (no data baked in — loaded on demand at runtime)
#
# Produces dist/wasm/espeak-ng.{mjs,wasm} and dist/data/{manifest.json,*.data}.
# scripts/voice-map.json is NOT regenerated here — it's a manually reviewed,
# checked-in artifact (see scripts/build-voice-map.mjs's own comment).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "== [1/5] build-espeak-ng.sh =="
bash scripts/build-espeak-ng.sh

echo "== [2/5] gen-constants.mjs =="
node scripts/gen-constants.mjs

echo "== [3/5] trim-data.mjs =="
node scripts/trim-data.mjs

echo "== [4/5] bundle-data.mjs =="
node scripts/bundle-data.mjs

echo "== [5/5] build-wasm.sh =="
bash scripts/build-wasm.sh

echo "== Build complete =="
echo "  dist/wasm/espeak-ng.mjs"
echo "  dist/wasm/espeak-ng.wasm"
echo "  dist/data/manifest.json"
echo "  dist/data/*.data"
