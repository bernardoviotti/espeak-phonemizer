#!/usr/bin/env bash
# Packages the trimmed espeak-ng-data tree (scripts/trim-data.mjs's output)
# into an Emscripten "preload" package: dist/wasm/espeak-ng.data (the binary
# blob) + dist/wasm/espeak-ng.data.js (the loader snippet that mounts it into
# the wasm module's MEMFS at /espeak-ng-data before main() runs). build-wasm.sh
# pulls the .js file in as a --pre-js input so a single initialize() call gets
# both the wasm module AND its data ready, mirroring espeakbridge.c's
# single-call py_initialize(data_dir).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TRIMMED_DATA="$ROOT/build/espeak-ng-data-trimmed"
OUT_DIR="$ROOT/dist/wasm"

if ! command -v em-config >/dev/null 2>&1; then
  echo "error: em-config not found. Install/activate the Emscripten SDK first." >&2
  exit 1
fi
if [ ! -d "$TRIMMED_DATA" ]; then
  echo "error: $TRIMMED_DATA not found — run scripts/trim-data.mjs first." >&2
  exit 1
fi

EMSCRIPTEN_ROOT="$(em-config EMSCRIPTEN_ROOT)"
FILE_PACKAGER="$EMSCRIPTEN_ROOT/tools/file_packager.py"
if [ ! -f "$FILE_PACKAGER" ]; then
  echo "error: file_packager.py not found at $FILE_PACKAGER" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

python3 "$FILE_PACKAGER" "$OUT_DIR/espeak-ng.data" \
  --preload "$TRIMMED_DATA@/espeak-ng-data" \
  --js-output="$OUT_DIR/espeak-ng.data.js"

echo "ok: $OUT_DIR/espeak-ng.data ($(du -h "$OUT_DIR/espeak-ng.data" | cut -f1))"
echo "ok: $OUT_DIR/espeak-ng.data.js"
