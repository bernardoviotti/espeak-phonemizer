# espeak-phonemizer

A lightweight WebAssembly build of [eSpeak NG](https://github.com/espeak-ng/espeak-ng)
exposing `espeak_TextToPhonemesWithTerminator()`, trimmed to only the 53
languages [piper1-gpl](https://github.com/OHF-Voice/piper1-gpl) supports via
espeak (Japanese, Hebrew, and Mandarin are excluded — piper phonemizes those
with OpenJTalk / a Hebrew phonemizer / pinyin instead of raw espeak IPA).
Runs fully client-side (no backend/server) and in Node.js.

**This is a build-artifact repo, not an npm package.** It is meant to be
consumed via local/relative import from another project (e.g. a TTS pipeline
package checked out alongside it), by importing `src/espeak.mjs` and the
build output under `dist/`.

## Building

Requires the Emscripten SDK (`emcc`/`emcmake`/`emmake` on `PATH`), a native
C/C++ toolchain (for the data-compiling half of the build — see below), Node.js,
and Python 3.

```sh
git submodule update --init
npm run build
```

Produces `dist/wasm/espeak-ng.{mjs,wasm,data}` and `dist/manifest.json`.

### Why two builds?

`scripts/build-espeak-ng.sh` builds espeak-ng **twice**: once natively (host
toolchain) and once with `emcmake`/`emmake`. Only the native build can compile
`espeak-ng-data` (espeak-ng's own CMake data target invokes the freshly-built
`espeak-ng` binary as a dict compiler, which can't run as part of a
cross-compiled Emscripten build without extra plumbing) — so the native build
supplies `espeak-ng-data`, and the Emscripten build supplies `libespeak-ng.a`
/ `libucd.a`, the static libraries `espeak-ng.wasm` links against. Data files
are plain little-endian binary blobs, not architecture-specific, so reusing
the native build's output is exactly equivalent to what espeak-ng's own
`-DNativeBuild=` cross-compilation path does.

`scripts/build-espeak-ng.sh` also applies `patches/*.patch` to the pinned
`vendor/espeak-ng` checkout before building (idempotent — safe to re-run).
Currently one patch: espeak-ng's `src/include/compat/wchar.h` always
`#include_next`s the real `<wchar.h>`, and (only under Emscripten's libc,
which redeclares the `isw*()` functions inside `<wchar.h>` itself, not just
`<wctype.h>`) that redeclaration can collide with `compat/wctype.h`'s
`isw*() -> ucd_is*()` macro mapping if it's already active earlier in the same
translation unit. The patch temporarily undefines those macros around the
`<wchar.h>` include and restores them right after — no behavior change on any
other platform, and `ucd_is*()`-based Unicode classification is used
everywhere on Emscripten too, exactly as upstream intends.

### Build pipeline

| Script | Produces |
|---|---|
| `scripts/build-espeak-ng.sh` | `libespeak-ng.a`, `libucd.a`, full `espeak-ng-data` |
| `scripts/gen-constants.mjs` | `src/constants.mjs` (espeak API constants) |
| `scripts/build-voice-map.mjs` | `scripts/voice-map.json` (manually reviewed, checked in — not run by `npm run build`) |
| `scripts/trim-data.mjs` | `build/espeak-ng-data-trimmed/`, `dist/manifest.json` |
| `scripts/package-data.sh` | `dist/wasm/espeak-ng.data{,.js}` |
| `scripts/build-wasm.sh` | `dist/wasm/espeak-ng.{mjs,wasm}` |

## Usage

```js
import { initialize, setVoice, getPhonemes } from "./src/espeak.mjs";

await initialize("./dist/wasm"); // loads the wasm module + preloaded language data once
setVoice("en-us");

const result = getPhonemes("Hello world. How are you?");
// [
//   { phonemes: "həlˈoʊ wˈɜːld", terminator: ".", isSentenceEnd: true },
//   { phonemes: "hˈaʊ ɑːɹ juː", terminator: "?", isSentenceEnd: true },
// ]
```

`initialize`, `setVoice`, and `getPhonemes` mirror piper1-gpl's own Python
espeak binding, [`espeakbridge.c`](https://github.com/OHF-Voice/piper1-gpl/blob/main/src/piper/espeakbridge.c),
name-for-name. No wasm pointers or manual memory management appear in this
API — `getPhonemes` handles the underlying `espeak_TextToPhonemesWithTerminator`
clause loop internally, returning one `{ phonemes, terminator, isSentenceEnd }`
entry per clause (`terminator` is one of `.`, `?`, `!`, `,`, `:`, `;`, or `""`).

`initialize(dataDir)`'s `dataDir` is the base path/URL to fetch (browser) or
read (Node) the built wasm assets from — e.g. `"./dist/wasm"` locally, or an
absolute URL when serving from elsewhere. It is unrelated to the internal
espeak-ng data path, which is baked into the preloaded package.

Only voices covered by `scripts/voice-map.json` are bundled; `setVoice()`
throws a clear `Error` for anything else (e.g. `"ja"` for Japanese).

## Testing

```sh
npm run test:node      # node --test, no server
npm run test:browser   # Playwright, served over a plain static file server
npm test               # both
```

## Sizes (measured)

- `espeak-ng.wasm`: ~300 KB
- `espeak-ng.mjs` (glue): ~76 KB
- `espeak-ng.data` (53 languages, preloaded): ~14 MB

Data is loaded once, eagerly, at `initialize()` — there is no per-language
lazy loading. `ru_dict` (from the `EXTRA_ru` build flag, matching piper1-gpl's
own flags) is noticeably larger than most other per-language dictionaries.

## License

GPL-3.0-only (inherited from eSpeak NG). See `LICENSE` and `THIRD_PARTY_NOTICES.md`.
