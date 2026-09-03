#!/usr/bin/env node
// Fetches piper1-gpl's published voice list from Hugging Face and resolves
// each unique piper language code to its authoritative espeak-ng voice id
// (from a representative voice's *.onnx.json "espeak.voice" field), plus the
// underlying espeak-ng dictionary language (derived from the voice id).
//
// Output: scripts/voice-map.json — reviewed and committed manually; not
// regenerated on every build, since it depends on an external, unversioned
// Hugging Face listing. Re-run this script by hand when piper adds voices.

import { writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VOICES_JSON_URL = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/voices.json';
const HF_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/';
const LANG_SRC_DIR = path.join(ROOT, 'vendor/espeak-ng/espeak-ng-data/lang');

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${url} (${res.status})`);
  return res.json();
}

// Builds a case-insensitive index of espeak-ng-data/lang/** (both the
// family-grouped files, e.g. lang/roa/es-419, and the handful of standalone
// top-level files, e.g. lang/eu) mapping lowercased voice id -> file content.
function loadLangIndex(langDir) {
  const index = new Map();
  for (const entry of readdirSync(langDir)) {
    const full = path.join(langDir, entry);
    if (statSync(full).isDirectory()) {
      for (const file of readdirSync(full)) {
        index.set(file.toLowerCase(), readFileSync(path.join(full, file), 'utf8'));
      }
    } else {
      index.set(entry.toLowerCase(), readFileSync(full, 'utf8'));
    }
  }
  return index;
}

// Most lang files don't declare an explicit dictionary, in which case the
// dict to use is derived from the voice id's base (before any "-" suffix).
// A handful (e.g. lang/gmq/nb, which says `dictionary no`) override this
// explicitly — read the lang file itself rather than guessing, since the
// override is authoritative and not deducible from the voice id string.
function resolveDictLang(langIndex, espeakVoice) {
  const content = langIndex.get(espeakVoice.toLowerCase());
  if (!content) {
    throw new Error(`no lang/**/${espeakVoice} file found in vendor/espeak-ng/espeak-ng-data/lang`);
  }
  const m = content.match(/^dictionary\s+(\S+)/m);
  if (m) return m[1];
  return espeakVoice.split('-')[0];
}

async function main() {
  const langIndex = loadLangIndex(LANG_SRC_DIR);

  console.log(`fetching ${VOICES_JSON_URL}`);
  const voices = await fetchJson(VOICES_JSON_URL);

  // Group voices by piper language code, pick one representative voice per
  // code (first one encountered) to read its espeak voice id from.
  const byLanguage = new Map();
  for (const voice of Object.values(voices)) {
    const code = voice.language?.code;
    if (!code) continue;
    if (!byLanguage.has(code)) byLanguage.set(code, voice);
  }

  console.log(`found ${byLanguage.size} unique piper language codes`);

  const voiceMap = {};
  const skipped = [];

  for (const [code, voice] of [...byLanguage.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const onnxJsonPath = Object.keys(voice.files).find((f) => f.endsWith('.onnx.json'));
    if (!onnxJsonPath) {
      skipped.push({ code, reason: 'no .onnx.json file listed' });
      continue;
    }
    const url = HF_BASE + onnxJsonPath;
    let config;
    try {
      config = await fetchJson(url);
    } catch (err) {
      skipped.push({ code, reason: `fetch failed: ${err.message}` });
      continue;
    }

    // `phoneme_type` is only present when it's something OTHER than espeak
    // (older/most voice configs simply omit it, since espeak was the only
    // option when they were published) — so treat an explicit non-espeak
    // value as authoritative, but otherwise go by whether espeak.voice exists.
    if (config.phoneme_type && config.phoneme_type !== 'espeak') {
      skipped.push({ code, reason: `phoneme_type is "${config.phoneme_type}", not espeak (e.g. Japanese uses OpenJTalk)` });
      continue;
    }
    const espeakVoice = config.espeak?.voice;
    if (!espeakVoice) {
      skipped.push({ code, reason: 'no espeak.voice field in config' });
      continue;
    }

    let dictLang;
    try {
      dictLang = resolveDictLang(langIndex, espeakVoice);
    } catch (err) {
      skipped.push({ code, reason: err.message });
      continue;
    }

    voiceMap[code] = { espeakVoice, dictLang };
    console.log(`  ${code} -> espeak voice "${espeakVoice}" (dict "${dictLang}")`);
  }

  if (skipped.length > 0) {
    console.log('\nskipped:');
    for (const { code, reason } of skipped) console.log(`  ${code}: ${reason}`);
  }

  const outputPath = path.join(ROOT, 'scripts/voice-map.json');
  writeFileSync(outputPath, JSON.stringify(voiceMap, null, 2) + '\n');
  console.log(`\nwrote ${outputPath} (${Object.keys(voiceMap).length} languages)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
