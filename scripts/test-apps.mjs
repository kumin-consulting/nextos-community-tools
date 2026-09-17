// scripts/test-apps.mjs - runs every tools/<slug>/app/test/*.test.mjs
// (pure-logic tests an app ships: engines, parsers, schedulers - no DOM).
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const ROOT = new URL('..', import.meta.url).pathname;
let failed = 0, ran = 0;
for (const slug of readdirSync(join(ROOT, 'tools')).sort()) {
  const dir = join(ROOT, 'tools', slug, 'app', 'test');
  if (slug.startsWith('_') || !existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort()) {
    ran++;
    const r = spawnSync(process.execPath, ['--experimental-transform-types', join(dir, f)], { stdio: 'inherit' });
    if (r.status !== 0) { failed++; console.error(`✗ ${slug}/${f}`); }
  }
}
console.log(`\n${ran - failed} test file(s) passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
