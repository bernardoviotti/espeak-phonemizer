// JS-native wrapper around the espeak-ng wasm module (dist/wasm/espeak-ng.mjs),
// mirroring piper1-gpl's own espeak binding, src/piper/espeakbridge.c, name for
// name: initialize(dataDir) / setVoice(voice) / getPhonemes(text). No wasm
// pointers, _malloc, or setValue/getValue appear in this module's exports —
// getPhonemes runs the espeak_TextToPhonemesWithTerminator clause loop
// internally, the same role the C loop plays inside py_get_phonemes.
//
// Usage:
//   import { initialize, setVoice, getPhonemes } from "./espeak.mjs";
//   await initialize("./dist/wasm"); // wasm + preloaded data, loaded once
//   setVoice("en-us");
//   getPhonemes("Hello world."); // -> [{ phonemes, terminator, isSentenceEnd }]

import createEspeakModule from '../dist/wasm/espeak-ng.mjs';
import {
  espeakCHARS_AUTO,
  espeakPHONEMES_IPA,
  AUDIO_OUTPUT_SYNCHRONOUS,
  decodeTerminator,
} from './constants.mjs';

// The virtual filesystem path the preloaded data package was mounted at
// (scripts/package-data.sh: `--preload build/espeak-ng-data-trimmed@/espeak-ng-data`).
const ESPEAK_DATA_VIRTUAL_PATH = '/espeak-ng-data';

let Module = null;
let espeak_SetVoiceByName = null;
let espeak_TextToPhonemesWithTerminator = null;

/**
 * Loads the wasm module (and its preloaded language data) and calls
 * espeak_Initialize. Mirrors espeakbridge.c's py_initialize(data_dir), except
 * dataDir here is the base path/URL to fetch (browser) or read (Node) the
 * built wasm assets (espeak-ng.wasm, espeak-ng.data) from — not a raw
 * filesystem path passed straight to espeak_Initialize, since the actual
 * data lives inside the wasm module's virtual filesystem after preloading.
 *
 * Safe to call more than once — subsequent calls are no-ops once loaded.
 *
 * @param {string} dataDir base path/URL for espeak-ng.wasm / espeak-ng.data,
 *   e.g. "./dist/wasm" (Node, relative to cwd) or an absolute URL (browser).
 */
export async function initialize(dataDir) {
  if (Module) return;

  const base = dataDir.replace(/\/+$/, '');
  const loadedModule = await createEspeakModule({
    locateFile: (filename) => `${base}/${filename}`,
  });

  const init = loadedModule.cwrap('espeak_Initialize', 'number', ['number', 'number', 'string', 'number']);
  const rc = init(AUDIO_OUTPUT_SYNCHRONOUS, 0, ESPEAK_DATA_VIRTUAL_PATH, 0);
  if (rc < 0) {
    throw new Error('Failed to initialize espeak-ng');
  }

  Module = loadedModule;
  espeak_SetVoiceByName = Module.cwrap('espeak_SetVoiceByName', 'number', ['string']);
  espeak_TextToPhonemesWithTerminator = Module.cwrap(
    'espeak_TextToPhonemesWithTerminator',
    'string',
    ['number', 'number', 'number', 'number']
  );
}

function requireInitialized() {
  if (!Module) {
    throw new Error('espeak-ng is not initialized — call initialize(dataDir) first.');
  }
}

/**
 * Mirrors espeakbridge.c's py_set_voice(voice): sets the active espeak-ng
 * voice by name (e.g. "en-us", "es-419", "pt-br"). Throws if the voice is
 * unknown or its language data wasn't bundled into this build.
 * @param {string} voice
 */
export function setVoice(voice) {
  requireInitialized();
  if (espeak_SetVoiceByName(voice) !== 0 /* EE_OK */) {
    throw new Error(`Failed to set voice: ${voice}`);
  }
}

/**
 * Mirrors espeakbridge.c's py_get_phonemes(text): runs the
 * `while (text != NULL) { espeak_TextToPhonemesWithTerminator(...) }` loop
 * internally (using espeakCHARS_AUTO / espeakPHONEMES_IPA, matching both
 * piper-phonemize and espeakbridge.c) and returns one entry per clause. No
 * wasm pointers reach the caller — all heap allocation is freed before this
 * function returns.
 *
 * @param {string} text
 * @returns {Array<{ phonemes: string, terminator: string, isSentenceEnd: boolean }>}
 */
export function getPhonemes(text) {
  requireInitialized();

  const bytes = Module.lengthBytesUTF8(text) + 1;
  const textPtr = Module._malloc(bytes);
  Module.stringToUTF8(text, textPtr, bytes);

  const textPtrCell = Module._malloc(4); // holds the in/out `const void **textptr`
  Module.setValue(textPtrCell, textPtr, 'i32');
  const terminatorCell = Module._malloc(4); // holds the out `int *terminator`

  const results = [];
  try {
    while (Module.getValue(textPtrCell, 'i32') !== 0) {
      const phonemes = espeak_TextToPhonemesWithTerminator(
        textPtrCell,
        espeakCHARS_AUTO,
        espeakPHONEMES_IPA,
        terminatorCell
      );
      const terminator = Module.getValue(terminatorCell, 'i32');
      results.push({ phonemes: phonemes ?? '', ...decodeTerminator(terminator) });
    }
  } finally {
    Module._free(textPtr);
    Module._free(textPtrCell);
    Module._free(terminatorCell);
  }
  return results;
}
