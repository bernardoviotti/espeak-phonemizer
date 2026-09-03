// Run with: node examples/phonemize-example.mjs
// (after `npm run build` has produced dist/wasm/ and dist/data/)
import { initialize, setVoice, getPhonemes } from '../src/espeak.mjs';

// No argument needed in Node — initialize() resolves this package's own
// dist/ directory automatically. Pass an explicit path/URL to point at a
// different location (required outside Node — see README.md).
await initialize();
await setVoice('pt-br');

console.log(getPhonemes('Oi, tudo bem? Como vai?'));
