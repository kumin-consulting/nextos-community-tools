// src/lib/tsv.ts
//
// Anki's clipboard format, in and out. Anki exports and imports plain
// tab-separated text: front, tab, back, and optionally a third column of
// space-separated tags. It writes `<br>` for a line break inside a field
// and quotes a field that contains a tab or a newline, doubling any
// quote inside it - the same rules a CSV writer follows, with a tab
// instead of a comma. Lines starting with `#` are Anki's own directives
// (`#separator:tab`, `#html:true`) and are skipped.
//
// Nothing here throws: a file that is not really TSV comes back as rows
// with a front and no back, and the importer shows you that before it
// writes anything.

import type { DraftCard } from './types';

export interface TsvParseResult {
  cards: DraftCard[];
  /** Rows that had no second column - shown to the person before import. */
  skipped: number;
  /** How many rows had a third column of tags. */
  tagged: number;
}

function unescapeField(field: string): string {
  let value = field;
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1).replace(/""/g, '"');
  }
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>\s*<div>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

/** Splits one TSV line, honouring quoted fields. */
export function splitTsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '""';
        i++;
      } else if (ch === '"') {
        quoted = false;
        field += ch;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
      field += ch;
      continue;
    }
    if (ch === '\t') {
      out.push(field);
      field = '';
      continue;
    }
    field += ch;
  }
  out.push(field);
  return out;
}

export function parseTsv(text: string): TsvParseResult {
  const cards: DraftCard[] = [];
  let skipped = 0;
  let tagged = 0;
  // A quoted field may hold newlines; join a line back up when its
  // quotes have not balanced yet.
  const raw = text.replace(/\r\n/g, '\n').split('\n');
  const lines: string[] = [];
  let pending = '';
  for (const line of raw) {
    const candidate = pending ? `${pending}\n${line}` : line;
    const quotes = (candidate.match(/"/g) ?? []).length;
    if (quotes % 2 === 1) {
      pending = candidate;
      continue;
    }
    pending = '';
    lines.push(candidate);
  }
  if (pending) lines.push(pending);

  for (const line of lines) {
    if (!line.trim() || line.startsWith('#')) continue;
    const fields = splitTsvLine(line).map(unescapeField);
    const [front, back, third] = fields;
    if (!front) continue;
    if (!back) {
      skipped++;
      continue;
    }
    const tags = (third ?? '')
      .split(/[\s,]+/)
      .map((t) => t.replace(/^#/, ''))
      .filter(Boolean);
    if (tags.length) tagged++;
    cards.push({ question: front, answer: back, tags });
  }
  return { cards, skipped, tagged };
}

function escapeField(value: string): string {
  const flat = value.replace(/\n/g, '<br>');
  return /[\t"]/.test(flat) ? `"${flat.replace(/"/g, '""')}"` : flat;
}

/** The other direction: cards out as TSV Anki will read back. */
export function toTsv(cards: DraftCard[]): string {
  const header = '#separator:tab\n#html:true\n';
  const body = cards
    .map((c) => {
      const row = [escapeField(c.question), escapeField(c.answer)];
      if (c.tags && c.tags.length) row.push(escapeField(c.tags.join(' ')));
      return row.join('\t');
    })
    .join('\n');
  return header + body + (body ? '\n' : '');
}
