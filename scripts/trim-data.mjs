#!/usr/bin/env node
// Trims the full espeak-ng-data tree (produced by build-espeak-ng.sh's native
// build) down to only what's needed for the languages in scripts/voice-map.json.
//
// espeak-ng-data layout relevant here (verified against the pinned commit):
//   phontab, phondata, phonindex, intonations   — shared, always required
//   mbrola_ph/, phondata-manifest               — not needed (mbrola disabled;
//                                                  manifest is dev/debug metadata)
//   lang/<family>/<voice-id>                    — per-voice definition files
//                                                  (e.g. lang/roa/es-419,
//                                                  lang/gmw/en-US) — these ARE
//                                                  the "voices" in this data
//                                                  layout; there is no separate
//                                                  voices/<family>/<id> file for
//                                                  base languages in this version
//                                                  of espeak-ng (only voices/!v,
//                                                  persona/gender variants we
//                                                  don't need for phonemization).
//   <lang>_dict                                  — compiled dictionary per
//                                                  dict-language (e.g. es_dict
//                                                  serves es, es-419 등).
//
// For each voice-map.json entry we copy BOTH its exact espeakVoice lang file
// (e.g. lang/roa/es-419) and its bare dictLang lang file (e.g. lang/roa/es),
// since the former is small and self-contained but we don't want to assume no
// fallback dependency on the latter. Fails loudly if anything is missing.

import { readFileSync, mkdirSync, cpSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FULL_DATA_DIR = path.join(ROOT, 'build/espeak-ng-native-install/share/espeak-ng-data');
const OUT_DIR = path.join(ROOT, 'build/espeak-ng-data-trimmed');

const ALWAYS_FILES = ['phontab', 'phondata', 'phonindex', 'intonations'];

function walkLangIndex(langDir) {
  // lowercased basename -> relative path (e.g. "es-419" -> "roa/es-419"),
  // covering both family-grouped files and the handful of standalone
  // top-level files (lang/eu, lang/ko, lang/qu). Case-insensitive because
  // piper's espeak.voice ids are lowercase (e.g. "pt-br") while some on-disk
  // filenames are mixed-case (e.g. "pt-BR").
  const index = new Map();
  for (const entry of readdirSync(langDir)) {
    const full = path.join(langDir, entry);
    if (statSync(full).isDirectory()) {
      for (const file of readdirSync(full)) {
        index.set(file.toLowerCase(), path.join(entry, file));
      }
    } else {
      index.set(entry.toLowerCase(), entry);
    }
  }
  return index;
}

function main() {
  if (!existsSync(FULL_DATA_DIR)) {
    throw new Error(`full espeak-ng-data not found at ${FULL_DATA_DIR} — run scripts/build-espeak-ng.sh first`);
  }
  const voiceMap = JSON.parse(readFileSync(path.join(ROOT, 'scripts/voice-map.json'), 'utf8'));

  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(path.join(OUT_DIR, 'lang'), { recursive: true });

  const included = []; // { path, bytes }

  function copyFile(relPath) {
    const src = path.join(FULL_DATA_DIR, relPath);
    const dst = path.join(OUT_DIR, relPath);
    mkdirSync(path.dirname(dst), { recursive: true });
    cpSync(src, dst);
    included.push({ path: relPath, bytes: statSync(dst).size });
  }

  for (const f of ALWAYS_FILES) {
    const src = path.join(FULL_DATA_DIR, f);
    if (!existsSync(src)) throw new Error(`expected shared file missing: ${src}`);
    copyFile(f);
  }

  const langIndex = walkLangIndex(path.join(FULL_DATA_DIR, 'lang'));
  const dictLangsSeen = new Set();
  const copiedLangFiles = new Set();
  const errors = [];

  for (const [piperCode, { espeakVoice, dictLang }] of Object.entries(voiceMap)) {
    // Only the exact espeakVoice has (or needs) a lang/<family>/<id> file —
    // dictLang is purely a dictionary name (resolved from that file's own
    // `dictionary` directive, or derived from the voice id) and isn't
    // necessarily a valid standalone voice id itself (e.g. Norwegian's
    // dictLang "no" has no lang/**/no file — only nb does).
    const relLangPath = langIndex.get(espeakVoice.toLowerCase());
    if (!relLangPath) {
      errors.push(`${piperCode}: no lang/<family>/${espeakVoice} file found`);
    } else {
      const outRel = path.join('lang', relLangPath);
      if (!copiedLangFiles.has(outRel)) {
        copyFile(outRel);
        copiedLangFiles.add(outRel);
      }
    }
    dictLangsSeen.add(dictLang);
  }

  for (const dictLang of dictLangsSeen) {
    const dictFile = `${dictLang}_dict`;
    const src = path.join(FULL_DATA_DIR, dictFile);
    if (!existsSync(src)) {
      errors.push(`no ${dictFile} found for dictLang "${dictLang}"`);
      continue;
    }
    copyFile(dictFile);
  }

  if (errors.length > 0) {
    console.error('trim-data failed to resolve the following entries:');
    for (const e of errors) console.error(`  ${e}`);
    throw new Error(`${errors.length} unresolved voice-map.json entries — see above`);
  }

  const totalBytes = included.reduce((sum, f) => sum + f.bytes, 0);
  console.log(`trimmed data: ${OUT_DIR}`);
  console.log(`  ${included.length} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB`);
  console.log(`  ${Object.keys(voiceMap).length} piper languages covered`);
  console.log('(run scripts/bundle-data.mjs next to produce dist/data/*.data + manifest.json)');
}

main();
