// scripts/validate.mjs - checks every tools/<slug>/tool.json against
// schema/tool.schema.json (a small validator covering exactly what that
// schema uses: type, required, enum, pattern, min/max, uniqueItems,
// additionalProperties, format date/uri/email), the folder/slug match, the
// README, and cross-tool rules (unique slugs, `related` slugs exist).
// No dependencies, so a contributor needs only Node.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const schema = JSON.parse(readFileSync(join(ROOT, 'schema/tool.schema.json'), 'utf8'));

export function validateAgainst(node, value, path, errors) {
  if (node.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return errors.push(`${path}: must be an object`);
    for (const key of node.required ?? []) if (!(key in value)) errors.push(`${path}.${key}: required`);
    for (const [key, v] of Object.entries(value)) {
      const prop = node.properties?.[key];
      if (!prop) { if (node.additionalProperties === false) errors.push(`${path}.${key}: not a known field`); continue; }
      validateAgainst(prop, v, `${path}.${key}`, errors);
    }
    return;
  }
  if (node.type === 'array') {
    if (!Array.isArray(value)) return errors.push(`${path}: must be an array`);
    if (node.minItems !== undefined && value.length < node.minItems) errors.push(`${path}: at least ${node.minItems} item(s)`);
    if (node.maxItems !== undefined && value.length > node.maxItems) errors.push(`${path}: at most ${node.maxItems} item(s)`);
    if (node.uniqueItems && new Set(value.map((x) => JSON.stringify(x))).size !== value.length) errors.push(`${path}: items must be unique`);
    value.forEach((item, i) => validateAgainst(node.items, item, `${path}[${i}]`, errors));
    return;
  }
  if (node.type === 'string') {
    if (typeof value !== 'string') return errors.push(`${path}: must be a string`);
    if (node.minLength !== undefined && value.length < node.minLength) errors.push(`${path}: at least ${node.minLength} characters (got ${value.length})`);
    if (node.maxLength !== undefined && value.length > node.maxLength) errors.push(`${path}: at most ${node.maxLength} characters (got ${value.length})`);
    if (node.enum && !node.enum.includes(value)) errors.push(`${path}: must be one of ${node.enum.join(', ')}`);
    if (node.pattern && !new RegExp(node.pattern).test(value)) errors.push(`${path}: does not match ${node.pattern}`);
    if (node.format === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) errors.push(`${path}: must be YYYY-MM-DD`);
    if (node.format === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isNaN(Date.parse(value))) errors.push(`${path}: not a real date`);
    if (node.format === 'uri') { try { new URL(value); } catch { errors.push(`${path}: must be a URL`); } }
    if (node.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors.push(`${path}: must be an email address`);
    return;
  }
}

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
    }
    out.push({ slug: entry, tool, problems, readme: existsSync(join(folder, 'README.md')) ? readFileSync(join(folder, 'README.md'), 'utf8') : '' });
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
