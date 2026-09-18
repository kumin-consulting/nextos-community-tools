// scripts/build-catalog.mjs [--check]
//
// Writes catalog.json - a NextOS App Store catalogue ("kumin-catalog"
// format, the same one NextOS's own first-party catalogue uses) listing
// every community tool that ships an app, a script or an extension
// (tools/<slug>/{app,script,extension}/). Anyone adds it in NextOS under
// Settings > Apps > Sources with the URL
//   https://raw.githubusercontent.com/kumin-consulting/nextos-community-tools/main/catalog.json
// and every entry here appears in the App Store (apps in Browse, scripts
// and extensions in their own tabs - E4), verified by sha256 on install.
// An app entry's `kind` is its own bundled/hosted/native install kind, as
// before; a script/extension entry's `kind` is the literal string
// "script"/"extension" (E3, script-extension-kinds - see
// lib/apps/catalog/types.ts's CatalogAppEntry.kind on the NextOS side for
// why this is the same field widened, not a new one). Download URLs
// point at each entry's committed <kind>.zip on the main branch.
//
// SKIN-SCRIPTS SERIES ADDITION (S2, share): a SCRIPTED skin (one whose
// skin/skin.json carries a `script`) is listed too, `kind: "skin"` -
// NextOS's own lib/apps/catalog/validate.ts widens its KNOWN_KINDS to
// accept "skin" for exactly this reason: this same catalog.json also
// lists apps/scripts/extensions, and validateCatalog fails the WHOLE
// document on one unrecognised entry, not just that entry. A scripted
// skin is not installable through the App Store's own install flow
// (there is no native/hosted/bundled unpack for "skin" - a skin installs
// through the Skins app's Community tab, from manifest.json, which
// already carries its own `download` block) - listing it here only keeps
// this document parseable everywhere NextOS reads a "kumin-catalog", and
// gives anyone browsing an added catalogue source an honest look at what
// it lists. A data-only skin (`dawn`) is never listed here, unchanged.
// `--check` fails when the committed catalog.json is stale.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadTools } from './validate.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const RAW = 'https://raw.githubusercontent.com/kumin-consulting/nextos-community-tools/main';
const apps = [];
for (const { slug, tool, problems, skin } of loadTools()) {
  if (problems.length) continue;
  if (tool.kind === 'skin') {
    if (!skin?.script) continue;
    const lockPath = join(ROOT, 'tools', slug, 'skin', 'skin.lock.json');
    if (!existsSync(lockPath)) { console.error(`${slug}: skin.lock.json missing - run build:tool first`); process.exit(1); }
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    apps.push({
      id: skin.id,
      name: tool.name,
      version: tool.version,
      kind: 'skin',
      ...(tool.summary ? { description: tool.summary } : {}),
      homepage: `https://www.jonkum.in/community/${slug}`,
      ...(tool.author ? { author: tool.author } : {}),
      ...(tool.license ? { license: tool.license } : {}),
      permissions: [],
      download: { url: `${RAW}/tools/${slug}/skin/skin.zip`, sha256: lock.sha256, bytes: lock.bytes },
      screenshots: [`${RAW}/tools/${slug}/images/preview.svg`],
      tags: tool.tags ?? [],
    });
    continue;
  }
  if (!['app', 'script', 'extension'].includes(tool.kind)) continue;
  const kindDir = join(ROOT, 'tools', slug, tool.kind);
  const manifestName = tool.kind === 'app' ? 'app.json' : `${tool.kind}.json`;
  if (!existsSync(join(kindDir, 'files', manifestName))) continue;
  const manifest = JSON.parse(readFileSync(join(kindDir, 'files', manifestName), 'utf8'));
  const lockPath = join(kindDir, `${tool.kind}.lock.json`);
  if (!existsSync(lockPath)) { console.error(`${slug}: ${tool.kind}.lock.json missing - run build:tool first`); process.exit(1); }
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  apps.push({
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    kind: tool.kind === 'app' ? manifest.kind : tool.kind,
    ...(manifest.description ? { description: manifest.description } : {}),
    ...(manifest.icon ? { icon: manifest.icon } : {}),
    homepage: `https://www.jonkum.in/community/${slug}`,
    ...(manifest.author ? { author: manifest.author } : {}),
    ...(manifest.license ? { license: manifest.license } : {}),
    permissions: manifest.permissions ?? [],
    download: { url: `${RAW}/tools/${slug}/${tool.kind}/${tool.kind}.zip`, sha256: lock.sha256, bytes: lock.bytes },
    ...(tool.screenshots?.length ? { screenshots: tool.screenshots.map((s) => (/^https:\/\//.test(s.src) ? s.src : `${RAW}/tools/${slug}/${s.src}`)) } : {}),
    tags: tool.tags ?? [],
  });
}
const catalog = { format: 'kumin-catalog', version: 1, name: 'NextOS community tools', description: 'Apps, scripts and extensions built by the community for NextOS - one page each at jonkum.in/community.', updatedAt: new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z', apps };
const text = JSON.stringify(catalog, null, 2) + '\n';
const target = join(ROOT, 'catalog.json');
const strip = (s) => s.replace(/"updatedAt": "[^"]*"/, '');
if (process.argv.includes('--check')) {
  const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
  if (strip(current) !== strip(text)) { console.error('catalog.json is out of date - run `npm run build:catalog` and commit.'); process.exit(1); }
  console.log(`catalog.json is up to date (${apps.length} entr${apps.length === 1 ? 'y' : 'ies'}).`);
} else {
  writeFileSync(target, text);
  console.log(`Wrote catalog.json with ${apps.length} entr${apps.length === 1 ? 'y' : 'ies'}.`);
}
