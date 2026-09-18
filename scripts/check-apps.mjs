// scripts/check-apps.mjs - the pull-request check for code-bearing tools:
// every tools/<slug>/{app,script,extension}/ builds to exactly what is
// committed, and catalog.json is current. Run after `npm test`. Kept as
// `check-apps.mjs` (the npm script name `check:apps` is what CI calls)
// even though it now checks all three code kinds, via build-tool.mjs -
// see that file's header.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const ROOT = new URL('..', import.meta.url).pathname;
const KINDS = ['app', 'script', 'extension'];
let bad = 0;
for (const slug of readdirSync(join(ROOT, 'tools')).sort()) {
  if (slug.startsWith('_')) continue;
  const hasCode = KINDS.some((kind) => existsSync(join(ROOT, 'tools', slug, kind, 'files', kind === 'app' ? 'app.json' : `${kind}.json`)));
  if (!hasCode) continue;
  const r = spawnSync(process.execPath, ['--experimental-transform-types', join(ROOT, 'scripts/build-tool.mjs'), slug, '--check'], { stdio: 'inherit' });
  if (r.status !== 0) bad++;
}
const c = spawnSync(process.execPath, ['--experimental-transform-types', join(ROOT, 'scripts/build-catalog.mjs'), '--check'], { stdio: 'inherit' });
if (c.status !== 0) bad++;
process.exit(bad ? 1 : 0);
