// scripts/check-apps.mjs - the pull-request check for apps: every
// tools/<slug>/app/ builds to exactly what is committed, and catalog.json
// is current. Run after `npm test`.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const ROOT = new URL('..', import.meta.url).pathname;
let bad = 0;
for (const slug of readdirSync(join(ROOT, 'tools')).sort()) {
  if (slug.startsWith('_') || !existsSync(join(ROOT, 'tools', slug, 'app', 'files', 'app.json'))) continue;
  const r = spawnSync(process.execPath, ['--experimental-transform-types', join(ROOT, 'scripts/build-app.mjs'), slug, '--check'], { stdio: 'inherit' });
  if (r.status !== 0) bad++;
}
const c = spawnSync(process.execPath, ['--experimental-transform-types', join(ROOT, 'scripts/build-catalog.mjs'), '--check'], { stdio: 'inherit' });
if (c.status !== 0) bad++;
process.exit(bad ? 1 : 0);
