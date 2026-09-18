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
const scriptSchema = JSON.parse(readFileSync(join(ROOT, 'schema/script.schema.json'), 'utf8'));
const extensionSchema = JSON.parse(readFileSync(join(ROOT, 'schema/extension.schema.json'), 'utf8'));

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
  // SKIN-SCRIPTS SERIES ADDITION (S2, share): a skin that carries a
  // `script` IS code, unlike a data-only skin - it needs the same
  // built/hash-locked download a script or an extension needs, and
  // `runsCode` on tool.json has to say so (schema/tool.schema.json).
  if (skin && typeof skin === 'object' && skin.script) {
    if (typeof skin.script.main !== 'string') problems.push('skin.script.main is required when skin.script is present');
    else if (!existsSync(join(folder, 'skin', skin.script.main))) problems.push(`skin.script.main "${skin.script.main}" is not in skin/src`);
    if (!existsSync(join(folder, 'skin/build/skin.js'))) problems.push('skin/build/skin.js is missing - run `npm run build:tool -- <slug>`');
    if (!existsSync(join(folder, 'skin/skin.zip'))) problems.push('skin/skin.zip is missing - run `npm run build:tool -- <slug>`');
    if (!existsSync(join(folder, 'skin/skin.lock.json'))) problems.push('skin/skin.lock.json is missing - run `npm run build:tool -- <slug>`');
    if (tool.runsCode !== true) problems.push('tool.runsCode: must be true for a skin that carries a script');
  } else if (tool.runsCode) {
    problems.push('tool.runsCode: must not be set for a skin with no script');
  }
  return problems;
}

/** Everything a `kind: "script"` folder has to hold: a valid
 *  script/files/script.json against schema/script.schema.json, its id
 *  matching the tool slug, and a built, hash-locked download - a script
 *  IS code, so (unlike a skin) there is no manifest-only path. */
export function validateScriptFolder(folder, tool) {
  const problems = [];
  const manifestFile = join(folder, 'script/files/script.json');
  if (!existsSync(manifestFile)) {
    problems.push('script/files/script.json is missing (a tool with kind "script" carries the script itself)');
    return problems;
  }
  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  } catch (e) {
    problems.push(`script/files/script.json is not valid JSON: ${e.message}`);
    return problems;
  }
  validateAgainst(scriptSchema, manifest, 'script', problems);
  if (manifest && typeof manifest === 'object') {
    if (manifest.id !== tool.slug) problems.push(`script.id "${manifest.id}" must equal the tool slug "${tool.slug}"`);
    if (manifest.name !== tool.name) problems.push('script.name must equal tool.name');
    // The schema's pattern already refuses a ".." segment; this is the
    // second, code-level check the brief asks for by name (a path
    // traversal in `main` is exactly the corpus case a generated CI
    // check must never wave through on a regex typo elsewhere).
    if (typeof manifest.main === 'string' && (manifest.main.includes('..') || manifest.main.startsWith('/'))) problems.push('script.main: must be a path under src/ with no ".." segment');
  }
  if (!existsSync(join(folder, 'script/files/build')) || readdirSync(join(folder, 'script/files/build')).filter((f) => f.endsWith('.js')).length === 0) {
    problems.push('script/files/build/*.js is missing - run `npm run build:tool -- <slug>`');
  }
  if (!existsSync(join(folder, 'script/script.lock.json'))) problems.push('script/script.lock.json is missing - run `npm run build:tool -- <slug>`');
  if (tool.install?.kind !== 'script') problems.push('tool.install.kind: must be "script" for a script');
  return problems;
}

/** Everything a `kind: "extension"` folder has to hold: a valid
 *  extension/files/extension.json against schema/extension.schema.json,
 *  its id matching the tool slug, at least one `contributes` list (an
 *  extension that contributes nothing is not an extension), every
 *  panels/settingsSections/railCards `html` path present on disk, and -
 *  only when it declares `main` - a built, hash-locked download exactly
 *  like a script's. */
export function validateExtensionFolder(folder, tool) {
  const problems = [];
  const manifestFile = join(folder, 'extension/files/extension.json');
  if (!existsSync(manifestFile)) {
    problems.push('extension/files/extension.json is missing (a tool with kind "extension" carries the extension itself)');
    return problems;
  }
  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  } catch (e) {
    problems.push(`extension/files/extension.json is not valid JSON: ${e.message}`);
    return problems;
  }
  validateAgainst(extensionSchema, manifest, 'extension', problems);
  if (manifest && typeof manifest === 'object') {
    if (manifest.id !== tool.slug) problems.push(`extension.id "${manifest.id}" must equal the tool slug "${tool.slug}"`);
    if (manifest.name !== tool.name) problems.push('extension.name must equal tool.name');
    if (typeof manifest.main === 'string' && (manifest.main.includes('..') || manifest.main.startsWith('/'))) problems.push('extension.main: must be a path under src/ with no ".." segment');
    const contributes = manifest.contributes && typeof manifest.contributes === 'object' ? manifest.contributes : {};
    const lists = ['commands', 'contextActions', 'fileHandlers', 'previewRenderers', 'panels', 'settingsSections', 'railCards', 'hooks', 'events'];
    if (!lists.some((k) => Array.isArray(contributes[k]) && contributes[k].length > 0)) {
      problems.push('extension.contributes: at least one contribution is required - an extension that contributes nothing has nothing to install');
    }
    for (const key of ['panels', 'settingsSections', 'railCards']) {
      for (const item of contributes[key] ?? []) {
        if (typeof item?.html === 'string' && (item.html.includes('..') || item.html.startsWith('/'))) problems.push(`extension.contributes.${key}: "${item.html}" must be a path under panels/ with no ".." segment`);
        else if (typeof item?.html === 'string' && !existsSync(join(folder, 'extension/files', item.html))) problems.push(`extension.contributes.${key}: ${item.html} is not in the tool folder`);
      }
    }
    if (manifest.main) {
      if (!existsSync(join(folder, 'extension/files/build')) || readdirSync(join(folder, 'extension/files/build')).filter((f) => f.endsWith('.js')).length === 0) {
        problems.push('extension/files/build/*.js is missing - run `npm run build:tool -- <slug>` (this extension declares `main`)');
      }
    }
  }
  if (!existsSync(join(folder, 'extension/extension.lock.json'))) problems.push('extension/extension.lock.json is missing - run `npm run build:tool -- <slug>`');
  if (tool.install?.kind !== 'extension') problems.push('tool.install.kind: must be "extension" for an extension');
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
      if (tool.kind === 'script') problems.push(...validateScriptFolder(folder, tool));
      if (tool.kind === 'extension') problems.push(...validateExtensionFolder(folder, tool));
    }
      // The skin/script/extension payload is read back here so
    // build-manifest.mjs and build-catalog.mjs can inline it without
    // opening the folder again. A folder whose payload does not parse has
    // already collected a problem above, so `null` here is not a silent
    // failure - the build refuses to run at all while any tool has
    // problems.
    let skin = null;
    const skinFile = join(folder, 'skin/skin.json');
    if (tool?.kind === 'skin' && existsSync(skinFile)) {
      try { skin = JSON.parse(readFileSync(skinFile, 'utf8')); } catch { skin = null; }
    }
    let scriptManifest = null;
    const scriptFile = join(folder, 'script/files/script.json');
    if (tool?.kind === 'script' && existsSync(scriptFile)) {
      try { scriptManifest = JSON.parse(readFileSync(scriptFile, 'utf8')); } catch { scriptManifest = null; }
    }
    let extensionManifest = null;
    const extensionFile = join(folder, 'extension/files/extension.json');
    if (tool?.kind === 'extension' && existsSync(extensionFile)) {
      try { extensionManifest = JSON.parse(readFileSync(extensionFile, 'utf8')); } catch { extensionManifest = null; }
    }
    out.push({ slug: entry, tool, problems, skin, scriptManifest, extensionManifest, readme: existsSync(join(folder, 'README.md')) ? readFileSync(join(folder, 'README.md'), 'utf8') : '' });
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
