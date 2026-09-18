// scripts/build-manifest.mjs - writes manifest.json from every valid tool
// folder (README.md inlined as `readme`, local image paths rewritten to
// their raw GitHub URLs so the website can show them). `--check` fails
// when the committed manifest.json differs from a fresh build.
//
// A skin carries more than a link: `skin` is the whole spec out of
// skin/skin.json and `preview` is the absolute URL of its rendered
// preview.svg. NextOS installs a skin straight from this file, so the
// manifest is the distribution channel rather than an index of one.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadTools } from './validate.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const RAW = 'https://raw.githubusercontent.com/kumin-consulting/nextos-community-tools/main';

const tools = loadTools();
const bad = tools.filter((t) => t.problems.length);
if (bad.length) { console.error(`Fix these before building: ${bad.map((t) => t.slug).join(', ')}`); process.exit(1); }

const absolute = (slug, src) => (/^https:\/\//.test(src) ? src : `${RAW}/tools/${slug}/${src}`);
const manifest = {
  format: 'nextos-community-tools',
  version: 1,
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'https://github.com/kumin-consulting/nextos-community-tools',
  tools: tools.map(({ slug, tool, readme, skin }) => ({
    ...tool,
    ...(tool.kind === 'skin' && skin ? { skin, preview: absolute(slug, 'images/preview.svg') } : {}),
    seo: tool.seo ? { ...tool.seo, ...(tool.seo.ogImage ? { ogImage: absolute(slug, tool.seo.ogImage) } : {}) } : undefined,
    screenshots: (tool.screenshots ?? []).map((s) => ({ ...s, src: absolute(slug, s.src) })),
    readme: readme.trim(),
    page: `https://www.jonkum.in/community/${slug}`,
  })),
};
const text = JSON.stringify(manifest, null, 2) + '\n';
const target = join(ROOT, 'manifest.json');
if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(target, 'utf8'); } catch {}
  const strip = (s) => s.replace(/"generatedAt": "[^"]*"/, '');
  if (strip(current) !== strip(text)) { console.error('manifest.json is out of date - run `npm run build` and commit it.'); process.exit(1); }
  console.log('manifest.json is up to date.');
} else {
  writeFileSync(target, text);
  console.log(`Wrote manifest.json with ${manifest.tools.length} tool(s).`);
}
