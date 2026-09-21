#!/usr/bin/env bash
# Runs the full build pipeline end to end, in order:
#   1. build-espeak-ng.sh     — native (data) + emscripten (static libs) builds
#   2. gen-constants.mjs      — src/constants.mjs from the pinned commit's headers
#   3. gen-package-version.mjs — src/version.mjs from package.json's version
#   4. trim-data.mjs          — espeak-ng-data trimmed to voice-map.json's languages
#   5. bundle-data.mjs        — bin-packs trimmed data into size-capped dist/data/*.data buckets + manifest.json
#   6. build-wasm.sh          — links the wasm module (no data baked in — loaded on demand at runtime)
#   7. move-src.sh            — copies src/*.mjs, *.d.mts into dist/ so dist/ is self-contained
#
# Produces dist/wasm/espeak-ng.{mjs,wasm}, dist/data/{manifest.json,*.data},
# and dist/{espeak,constants,version}.mjs + dist/*.d.mts.
# scripts/voice-map.json is NOT regenerated here — it's a manually reviewed,
# checked-in artifact (see scripts/build-voice-map.mjs's own comment).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "== [1/6] build-espeak-ng.sh =="
bash scripts/build-espeak-ng.sh

echo "== [2/6] gen-constants.mjs =="
node scripts/gen-constants.mjs

echo "== [3/6] gen-package-version.mjs =="
node scripts/gen-package-version.mjs

echo "== [4/6] trim-data.mjs =="
node scripts/trim-data.mjs

echo "== [5/6] bundle-data.mjs =="
node scripts/bundle-data.mjs

echo "== [6/7] build-wasm.sh =="
bash scripts/build-wasm.sh

echo "== [7/7] move-src.sh =="
bash scripts/move-src.sh

echo "== Build complete =="
echo "  dist/wasm/espeak-ng.mjs"
echo "  dist/wasm/espeak-ng.wasm"
echo "  dist/data/manifest.json"
echo "  dist/data/*.data"
echo "  dist/espeak.mjs + dist/*.d.mts"
