// scripts/build-catalog.mjs [--check]
//
// Writes catalog.json - a NextOS App Store catalogue ("kumin-catalog"
// format, the same one NextOS's own first-party catalogue uses) listing
// every community tool that ships an app (tools/<slug>/app/). Anyone adds
// it in NextOS under Settings > Apps > Sources with the URL
//   https://raw.githubusercontent.com/kumin-consulting/nextos-community-tools/main/catalog.json
// and every app here appears in their App Store, verified by sha256 on
// install. Download URLs point at each app's committed app.zip on the main
// branch. `--check` fails when the committed catalog.json is stale.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadTools } from './validate.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const RAW = 'https://raw.githubusercontent.com/kumin-consulting/nextos-community-tools/main';
const apps = [];
for (const { slug, tool, problems } of loadTools()) {
  if (problems.length) continue;
  const appDir = join(ROOT, 'tools', slug, 'app');
  if (!existsSync(join(appDir, 'files/app.json'))) continue;
  const manifest = JSON.parse(readFileSync(join(appDir, 'files/app.json'), 'utf8'));
  const lockPath = join(appDir, 'app.lock.json');
  if (!existsSync(lockPath)) { console.error(`${slug}: app.lock.json missing - run build:app first`); process.exit(1); }
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  apps.push({
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    kind: manifest.kind,
    ...(manifest.description ? { description: manifest.description } : {}),
    ...(manifest.icon ? { icon: manifest.icon } : {}),
    homepage: `https://www.jonkum.in/community/${slug}`,
    ...(manifest.author ? { author: manifest.author } : {}),
    ...(manifest.license ? { license: manifest.license } : {}),
    permissions: manifest.permissions ?? [],
    download: { url: `${RAW}/tools/${slug}/app/app.zip`, sha256: lock.sha256, bytes: lock.bytes },
    ...(tool.screenshots?.length ? { screenshots: tool.screenshots.map((s) => (/^https:\/\//.test(s.src) ? s.src : `${RAW}/tools/${slug}/${s.src}`)) } : {}),
    tags: tool.tags ?? [],
  });
}
const catalog = { format: 'kumin-catalog', version: 1, name: 'NextOS community tools', description: 'Apps built by the community for NextOS - one page each at jonkum.in/community.', updatedAt: new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z', apps };
const text = JSON.stringify(catalog, null, 2) + '\n';
const target = join(ROOT, 'catalog.json');
const strip = (s) => s.replace(/"updatedAt": "[^"]*"/, '');
if (process.argv.includes('--check')) {
  const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
  if (strip(current) !== strip(text)) { console.error('catalog.json is out of date - run `npm run build:catalog` and commit.'); process.exit(1); }
  console.log(`catalog.json is up to date (${apps.length} app(s)).`);
} else {
  writeFileSync(target, text);
  console.log(`Wrote catalog.json with ${apps.length} app(s).`);
}
