#!/usr/bin/env node
// Bin-packs the trimmed espeak-ng-data tree (scripts/trim-data.mjs's output)
// into a small number of size-capped "bucket" files. Each bucket is just its
// member files' raw bytes concatenated back to back — no file_packager, no
// embedded metadata — with dist/data/manifest.json recording each file's
// { offset, length } within its bucket so the runtime loader
// (src/espeak.mjs) can slice them back out after one fetch/readFile.
//
// Why not file_packager for this: it's designed to bake one package into
// module startup (or to run against a global `Module`); loading *multiple*
// packages on demand, after the module is already running, into a
// MODULARIZE-wrapped local instance doesn't fit that model cleanly.
//
// IMPORTANT — why lang/ files are NOT split per bucket: espeak-ng's voice
// list (used by espeak_SetVoiceByName / espeak_ListVoices) is built by
// scanning espeak-ng-data/lang/** exactly ONCE, lazily, the first time any
// voice-selecting function runs (see SelectVoiceByName in voices.c: `if
// (n_voices_list == 0) espeak_ListVoices(NULL)`), and is never rescanned
// after that. If a voice's lang/ definition file isn't present in the
// virtual filesystem yet at that first scan, espeak-ng will never find it by
// name afterward — even if the file is written later, since nothing
// triggers a rescan. Confirmed by testing: setVoice("en-us") then
// setVoice("es-419") failed with EE_NOT_FOUND (2) when es-419's lang file
// was only added to the FS after the first setVoice call, even though the
// file existed on disk by the time SetVoiceByName("es-419") ran.
//
// The fix: ALL lang/ files (every voice's definition file — small, ~4KB avg,
// ~200KB total across every bundled language) go into the always-eagerly-
// loaded core bucket alongside phontab/phondata/phonindex/intonations, so
// every voice is visible to that one-time scan regardless of load order.
// Only the (much larger) <dictLang>_dict files are lazily bucketed per
// dict-language — SetVoiceByName only needs a voice's dictionary file to be
// present at the moment IT is called for that specific voice, which our
// on-demand bucket loading already guarantees.
//
// Target bucket size is a SOFT cap (~2MB) — see BUCKET_TARGET_BYTES. A single
// dictionary that alone exceeds the target (e.g. ru_dict, ~8.6MB from the
// EXTRA_ru build flag) simply becomes its own oversized bucket; there's no
// way to split a single dictionary file further.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRIMMED_DIR = path.join(ROOT, 'build/espeak-ng-data-trimmed');
const OUT_DIR = path.join(ROOT, 'dist/data');
const BUCKET_TARGET_BYTES = 2 * 1024 * 1024;

const SHARED_CORE_FILES = ['phontab', 'phondata', 'phonindex', 'intonations'];

function walkLangFiles(langDir) {
  // -> relative paths under lang/, e.g. "lang/roa/es-419" (every file, both
  // family-grouped and the handful of standalone top-level ones).
  const out = [];
  for (const entry of readdirSync(langDir)) {
    const full = path.join(langDir, entry);
    if (statSync(full).isDirectory()) {
      for (const file of readdirSync(full)) {
        out.push(path.join('lang', entry, file));
      }
    } else {
      out.push(path.join('lang', entry));
    }
  }
  return out;
}

function fileSize(relPath) {
  return statSync(path.join(TRIMMED_DIR, relPath)).size;
}

// One group per distinct dictLang — just its compiled dictionary file, since
// lang/ files all live in the core bucket instead (see header comment).
function buildDictGroups(voiceMap) {
  const dictLangToVoices = new Map();
  for (const { espeakVoice, dictLang } of Object.values(voiceMap)) {
    if (!dictLangToVoices.has(dictLang)) dictLangToVoices.set(dictLang, new Set());
    dictLangToVoices.get(dictLang).add(espeakVoice);
  }

  return [...dictLangToVoices.entries()].map(([dictLang, voices]) => {
    const file = `${dictLang}_dict`;
    if (!existsSync(path.join(TRIMMED_DIR, file))) {
      throw new Error(`bundle-data: expected trimmed dictionary missing: ${file} (dictLang "${dictLang}")`);
    }
    return { dictLang, file, voices, totalBytes: fileSize(file) };
  });
}

// First-fit-decreasing bin packing: sort groups largest-first, place each
// into the first bucket with room under the target, else start a new one.
// A group already over the target becomes its own bucket (never merged).
function packBuckets(groups) {
  const sorted = [...groups].sort((a, b) => b.totalBytes - a.totalBytes);
  const buckets = []; // { groups: [group,...], totalBytes, solo }

  for (const group of sorted) {
    if (group.totalBytes >= BUCKET_TARGET_BYTES) {
      buckets.push({ groups: [group], totalBytes: group.totalBytes, solo: true });
      continue;
    }
    const fit = buckets.find((b) => !b.solo && b.totalBytes + group.totalBytes <= BUCKET_TARGET_BYTES);
    if (fit) {
      fit.groups.push(group);
      fit.totalBytes += group.totalBytes;
    } else {
      buckets.push({ groups: [group], totalBytes: group.totalBytes, solo: false });
    }
  }
  return buckets;
}

function nameBuckets(buckets) {
  let nextIndex = 0;
  return buckets.map((bucket) => (bucket.solo ? bucket.groups[0].dictLang : `bundle-${nextIndex++}`));
}

function writeBucketFile(name, relPaths) {
  const chunks = [];
  const files = {};
  let offset = 0;
  for (const relPath of [...relPaths].sort()) {
    const bytes = readFileSync(path.join(TRIMMED_DIR, relPath));
    files[relPath.split(path.sep).join('/')] = { offset, length: bytes.length };
    chunks.push(bytes);
    offset += bytes.length;
  }
  const blob = Buffer.concat(chunks);
  const fileName = `${name}.data`;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, fileName), blob);
  return { path: fileName, files, totalBytes: blob.length };
}

function main() {
  if (!existsSync(TRIMMED_DIR)) {
    throw new Error(`${TRIMMED_DIR} not found — run scripts/trim-data.mjs first`);
  }
  const voiceMap = JSON.parse(readFileSync(path.join(ROOT, 'scripts/voice-map.json'), 'utf8'));

  for (const f of SHARED_CORE_FILES) {
    if (!existsSync(path.join(TRIMMED_DIR, f))) {
      throw new Error(`bundle-data: expected core file missing: ${f}`);
    }
  }
  const allLangFiles = walkLangFiles(path.join(TRIMMED_DIR, 'lang'));
  const coreFiles = [...SHARED_CORE_FILES, ...allLangFiles];

  const groups = buildDictGroups(voiceMap);
  const buckets = packBuckets(groups);

  const manifest = {
    generatedAt: new Date().toISOString(),
    core: writeBucketFile('core', coreFiles),
    buckets: {},
    voiceToBucket: {},
  };

  const bucketNames = nameBuckets(buckets);
  buckets.forEach((bucket, i) => {
    const name = bucketNames[i];
    const relPaths = bucket.groups.map((g) => g.file);
    manifest.buckets[name] = writeBucketFile(name, relPaths);
    for (const group of bucket.groups) {
      for (const voice of group.voices) {
        manifest.voiceToBucket[voice] = name;
      }
    }
  });

  writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log(`core bucket: ${manifest.core.path} (${(manifest.core.totalBytes / 1024).toFixed(0)} KiB, ${Object.keys(manifest.core.files).length} files — shared tables + every voice's lang/ definition)`);
  for (const [name, bucket] of Object.entries(manifest.buckets)) {
    const mib = (bucket.totalBytes / 1024 / 1024).toFixed(2);
    const flag = bucket.totalBytes > BUCKET_TARGET_BYTES * 1.1 ? '  ⚠ over target' : '';
    console.log(`bucket "${name}": ${bucket.path} (${mib} MiB, ${Object.keys(bucket.files).length} dict${Object.keys(bucket.files).length === 1 ? '' : 's'})${flag}`);
  }
  console.log(`${Object.keys(manifest.buckets).length} language buckets, ${Object.keys(manifest.voiceToBucket).length} voices mapped`);
  console.log(`manifest: ${path.join(OUT_DIR, 'manifest.json')}`);
}

main();
