// scripts/build-tool.mjs <slug> [--check]
//
// Builds one community tool's downloadable folder the way NextOS itself
// builds it - the generalisation of build-app.mjs (E3, script-extension-
// kinds) to all three code kinds: `app` (unchanged from build-app.mjs),
// `script` and `extension`. Which one runs is read straight off
// tools/<slug>/tool.json's own `kind` - there is exactly one code
// sub-folder per tool, named after that kind (`app/`, `script/` or
// `extension/`).
//
//   app        tools/<slug>/app/files/app.json            (kind: native only compiles)
//   script     tools/<slug>/script/files/script.json       (always compiles - a script IS code)
//   extension  tools/<slug>/extension/files/extension.json (compiles when `main` is present)
//
// Each compiles tools/<slug>/<kind>/files/src/** with the same pure
// module linker NextOS uses inside the OS (scripts/lib/moduleGraph.ts,
// vendored from lib/apps/native/moduleGraph.ts - see that file's header
// for the `@kumin/script` addition and its placeholder status), writes
// files/build/<kind === 'app' ? 'app' : 'index'>.js (+ .css for an app),
// zips tools/<slug>/<kind>/files/ byte-reproducibly into
// tools/<slug>/<kind>/<kind>.zip and records its sha256 and size in
// tools/<slug>/<kind>/<kind>.lock.json. `--check` fails if the committed
// outputs differ from a fresh build (the pull-request check runs it for
// every tool that ships one of the three kinds).
//
// SKIN-SCRIPTS SERIES ADDITION (S2, "share"): a fourth kind, `skin`, but
// only when the skin itself carries a `script` (skin/skin.json's own
// `script.main`) - a data-only skin (`dawn`) has nothing to build here
// and still exits 1 with the same "has no downloadable folder to build"
// prefix as before this addition, now with a clarifying suffix naming
// why (verified by re-running this script against `dawn`: same exit
// code, a superset of the previous message). A scripted skin's folder
// shape does NOT
// follow the app/script/extension `<kind>/files/<kind>.json` convention
// above - it keeps the skin folder's existing, simpler shape
// (`skin/skin.json` directly, no `files/` indirection - see
// scripts/validate.mjs's `validateSkinFolder`, unchanged for a data-only
// skin) and only adds `skin/src/**`, `skin/build/skin.js`, `skin/skin.zip`
// and `skin/skin.lock.json`. See `buildSkinTool` below, a fully separate
// code path from the generic one that follows it, so neither can regress
// the other.
//
// Run with: node --experimental-transform-types scripts/build-tool.mjs <slug>
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { buildBundle } from './lib/moduleGraph.ts';
import { listFilesForZip, buildZip } from './lib/reproducibleZip.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const slug = process.argv[2];
const check = process.argv.includes('--check');
if (!slug) { console.error('usage: build-tool.mjs <slug> [--check]'); process.exit(2); }

const toolPath = join(ROOT, 'tools', slug, 'tool.json');
if (!existsSync(toolPath)) { console.error(`${slug}: tools/${slug}/tool.json is missing`); process.exit(1); }
const tool = JSON.parse(readFileSync(toolPath, 'utf8'));
const kind = tool.kind;

/** A scripted skin's build: compiles `skin/src/**` (entry `skin.script.
 *  main`) with the same linker, in `kind: 'skin'` mode (the `@kumin/skin`
 *  bare specifier - see moduleGraph.ts's header), to `skin/build/
 *  skin.js`, then zips exactly `skin.json` (with `id` confirmed equal to
 *  the slug - it always is here, since a skin's id is never renamed by a
 *  pull request the way a script/extension's can be by freeSlug) plus
 *  every `src/**` file plus `build/skin.js` - MASTER's contract for
 *  `skin.zip`'s root - into `skin/skin.zip`, recording its sha256 and
 *  size in `skin/skin.lock.json`. Returns before touching anything else
 *  in this file, so app/script/extension's code path is completely
 *  unreached and unchanged for a skin. */
function buildSkinTool() {
  const skinDir = join(ROOT, 'tools', slug, 'skin');
  const skinJsonPath = join(skinDir, 'skin.json');
  if (!existsSync(skinJsonPath)) { console.error(`${slug}: tools/${slug}/skin/skin.json is missing`); process.exit(1); }
  const skin = JSON.parse(readFileSync(skinJsonPath, 'utf8'));
  if (!skin.script || typeof skin.script.main !== 'string') {
    console.error(`${slug}: tool.json's kind ("skin") has no downloadable folder to build (this skin carries no script)`);
    process.exit(1);
  }
  if (skin.id !== slug) { console.error(`${slug}: skin.json's id "${skin.id}" must equal the tool slug`); process.exit(1); }

  const srcDir = join(skinDir, 'src');
  if (!existsSync(srcDir)) { console.error(`${slug}: tools/${slug}/skin/src is missing`); process.exit(1); }
  const files = {};
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const full = join(d, e.name); if (e.isDirectory()) walk(full); else if (/\.(tsx|ts|jsx|js|css|json)$/i.test(e.name)) files['src/' + relative(srcDir, full).split(sep).join('/')] = readFileSync(full, 'utf8'); } };
  walk(srcDir);
  const entryPath = skin.script.main;
  if (!Object.prototype.hasOwnProperty.call(files, entryPath)) { console.error(`${slug}: skin.script.main "${entryPath}" is not among skin/src/**`); process.exit(1); }
  const result = buildBundle({ entryPath, files, appId: slug, kind: 'skin' });
  console.log(result.log.split('\n').map((l) => `  ${l}`).join('\n'));

  const changed = [];
  const buildPath = join(skinDir, 'build/skin.js');
  const currentBuild = existsSync(buildPath) ? readFileSync(buildPath, 'utf8') : null;
  if (currentBuild !== result.code) {
    changed.push('build/skin.js');
    if (!check) { mkdirSync(join(skinDir, 'build'), { recursive: true }); writeFileSync(buildPath, result.code); }
  }

  // Exactly skin.json + src/** + build/skin.js, sorted - not a directory
  // walk of skinDir (which also holds images-adjacent files, the
  // previous skin.zip/skin.lock.json, and would double-count them).
  const entries = [{ name: 'skin.json', data: Buffer.from(JSON.stringify(skin, null, 2) + '\n', 'utf8') }, { name: 'build/skin.js', data: Buffer.from(result.code, 'utf8') }];
  for (const [rel, text] of Object.entries(files)) entries.push({ name: rel, data: Buffer.from(text, 'utf8') });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const zip = buildZip(entries);
  const sha256 = createHash('sha256').update(zip).digest('hex');
  const lock = { sha256, bytes: zip.length, builtFrom: skin.version ?? '1' };
  const lockPath = join(skinDir, 'skin.lock.json');
  const zipPath = join(skinDir, 'skin.zip');
  const currentLock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) : null;
  if (!currentLock || currentLock.sha256 !== sha256 || currentLock.bytes !== zip.length) changed.push('skin.zip');
  if (zip.length > 4 * 1024 * 1024) { console.error(`${slug}: skin.zip is ${zip.length} bytes - NextOS refuses downloads over 4 MB`); process.exit(1); }
  if (check) {
    if (changed.length) { console.error(`${slug}: out of date (${changed.join(', ')}) - run \`npm run build:tool -- ${slug}\` and commit.`); process.exit(1); }
    console.log(`${slug}: up to date (${zip.length} bytes, sha256 ${sha256.slice(0, 12)}…)`);
  } else {
    writeFileSync(zipPath, zip);
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
    console.log(`${slug}: wrote skin.zip (${zip.length} bytes, sha256 ${sha256.slice(0, 12)}…)${changed.length ? ` - changed: ${changed.join(', ')}` : ''}`);
  }
}

if (kind === 'skin') { buildSkinTool(); process.exit(0); }

if (!['app', 'script', 'extension'].includes(kind)) { console.error(`${slug}: tool.json's kind ("${kind}") has no downloadable folder to build`); process.exit(1); }

const kindDir = join(ROOT, 'tools', slug, kind);
const filesDir = join(kindDir, 'files');
const manifestName = kind === 'app' ? 'app.json' : `${kind}.json`;
const manifestPath = join(filesDir, manifestName);
if (!existsSync(manifestPath)) { console.error(`${slug}: tools/${slug}/${kind}/files/${manifestName} is missing`); process.exit(1); }
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.id !== slug) { console.error(`${slug}: ${manifestName}'s id "${manifest.id}" must equal the tool slug`); process.exit(1); }

// Whether this tool's src/ actually needs compiling: an app only when
// its manifest kind is 'native' (bundled/hosted apps ship handwritten
// files with no build step); a script always (it is nothing BUT code);
// an extension only when it declares a `main` (a contributes-only
// extension with no worker-side logic has nothing to compile).
const needsCompile = kind === 'app' ? manifest.kind === 'native' : kind === 'script' ? true : Boolean(manifest.main);
const outBase = kind === 'app' ? 'app' : 'index';

const outputs = {};
if (needsCompile) {
  const srcDir = join(kindDir, 'src');
  if (!existsSync(srcDir)) { console.error(`${slug}: tools/${slug}/${kind}/src is missing`); process.exit(1); }
  const files = {};
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const full = join(d, e.name); if (e.isDirectory()) walk(full); else if (/\.(tsx|ts|jsx|js|css|json)$/i.test(e.name)) files['src/' + relative(srcDir, full).split(sep).join('/')] = readFileSync(full, 'utf8'); } };
  walk(srcDir);
  const entryPath = manifest.source || manifest.main || 'src/index.ts';
  const result = buildBundle({ entryPath, files, appId: slug, kind: kind === 'app' ? 'app' : kind });
  outputs[`build/${outBase}.js`] = result.code;
  if (kind === 'app' && result.css) outputs['build/app.css'] = result.css;
  const expectedEntry = `build/${outBase}.js`;
  if (kind === 'app' && manifest.entry !== expectedEntry) { console.error(`${slug}: a native app.json's entry must be ${expectedEntry}`); process.exit(1); }
  console.log(result.log.split('\n').map((l) => `  ${l}`).join('\n'));
}

// panels/** (extension only) is copied verbatim into files/ - it is
// static HTML/CSS/JS for a sandboxed webview, not source the linker
// reaches from an entry point, so it ships exactly as committed under
// tools/<slug>/extension/files/panels/. Nothing to build; it just has to
// exist inside filesDir for listFilesForZip to pick it up, which it
// already does by being committed there directly.

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
const lockPath = join(kindDir, `${kind}.lock.json`);
const zipPath = join(kindDir, `${kind}.zip`);
const currentLock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) : null;
if (!currentLock || currentLock.sha256 !== sha256 || currentLock.bytes !== zip.length) changed.push(`${kind}.zip`);
if (zip.length > 4 * 1024 * 1024) { console.error(`${slug}: ${kind}.zip is ${zip.length} bytes - NextOS refuses downloads over 4 MB`); process.exit(1); }
if (check) {
  if (changed.length) { console.error(`${slug}: out of date (${changed.join(', ')}) - run \`npm run build:tool -- ${slug}\` and commit.`); process.exit(1); }
  console.log(`${slug}: up to date (${zip.length} bytes, sha256 ${sha256.slice(0, 12)}…)`);
} else {
  writeFileSync(zipPath, zip);
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  console.log(`${slug}: wrote ${kind}.zip (${zip.length} bytes, sha256 ${sha256.slice(0, 12)}…)${changed.length ? ` - changed: ${changed.join(', ')}` : ''}`);
}
