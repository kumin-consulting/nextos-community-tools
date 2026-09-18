// scripts/test-apps.mjs - runs every tools/<slug>/{app,script,extension}/
// test/*.test.mjs (pure-logic tests a tool ships: engines, parsers,
// schedulers - no DOM). Kept as `test-apps.mjs` (the npm script name
// `test:apps` is what CI calls) even though it now covers all three code
// kinds.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const ROOT = new URL('..', import.meta.url).pathname;
const KINDS = ['app', 'script', 'extension'];
let failed = 0, ran = 0;
for (const slug of readdirSync(join(ROOT, 'tools')).sort()) {
  if (slug.startsWith('_')) continue;
  for (const kind of KINDS) {
    const dir = join(ROOT, 'tools', slug, kind, 'test');
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort()) {
      ran++;
      const r = spawnSync(process.execPath, ['--experimental-transform-types', join(dir, f)], { stdio: 'inherit' });
      if (r.status !== 0) { failed++; console.error(`✗ ${slug}/${kind}/${f}`); }
    }
  }
}
console.log(`\n${ran - failed} test file(s) passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
