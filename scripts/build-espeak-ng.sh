#!/usr/bin/env bash
# Builds espeak-ng (vendor/espeak-ng, pinned to piper1-gpl's commit) two ways:
#
#   1. A native (host) build — used only to compile espeak-ng-data (dictionaries,
#      intonations, phoneme tables). Espeak-ng's CMake "data" target invokes the
#      just-built espeak-ng binary as a dict compiler (--compile=<lang>, etc.),
#      which under Emscripten cross-compilation is skipped entirely unless a
#      native binary is supplied via -DNativeBuild=<dir>. Building natively and
#      reusing its share/espeak-ng-data is simpler than wiring that up, since the
#      data files themselves are plain little-endian binary blobs, not
#      architecture-specific — identical content either way.
#   2. An Emscripten (emcmake/emmake) build — used only for libespeak-ng.a /
#      libucd.a, the static libraries our wasm module links against. No data is
#      needed at this stage; espeak_Initialize() reads data at runtime instead.
#
# Both use piper1-gpl's own CMakeLists.txt build flags for phonemization parity.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/vendor/espeak-ng"
NCPU="$(sysctl -n hw.ncpu 2>/dev/null || nproc)"

# Apply local patches to the pinned espeak-ng checkout (idempotent — skips a
# patch that's already applied, so re-running this script is safe). See
# patches/*.patch for what each one fixes and why; the submodule itself stays
# at the pinned upstream commit, unmodified in git history.
for patch in "$ROOT"/patches/*.patch; do
  [ -e "$patch" ] || continue
  if (cd "$SRC" && git apply --check "$patch" 2>/dev/null); then
    echo "applying patch: $(basename "$patch")"
    (cd "$SRC" && git apply "$patch")
  elif (cd "$SRC" && git apply --check --reverse "$patch" 2>/dev/null); then
    echo "patch already applied: $(basename "$patch")"
  else
    echo "error: patch $(basename "$patch") does not apply (and isn't already applied) — vendor/espeak-ng may be at an unexpected commit." >&2
    exit 1
  fi
done

COMMON_FLAGS=(
  -DBUILD_SHARED_LIBS:BOOL=OFF
  -DUSE_ASYNC:BOOL=OFF
  -DUSE_MBROLA:BOOL=OFF
  -DUSE_LIBSONIC:BOOL=OFF
  -DUSE_LIBPCAUDIO:BOOL=OFF
  -DUSE_KLATT:BOOL=OFF
  -DUSE_SPEECHPLAYER:BOOL=OFF
  -DENABLE_TESTS:BOOL=OFF
  -DEXTRA_cmn:BOOL=ON
  -DEXTRA_ru:BOOL=ON
)

## --- 1. Native build (for espeak-ng-data only) -----------------------------
NATIVE_BUILD="$ROOT/build/espeak-ng-native"
NATIVE_INSTALL="$ROOT/build/espeak-ng-native-install"

cmake -S "$SRC" -B "$NATIVE_BUILD" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$NATIVE_INSTALL" \
  -DCOMPILE_INTONATIONS:BOOL=ON \
  "${COMMON_FLAGS[@]}"
cmake --build "$NATIVE_BUILD" -j"$NCPU"
cmake --install "$NATIVE_BUILD"

NATIVE_DATA_DIR="$NATIVE_INSTALL/share/espeak-ng-data"
if [ ! -d "$NATIVE_DATA_DIR" ]; then
  echo "error: espeak-ng-data not found at $NATIVE_DATA_DIR (native build)" >&2
  exit 1
fi
DICT_COUNT="$(find "$NATIVE_DATA_DIR" -maxdepth 1 -name '*_dict' | wc -l | tr -d ' ')"
echo "ok: $NATIVE_DATA_DIR ($DICT_COUNT compiled dictionaries, $(du -sh "$NATIVE_DATA_DIR" | cut -f1) total)"
if [ "$DICT_COUNT" -lt 50 ]; then
  echo "error: expected the full dictionary set (~90+), found only $DICT_COUNT." >&2
  exit 1
fi

## --- 2. Emscripten build (for libespeak-ng.a / libucd.a only) -------------
if ! command -v emcmake >/dev/null 2>&1; then
  echo "error: emcmake not found. Install/activate the Emscripten SDK first." >&2
  exit 1
fi

EM_BUILD="$ROOT/build/espeak-ng"
EM_INSTALL="$ROOT/build/espeak-ng-install"

emcmake cmake -S "$SRC" -B "$EM_BUILD" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$EM_INSTALL" \
  -DCMAKE_POSITION_INDEPENDENT_CODE:BOOL=ON \
  -DCOMPILE_INTONATIONS:BOOL=OFF \
  "${COMMON_FLAGS[@]}"
emmake cmake --build "$EM_BUILD" -j"$NCPU"
emmake cmake --install "$EM_BUILD"

mkdir -p "$EM_INSTALL/lib"
UCD_LIB="$(find "$EM_BUILD" -name 'libucd.a' | head -1)"
if [ -z "$UCD_LIB" ]; then
  echo "error: libucd.a not found anywhere under $EM_BUILD" >&2
  exit 1
fi
cp "$UCD_LIB" "$EM_INSTALL/lib/libucd.a"

echo "== Verifying build outputs =="
for f in "$EM_INSTALL/lib/libespeak-ng.a" "$EM_INSTALL/lib/libucd.a"; do
  if [ ! -f "$f" ]; then
    echo "error: expected build output missing: $f" >&2
    exit 1
  fi
  echo "ok: $f ($(du -h "$f" | cut -f1))"
done

echo "== Done =="
echo "static libs: $EM_INSTALL/lib/{libespeak-ng.a,libucd.a}"
echo "headers:     $EM_INSTALL/include"
echo "full data:   $NATIVE_DATA_DIR"
