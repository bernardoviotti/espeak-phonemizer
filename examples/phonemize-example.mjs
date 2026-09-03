// Run with: node examples/phonemize-example.mjs
// (after `npm run build` has produced dist/wasm/ and dist/data/)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialize, setVoice, getPhonemes } from '../src/espeak.mjs';

const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist');

await initialize(distDir);
await setVoice('en-us');

console.log(getPhonemes('Hello world. How are you?'));
