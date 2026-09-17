// scripts/build-app.mjs <slug> [--check]
//
// Builds one community NATIVE app the way NextOS itself does: compiles
// tools/<slug>/app/src/** with the same pure module linker the OS uses
// (scripts/lib/moduleGraph.ts, vendored from lib/apps/native/moduleGraph.ts
// in the NextOS repository - TypeScript's transpileModule, CommonJS
// modules wrapped into one ES module, the five bare specifiers react /
// react-dom / react/jsx-runtime / zustand / @kumin/sdk resolved at run
// time through window.__kuminSdk), writes tools/<slug>/app/files/build/
// app.js (+ app.css), zips tools/<slug>/app/files/ byte-reproducibly into
// tools/<slug>/app/app.zip and records its sha256 and size in
// tools/<slug>/app/app.lock.json. `--check` fails if the committed outputs
// differ from a fresh build (the pull-request check runs it for every app).
//
// Run with: node --experimental-transform-types scripts/build-app.mjs <slug>
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { buildBundle } from './lib/moduleGraph.ts';
import { listFilesForZip, buildZip } from './lib/reproducibleZip.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const slug = process.argv[2];
const check = process.argv.includes('--check');
if (!slug) { console.error('usage: build-app.mjs <slug> [--check]'); process.exit(2); }
const appDir = join(ROOT, 'tools', slug, 'app');
const filesDir = join(appDir, 'files');
const manifestPath = join(filesDir, 'app.json');
if (!existsSync(manifestPath)) { console.error(`${slug}: tools/${slug}/app/files/app.json is missing`); process.exit(1); }
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.id !== slug) { console.error(`${slug}: app.json id "${manifest.id}" must equal the tool slug`); process.exit(1); }

const outputs = {};
if (manifest.kind === 'native') {
  const srcDir = join(appDir, 'src');
  if (!existsSync(srcDir)) { console.error(`${slug}: tools/${slug}/app/src is missing`); process.exit(1); }
  const files = {};
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const full = join(d, e.name); if (e.isDirectory()) walk(full); else if (/\.(tsx|ts|jsx|js|css|json)$/i.test(e.name)) files['src/' + relative(srcDir, full).split(sep).join('/')] = readFileSync(full, 'utf8'); } };
  walk(srcDir);
  const entryPath = manifest.source || 'src/index.tsx';
  const result = buildBundle({ entryPath, files, appId: slug });
  outputs['build/app.js'] = result.code;
  if (result.css) outputs['build/app.css'] = result.css;
  if (manifest.entry !== 'build/app.js') { console.error(`${slug}: a native app.json's entry must be build/app.js`); process.exit(1); }
  console.log(result.log.split('\n').map((l) => `  ${l}`).join('\n'));
}

const changed = [];
for (const [rel, text] of Object.entries(outputs)) {
  const target = join(filesDir, rel);
  const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
  if (current !== text) {
    changed.push(rel);
    if (!check) { mkdirSync(join(filesDir, 'build'), { recursive: true }); writeFileSync(target, text); }
  }
}
const zip = buildZip(listFilesForZip(filesDir).filter((f) => !f.name.startsWith('.')));
const sha256 = createHash('sha256').update(zip).digest('hex');
const lock = { sha256, bytes: zip.length, builtFrom: manifest.version };
const lockPath = join(appDir, 'app.lock.json');
const zipPath = join(appDir, 'app.zip');
const currentLock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) : null;
if (!currentLock || currentLock.sha256 !== sha256 || currentLock.bytes !== zip.length) changed.push('app.zip');
if (zip.length > 4 * 1024 * 1024) { console.error(`${slug}: app.zip is ${zip.length} bytes - NextOS refuses downloads over 4 MB`); process.exit(1); }
if (check) {
  if (changed.length) { console.error(`${slug}: out of date (${changed.join(', ')}) - run \`npm run build:app -- ${slug}\` and commit.`); process.exit(1); }
  console.log(`${slug}: up to date (${zip.length} bytes, sha256 ${sha256.slice(0, 12)}…)`);
} else {
  writeFileSync(zipPath, zip);
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  console.log(`${slug}: wrote app.zip (${zip.length} bytes, sha256 ${sha256.slice(0, 12)}…)${changed.length ? ` - changed: ${changed.join(', ')}` : ''}`);
}
