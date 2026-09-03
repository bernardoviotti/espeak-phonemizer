// Run with: node examples/phonemize-example.mjs
// (after `npm run build` has produced dist/wasm/espeak-ng.{mjs,wasm,data})
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialize, setVoice, getPhonemes } from '../src/espeak.mjs';

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist/wasm');

await initialize(dataDir);
setVoice('en-us');

console.log(getPhonemes('Hello world. How are you?'));
