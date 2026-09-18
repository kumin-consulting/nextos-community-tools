// scripts/build-manifest.mjs - writes manifest.json from every valid tool
// folder (README.md inlined as `readme`, local image paths rewritten to
// their raw GitHub URLs so the website can show them). `--check` fails
// when the committed manifest.json differs from a fresh build.
//
// A skin carries more than a link: `skin` is the whole spec out of
// skin/skin.json and `preview` is the absolute URL of its rendered
// preview.svg. NextOS installs a skin straight from this file, so the
// manifest is the distribution channel rather than an index of one.
//
// A script or an extension (E3, script-extension-kinds) carries its
// whole manifest the same way - `script`/`extension` is the validated
// script.json/extension.json - PLUS a `download` block (url/sha256/bytes
// from the kind's own lock file), because unlike a skin it is code: the
// website can show its permissions, tools and triggers/slots straight
// out of the manifest.json fetch, but NextOS still downloads and
// hash-verifies the zip to install it, exactly like an app.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadTools } from './validate.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const RAW = 'https://raw.githubusercontent.com/kumin-consulting/nextos-community-tools/main';

const tools = loadTools();
const bad = tools.filter((t) => t.problems.length);
if (bad.length) { console.error(`Fix these before building: ${bad.map((t) => t.slug).join(', ')}`); process.exit(1); }

const absolute = (slug, src) => (/^https:\/\//.test(src) ? src : `${RAW}/tools/${slug}/${src}`);

/** The download block for a script/extension entry, read from its own
 *  <kind>.lock.json - the same file build-catalog.mjs reads for the App
 *  Store's copy of this same information. */
const downloadFor = (slug, kind) => {
  const lockPath = join(ROOT, 'tools', slug, kind, `${kind}.lock.json`);
  if (!existsSync(lockPath)) return undefined;
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  return { url: `${RAW}/tools/${slug}/${kind}/${kind}.zip`, sha256: lock.sha256, bytes: lock.bytes };
};

const manifest = {
  format: 'nextos-community-tools',
  version: 1,
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'https://github.com/kumin-consulting/nextos-community-tools',
  tools: tools.map(({ slug, tool, readme, skin, scriptManifest, extensionManifest }) => ({
    ...tool,
    ...(tool.kind === 'skin' && skin ? { skin, preview: absolute(slug, 'images/preview.svg') } : {}),
    ...(tool.kind === 'script' && scriptManifest ? { script: scriptManifest, download: downloadFor(slug, 'script') } : {}),
    ...(tool.kind === 'extension' && extensionManifest ? { extension: extensionManifest, download: downloadFor(slug, 'extension') } : {}),
    seo: tool.seo ? { ...tool.seo, ...(tool.seo.ogImage ? { ogImage: absolute(slug, tool.seo.ogImage) } : {}) } : undefined,
    screenshots: (tool.screenshots ?? []).map((s) => ({ ...s, src: absolute(slug, s.src) })),
    readme: readme.trim(),
    page: `https://www.jonkum.in/community/${slug}`,
  })),
};
const text = JSON.stringify(manifest, null, 2) + '\n';
const target = join(ROOT, 'manifest.json');
if (process.argv.includes('--check')) {
  let current = null;
  try { current = JSON.parse(readFileSync(target, 'utf8')); } catch {}
  if (!current || !Array.isArray(current.tools)) { console.error('manifest.json is missing or unreadable - run `npm run build` and commit it.'); process.exit(1); }
  const listed = new Set(current.tools.map((t) => t.slug));
  const fresh = manifest.tools.filter((t) => listed.has(t.slug));
  const added = manifest.tools.filter((t) => !listed.has(t.slug)).map((t) => t.slug);
  const removed = current.tools.filter((t) => !manifest.tools.some((f) => f.slug === t.slug)).map((t) => t.slug);
  // Both lists come out of loadTools' folder order, so a plain stringify
  // of the overlap is a fair comparison.
  const listedNow = current.tools.filter((t) => manifest.tools.some((f) => f.slug === t.slug));
  if (JSON.stringify(fresh) !== JSON.stringify(listedNow)) {
    console.error('manifest.json is out of date for a tool it already lists - run `npm run build` and commit it.');
    process.exit(1);
  }
  if (removed.length) { console.error(`manifest.json lists tool(s) that no longer exist: ${removed.join(', ')} - run \`npm run build\` and commit it.`); process.exit(1); }
  if (added.length) console.log(`manifest.json is up to date; ${added.length} new tool folder(s) not listed yet (${added.join(', ')}) - the manifest is rebuilt on merge.`);
  else console.log('manifest.json is up to date.');
} else {
  writeFileSync(target, text);
  console.log(`Wrote manifest.json with ${manifest.tools.length} tool(s).`);
}
