#!/usr/bin/env bash
# Links the espeak-ng static libs (scripts/build-espeak-ng.sh's output) into a
# modern ES6 wasm module, with the preloaded data package (package-data.sh's
# output) pulled in as a --pre-js so a single module instantiation gets both
# the wasm binary and its data ready. No custom glue C file: the real
# espeak_Initialize / espeak_SetVoiceByName / espeak_TextToPhonemesWithTerminator
# symbols are kept alive and exported directly by listing them in
# EXPORTED_FUNCTIONS — src/espeak.mjs cwrap's them under their real C names.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL="$ROOT/build/espeak-ng-install"
OUT_DIR="$ROOT/dist/wasm"
DATA_JS="$OUT_DIR/espeak-ng.data.js"

if ! command -v emcc >/dev/null 2>&1; then
  echo "error: emcc not found. Install/activate the Emscripten SDK first." >&2
  exit 1
fi
for f in "$INSTALL/lib/libespeak-ng.a" "$INSTALL/lib/libucd.a"; do
  if [ ! -f "$f" ]; then
    echo "error: $f not found — run scripts/build-espeak-ng.sh first." >&2
    exit 1
  fi
done
if [ ! -f "$DATA_JS" ]; then
  echo "error: $DATA_JS not found — run scripts/package-data.sh first." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

emcc \
  "$INSTALL/lib/libespeak-ng.a" "$INSTALL/lib/libucd.a" \
  -I "$INSTALL/include" \
  -o "$OUT_DIR/espeak-ng.mjs" \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sEXPORT_NAME=createEspeakModule \
  -sENVIRONMENT=web,node \
  -sALLOW_MEMORY_GROWTH=1 \
  -sFORCE_FILESYSTEM=1 \
  -sEXPORTED_RUNTIME_METHODS=cwrap,ccall,getValue,setValue,UTF8ToString,stringToUTF8,lengthBytesUTF8,FS \
  -sEXPORTED_FUNCTIONS=_malloc,_free,_espeak_Initialize,_espeak_SetVoiceByName,_espeak_TextToPhonemesWithTerminator,_espeak_ListVoices,_espeak_Terminate \
  --pre-js "$DATA_JS" \
  -O3

echo "== Verifying build outputs =="
for f in "$OUT_DIR/espeak-ng.mjs" "$OUT_DIR/espeak-ng.wasm"; do
  if [ ! -f "$f" ]; then
    echo "error: expected build output missing: $f" >&2
    exit 1
  fi
  echo "ok: $f ($(du -h "$f" | cut -f1))"
done

echo "== Sanity-checking exported symbols =="
(cd "$OUT_DIR" && node --input-type=module -e "
import createEspeakModule from './espeak-ng.mjs';
const Module = await createEspeakModule();
const required = ['cwrap', 'ccall', 'getValue', 'setValue', 'UTF8ToString', 'stringToUTF8', 'lengthBytesUTF8', '_malloc', '_free', '_espeak_Initialize', '_espeak_SetVoiceByName', '_espeak_TextToPhonemesWithTerminator'];
const missing = required.filter((k) => typeof Module[k] === 'undefined');
if (missing.length > 0) {
  console.error('missing on Module:', missing);
  process.exit(1);
}
console.log('ok: all required symbols present on Module');
")
