// scripts/lib/jsonSchema.mjs - a small JSON Schema validator covering
// exactly the keywords schema/tool.schema.json and schema/skin.schema.json
// use: type (object, array, string, number, integer, boolean), const,
// enum, required, properties, additionalProperties, pattern, minLength,
// maxLength, minimum, maximum, minItems, maxItems, uniqueItems, items,
// and the string formats date, date-time, uri and email.
//
// No dependencies, so a contributor needs only Node to check their tool
// folder, and CI needs no install step. This is deliberately NOT a
// complete draft-07 implementation: it validates what these two schemas
// state and reports every problem it finds rather than the first, because
// a person fixing a tool.json wants the whole list in one pass.
//
// The schemas are written by hand (tool) and generated (skin, from
// lib/os/skins/types.ts in the NextOS repository by its
// scripts/build-skin-schema.mjs). Keep this file able to read both.

const typeOf = (value) => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

/**
 * Collects every problem `value` has against `node` into `errors`.
 * `path` is the human-readable location, e.g. `skin.tokens.ground`.
 */
export function validateAgainst(node, value, path, errors) {
  if (!node || typeof node !== 'object') return;

  if ('const' in node && value !== node.const) {
    errors.push(`${path}: must be ${JSON.stringify(node.const)}`);
    return;
  }

  if (node.type === 'object') {
    if (typeOf(value) !== 'object') return errors.push(`${path}: must be an object`);
    for (const key of node.required ?? []) if (!(key in value)) errors.push(`${path}.${key}: required`);
    for (const [key, v] of Object.entries(value)) {
      const prop = node.properties?.[key];
      if (!prop) {
        if (node.additionalProperties === false) errors.push(`${path}.${key}: not a known field`);
        continue;
      }
      validateAgainst(prop, v, `${path}.${key}`, errors);
    }
    return;
  }

  if (node.type === 'array') {
    if (!Array.isArray(value)) return errors.push(`${path}: must be an array`);
    if (node.minItems !== undefined && value.length < node.minItems) errors.push(`${path}: at least ${node.minItems} item(s)`);
    if (node.maxItems !== undefined && value.length > node.maxItems) errors.push(`${path}: at most ${node.maxItems} item(s)`);
    if (node.uniqueItems && new Set(value.map((x) => JSON.stringify(x))).size !== value.length) errors.push(`${path}: items must be unique`);
    if (node.items) value.forEach((item, i) => validateAgainst(node.items, item, `${path}[${i}]`, errors));
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
    if (node.format === 'date-time' && Number.isNaN(Date.parse(value))) errors.push(`${path}: must be an ISO date and time`);
    if (node.format === 'uri') { try { new URL(value); } catch { errors.push(`${path}: must be a URL`); } }
    if (node.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors.push(`${path}: must be an email address`);
    return;
  }

  if (node.type === 'number' || node.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return errors.push(`${path}: must be a number`);
    if (node.type === 'integer' && !Number.isInteger(value)) errors.push(`${path}: must be a whole number`);
    if (node.minimum !== undefined && value < node.minimum) errors.push(`${path}: ${value} is below ${node.minimum}`);
    if (node.maximum !== undefined && value > node.maximum) errors.push(`${path}: ${value} is above ${node.maximum}`);
    if (node.enum && !node.enum.includes(value)) errors.push(`${path}: must be one of ${node.enum.join(', ')}`);
    return;
  }

  if (node.type === 'boolean') {
    if (typeof value !== 'boolean') errors.push(`${path}: must be true or false`);
    return;
  }

  // No `type`: still honour a bare enum.
  if (node.enum && !node.enum.includes(value)) errors.push(`${path}: must be one of ${node.enum.join(', ')}`);
}

/** Convenience: the error list for one value against one schema. */
export function validateJson(schema, value, path = 'value') {
  const errors = [];
  validateAgainst(schema, value, path, errors);
  return errors;
}
