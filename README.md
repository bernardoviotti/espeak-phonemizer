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

Produces `dist/wasm/espeak-ng.{mjs,wasm}` and `dist/data/` (bucketed language
data + `manifest.json`).

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
| `scripts/trim-data.mjs` | `build/espeak-ng-data-trimmed/` |
| `scripts/bundle-data.mjs` | `dist/data/{manifest.json,*.data}` (size-capped buckets, see below) |
| `scripts/build-wasm.sh` | `dist/wasm/espeak-ng.{mjs,wasm}` |

### How language data is split

Loading all 53 languages' data on every `initialize()` call would mean an
oversized download for sessions that only ever use one or two languages. So
`scripts/bundle-data.mjs` splits the trimmed data into several `.data`
"buckets", loaded on demand:

- **`core.data`** (~700 KB): `phontab`/`phondata`/`phonindex`/`intonations`
  plus *every* voice's `lang/<family>/<id>` definition file (small — the
  53 lang files total only ~200 KB together). Loaded eagerly, once, at
  `initialize()`.
- **Per-dict-language buckets** (`bundle-0.data`, `bundle-1.data`, ...): the
  actual compiled dictionaries (`<dictLang>_dict`, the bulk of the size),
  bin-packed together with a soft ~2 MB target per bucket, sorted so voices
  sharing one dictionary (`es_ES`/`es_MX`/`es_AR` → `es_dict`) always land in
  the same bucket. Fetched lazily the first time `setVoice()` is called for a
  voice in that bucket, then cached for the rest of the session.
- A dictionary that alone exceeds the ~2 MB target — currently only `ru_dict`,
  8.6 MB, from the `EXTRA_ru` build flag — simply becomes its own oversized
  bucket (`ru.data`), since a single dictionary file can't be split further.

**Why `lang/` files all live in the eager core bucket, not split per-bucket:**
espeak-ng builds its internal voice list by scanning `espeak-ng-data/lang/**`
exactly once, lazily, the first time any voice-selecting function runs — and
never rescans after that (see `SelectVoiceByName` in `voices.c`). A voice
whose `lang/` file isn't present yet at that first scan is never found by
`espeak_SetVoiceByName` afterward, even if the file is added to the virtual
filesystem later. Since all `lang/` files together are tiny (~200 KB), keeping
them all in the always-loaded core bucket sidesteps this entirely, while the
much larger dictionary files stay lazily bucketed (a dictionary only needs to
be present at the moment `setVoice()` is actually called for that voice,
which the on-demand loading already guarantees).

## Usage

```js
import { initialize, setVoice, getPhonemes } from "./src/espeak.mjs";

await initialize("./dist"); // loads the wasm module + always-needed core data once
await setVoice("en-us");    // fetches en-us's dictionary bucket on first use

const result = getPhonemes("Hello world. How are you?");
// [
//   { phonemes: "həlˈoʊ wˈɜːld", terminator: ".", isSentenceEnd: true },
//   { phonemes: "hˈaʊ ɑːɹ juː", terminator: "?", isSentenceEnd: true },
// ]

await setVoice("ru"); // fetches ru's (larger) bucket the first time it's used
await setVoice("en-us"); // already loaded — no re-fetch
```

`initialize`, `setVoice`, and `getPhonemes` mirror piper1-gpl's own Python
espeak binding, [`espeakbridge.c`](https://github.com/OHF-Voice/piper1-gpl/blob/main/src/piper/espeakbridge.c),
name-for-name. No wasm pointers or manual memory management appear in this
API — `getPhonemes` handles the underlying `espeak_TextToPhonemesWithTerminator`
clause loop internally, returning one `{ phonemes, terminator, isSentenceEnd }`
entry per clause (`terminator` is one of `.`, `?`, `!`, `,`, `:`, `;`, or `""`).
The one intentional divergence from `espeakbridge.c`: `setVoice()` is async
here, since it may need to fetch a language's dictionary bucket on first use
(`espeakbridge.c`'s Python `set_voice` is synchronous because its data is
always already on disk).

`initialize(distDir)`'s `distDir` is the base path/URL for this repo's whole
`dist/` directory (containing both `wasm/` and `data/`) — e.g. `"./dist"`
locally, or an absolute URL when serving from elsewhere.

Only voices covered by `scripts/voice-map.json` are bundled; `setVoice()`
rejects with a clear `Error` for anything else (e.g. `"ja"` for Japanese).

## Testing

```sh
npm run test:node      # node --test, no server
npm run test:browser   # Playwright, served over a plain static file server
npm test               # both
```

## Sizes (measured)

- `espeak-ng.wasm`: ~320 KB
- `espeak-ng.mjs` (glue): ~64 KB
- `dist/data/core.data` (always loaded): ~700 KB
- `dist/data/bundle-0.data`, `bundle-1.data`: ~2 MB each (bin-packed dictionaries)
- `dist/data/bundle-2.data`: ~740 KB
- `dist/data/ru.data`: ~8.6 MB (its own bucket — see "How language data is split")

A typical session using one non-Russian language loads `espeak-ng.wasm` +
`espeak-ng.mjs` + `core.data` + one ~1–2 MB bucket — roughly 2–3 MB total,
instead of the full ~14 MB every language's data adds up to.

## License

GPL-3.0-only (inherited from eSpeak NG). See `LICENSE` and `THIRD_PARTY_NOTICES.md`.
