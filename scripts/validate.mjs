// scripts/validate.mjs - checks every tools/<slug>/tool.json against
// schema/tool.schema.json (scripts/lib/jsonSchema.mjs is the small
// dependency-free validator both schemas go through), the folder/slug
// match, the README, and cross-tool rules (unique slugs, `related` slugs
// exist). A tool with kind "skin" is checked further: its skin/skin.json
// against schema/skin.schema.json, its rendered pictures, and that the
// three things a listing repeats about a skin (id, name, description)
// agree with the tool.json around it.
// No dependencies, so a contributor needs only Node.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { validateAgainst } from './lib/jsonSchema.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const schema = JSON.parse(readFileSync(join(ROOT, 'schema/tool.schema.json'), 'utf8'));
const skinSchema = JSON.parse(readFileSync(join(ROOT, 'schema/skin.schema.json'), 'utf8'));

export { validateAgainst };

export function validateTool(tool) {
  const errors = [];
  validateAgainst(schema, tool, 'tool', errors);
  if (tool && typeof tool === 'object') {
    if (tool.publishedAt && tool.updatedAt && tool.updatedAt < tool.publishedAt) errors.push('tool.updatedAt: earlier than publishedAt');
    const inst = tool.install;
    if (inst && typeof inst === 'object') {
      if (inst.kind === 'command' && !inst.command) errors.push('tool.install.command: required for kind "command"');
      if (inst.kind === 'url' && !inst.url) errors.push('tool.install.url: required for kind "url"');
      if (inst.kind === 'steps' && !inst.steps) errors.push('tool.install.steps: required for kind "steps"');
      if (inst.kind === 'app-store' && !inst.appId) errors.push('tool.install.appId: required for kind "app-store"');
    }
    for (const s of tool.screenshots ?? []) if (s && typeof s.src === 'string' && !/^https:\/\//.test(s.src) && (s.src.startsWith('/') || s.src.includes('..'))) errors.push('tool.screenshots: a local src is a file inside this tool folder (no leading slash, no ..)');
    if (tool.seo?.ogImage && !/^https:\/\//.test(tool.seo.ogImage) && (tool.seo.ogImage.startsWith('/') || tool.seo.ogImage.includes('..'))) errors.push('tool.seo.ogImage: a local path is a file inside this tool folder');
  }
  return errors;
}

/** Everything a `kind: "skin"` folder has to hold beyond the usual, and
 *  everything its skin.json has to agree with. The skin is the payload
 *  the website inlines in manifest.json and NextOS installs from, so it
 *  is validated here rather than trusted. */
export function validateSkinFolder(folder, tool) {
  const problems = [];
  const skinFile = join(folder, 'skin/skin.json');
  if (!existsSync(skinFile)) {
    problems.push('skin/skin.json is missing (a tool with kind "skin" carries the skin itself)');
    return problems;
  }
  let skin = null;
  try {
    skin = JSON.parse(readFileSync(skinFile, 'utf8'));
  } catch (e) {
    problems.push(`skin/skin.json is not valid JSON: ${e.message}`);
    return problems;
  }
  validateAgainst(skinSchema, skin, 'skin', problems);
  if (skin && typeof skin === 'object') {
    if (skin.id !== tool.slug) problems.push(`skin.id "${skin.id}" must equal the tool slug "${tool.slug}"`);
    if (skin.name !== tool.name) problems.push(`skin.name "${skin.name}" must equal tool.name "${tool.name}"`);
    if (skin.description !== tool.summary) problems.push('skin.description must be the same sentence as tool.summary');
    if (skin.sky?.style === 'image' && skin.sky?.image === undefined) problems.push('skin.sky.image: required when skin.sky.style is "image"');
  }
  for (const picture of ['images/preview.svg', 'images/swatch.svg']) {
    if (!existsSync(join(folder, picture))) problems.push(`${picture} is missing (rendered from the skin, not a screenshot)`);
  }
  if (tool.install?.kind !== 'skin') problems.push('tool.install.kind: must be "skin" for a skin');
  return problems;
}

export function loadTools() {
  const dir = join(ROOT, 'tools');
  const out = [];
  for (const entry of readdirSync(dir).sort()) {
    if (entry.startsWith('_') || entry.startsWith('.')) continue;
    const folder = join(dir, entry);
    if (!statSync(folder).isDirectory()) continue;
    const file = join(folder, 'tool.json');
    const problems = [];
    let tool = null;
    if (!existsSync(file)) problems.push('tool.json is missing');
    else {
      try { tool = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { problems.push(`tool.json is not valid JSON: ${e.message}`); }
    }
    if (tool) {
      problems.push(...validateTool(tool));
      if (tool.slug !== entry) problems.push(`slug "${tool.slug}" must equal the folder name "${entry}"`);
      if (!existsSync(join(folder, 'README.md'))) problems.push('README.md is missing (the long description)');
      for (const s of tool.screenshots ?? []) if (typeof s?.src === 'string' && !/^https:\/\//.test(s.src) && !existsSync(join(folder, s.src))) problems.push(`screenshot ${s.src} is not in the tool folder`);
      if (tool.seo?.ogImage && !/^https:\/\//.test(tool.seo.ogImage) && !existsSync(join(folder, tool.seo.ogImage))) problems.push(`seo.ogImage ${tool.seo.ogImage} is not in the tool folder`);
      if (tool.kind === 'skin') problems.push(...validateSkinFolder(folder, tool));
    }
      // The skin is read back here so build-manifest.mjs can inline it
    // without opening the folder again. A folder whose skin.json does not
    // parse has already collected a problem above, so `null` here is not a
    // silent failure - the build refuses to run at all while any tool has
    // problems.
    let skin = null;
    const skinFile = join(folder, 'skin/skin.json');
    if (tool?.kind === 'skin' && existsSync(skinFile)) {
      try { skin = JSON.parse(readFileSync(skinFile, 'utf8')); } catch { skin = null; }
    }
    out.push({ slug: entry, tool, problems, skin, readme: existsSync(join(folder, 'README.md')) ? readFileSync(join(folder, 'README.md'), 'utf8') : '' });
  }
  const slugs = new Set(out.map((t) => t.slug));
  for (const t of out) for (const rel of t.tool?.related ?? []) if (!slugs.has(rel)) t.problems.push(`related slug "${rel}" is not a tool in this repository`);
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const tools = loadTools();
  let bad = 0;
  for (const t of tools) {
    if (t.problems.length) { bad++; console.error(`✗ tools/${t.slug}\n  - ${t.problems.join('\n  - ')}`); }
    else console.log(`✓ tools/${t.slug} (${t.tool.name})`);
  }
  console.log(`\n${tools.length - bad} valid, ${bad} with problems`);
  if (bad > 0) process.exit(1);
}
