// JS-native wrapper around the espeak-ng wasm module (dist/wasm/espeak-ng.mjs),
// mirroring piper1-gpl's own espeak binding, src/piper/espeakbridge.c, name for
// name: initialize(distDir) / setVoice(voice) / getPhonemes(text).
//
// Usage:
//   import { initialize, setVoice, getPhonemes } from "espeak-phonemizer";
//   await initialize();               // Node: resolves this package's own dist/ automatically
//   await setVoice("en-us");          // fetches en-us's bucket on first use
//   getPhonemes("Hello world.");      // -> [{ phonemes, terminator, isSentenceEnd }]
//   // Outside Node (browser/bundler), pass an explicit base path/URL:
//   //   await initialize("https://your-cdn.example/espeak-phonemizer/dist");

/** One clause's phonemization result, as returned by {@link getPhonemes}. */
export interface PhonemeResult {
  /** IPA phonemes for this clause. */
  phonemes: string;
  /** Terminating punctuation (".", "?", "!", ",", ":", ";"), or "" if none matched. */
  terminator: string;
  /** Whether this clause ends a sentence (as opposed to a sub-sentence clause like a comma). */
  isSentenceEnd: boolean;
}

/**
 * Loads the wasm module and the always-needed shared "core" language data
 * (phontab/phondata/phonindex/intonations), then calls espeak_Initialize.
 * Mirrors espeakbridge.c's py_initialize(data_dir), adapted for async wasm
 * loading and on-demand per-voice data (see setVoice).
 *
 * Safe to call more than once — subsequent calls are no-ops once loaded.
 *
 * @param distDir base path/URL for this package's `dist/` directory
 *   (containing both `wasm/` and `data/`), e.g. "./dist" or an absolute URL.
 *   Defaults to this package's own installed location in Node.js; required
 *   when called outside Node. In a browser, if `data/` isn't reachable under
 *   this path, falls back to fetching this exact release's data bundle from
 *   the npm CDN.
 */
export declare function initialize(distDir?: string): Promise<void>;

/**
 * Mirrors espeakbridge.c's py_set_voice(voice), except async: sets the
 * active espeak-ng voice by name (e.g. "en-us", "es-419", "pt-br"), fetching
 * and mounting its bucket's language data on first use (a no-op on
 * subsequent calls for a voice in an already-loaded bucket). Throws/rejects
 * if the voice is unknown or wasn't bundled into this build.
 */
export declare function setVoice(voice: string): Promise<void>;

/**
 * Mirrors espeakbridge.c's py_get_phonemes(text): runs the
 * `while (text != NULL) { espeak_TextToPhonemesWithTerminator(...) }` loop
 * internally (using espeakCHARS_AUTO / espeakPHONEMES_IPA, matching both
 * piper-phonemize and espeakbridge.c) and returns one entry per clause. No
 * wasm pointers reach the caller — all heap allocation is freed before this
 * function returns. Synchronous — no I/O happens here.
 */
export declare function getPhonemes(text: string): PhonemeResult[];
