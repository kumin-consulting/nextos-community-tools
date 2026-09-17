// src/lib/markdown.ts
//
// The deck format. A deck is a Markdown file a person can open in any
// editor, so the parser is forgiving and the serialiser is careful:
// round-tripping a canonically formatted file gives back the same bytes,
// including its line endings and whether it ended with a newline.
//
//     # Capitals
//
//     The ones I keep forgetting.
//
//     Q: What is the capital of Australia? #geo
//     A: Canberra
//
//     C: The {{c1::mitochondrion}} is the powerhouse of the {{c2::cell}}.
//
// Rules the parser follows, in order:
//
//   - Everything before the first card is the deck's head: an optional
//     `# Title` line and then the description.
//   - `Q:` opens a card; its question runs until `A:`; the answer runs
//     until the next card or the end of the file, with trailing blank
//     lines trimmed (so blank lines INSIDE an answer survive).
//   - `C:` opens a cloze card, and so does any line that contains a
//     `{{c1::...}}` deletion - the `C:` is there for the author who
//     wants the file to read consistently, not because the parser needs
//     it.
//   - `#tag` at the end of the question line, or a `tags:` line of its
//     own, tags the card. Which one the author used is remembered.
//   - Fenced code blocks are opaque: a ``` block containing `Q:` is
//     answer text, not a new card.
//
// Scheduling never appears here - it lives in `<deck>.recall.json`,
// keyed by `stableId` of the card's question text, so editing a deck in
// another editor keeps every unchanged card's history.

import type { BasicNote, Card, ClozeNote, DeckProblem, DraftCard, Note, ParsedDeck } from './types';

export const CLOZE_RE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;
const CLOZE_TEST = /\{\{c\d+::/;
const FENCE_RE = /^ {0,3}(```+|~~~+)/;
const TITLE_RE = /^#\s+(.*)$/;
const TAGS_LINE_RE = /^tags:\s*(.*)$/i;
const INLINE_TAG_RE = /\s+#([A-Za-z0-9][\w./-]*)\s*$/;

/* --------------------------------------------------------------- ids */

/** A 64-bit-ish hash as 16 hex characters: FNV-1a and a djb2 variant
 *  side by side, so two different questions colliding in both at once is
 *  not something a deck will ever run into. Deliberately NOT a
 *  cryptographic hash - this is an identity key, and it has to be
 *  computable in a loop over thousands of cards without blocking a
 *  frame. Normalises CRLF and trims, so re-saving a file with different
 *  line endings does not orphan every card's history. */
export function stableId(text: string): string {
  const s = text.replace(/\r\n/g, '\n').trim();
  let a = 0x811c9dc5;
  let b = 5381;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = ((b << 5) + b + c) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/* ------------------------------------------------------------- parse */

function splitInlineTags(line: string): { text: string; tags: string[] } {
  let text = line;
  const tags: string[] = [];
  for (;;) {
    const m = INLINE_TAG_RE.exec(text);
    if (!m) break;
    tags.unshift(m[1]);
    text = text.slice(0, m.index);
  }
  return { text, tags };
}

export function parseTagList(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean);
}

function dropMarker(line: string): string {
  const rest = line.slice(2);
  return rest.startsWith(' ') ? rest.slice(1) : rest;
}

function trimTrailingBlanks(lines: string[]): string[] {
  const out = lines.slice();
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  return out;
}

function trimBlankEdges(lines: string[]): string[] {
  const out = trimTrailingBlanks(lines);
  while (out.length && out[0].trim() === '') out.shift();
  return out;
}

/** Which lines sit inside a fenced code block (the fence lines
 *  themselves count as inside, so a ``` line is never a card marker). */
function fenceMask(lines: string[]): boolean[] {
  const mask: boolean[] = [];
  let fence: string | null = null;
  for (const line of lines) {
    const m = FENCE_RE.exec(line);
    if (fence === null) {
      if (m) {
        fence = m[1];
        mask.push(true);
      } else mask.push(false);
    } else {
      mask.push(true);
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
    }
  }
  return mask;
}

export function parseDeck(text: string): ParsedDeck {
  const eol: '\n' | '\r\n' = /\r\n/.test(text) ? '\r\n' : '\n';
  const trailingNewline = text.length > 0 && /\n$/.test(text);
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (trailingNewline) lines.pop();
  const fenced = fenceMask(lines);
  const problems: DeckProblem[] = [];

  const isQ = (i: number): boolean => !fenced[i] && lines[i].startsWith('Q:');
  const isA = (i: number): boolean => !fenced[i] && lines[i].startsWith('A:');
  const isC = (i: number): boolean => !fenced[i] && lines[i].startsWith('C:');
  const isImplicitCloze = (i: number): boolean => !fenced[i] && CLOZE_TEST.test(lines[i]);
  const isCardStart = (i: number): boolean => isQ(i) || isC(i) || isImplicitCloze(i);

  let i = 0;
  const head: string[] = [];
  while (i < lines.length && !isCardStart(i)) head.push(lines[i++]);

  let title = '';
  let headRest = head;
  const titleMatch = head.length ? TITLE_RE.exec(head[0]) : null;
  if (titleMatch) {
    title = titleMatch[1].trim();
    headRest = head.slice(1);
  }
  const description = trimBlankEdges(headRest).join('\n');

  const notes: Note[] = [];
  while (i < lines.length) {
    if (lines[i].trim() === '') {
      i++;
      continue;
    }
    const start = i;
    if (isQ(i)) {
      const firstLine = dropMarker(lines[i++]);
      const inline = splitInlineTags(firstLine);
      let tags = inline.tags;
      let tagStyle: 'inline' | 'line' = 'inline';
      const question: string[] = [inline.text];
      while (i < lines.length && !isA(i) && !isCardStart(i)) {
        const tagLine = !fenced[i] ? TAGS_LINE_RE.exec(lines[i]) : null;
        if (tagLine) {
          tags = tags.concat(parseTagList(tagLine[1]));
          tagStyle = 'line';
          i++;
          continue;
        }
        question.push(lines[i++]);
      }
      const answer: string[] = [];
      if (isA(i)) {
        answer.push(dropMarker(lines[i++]));
        while (i < lines.length && !isCardStart(i)) answer.push(lines[i++]);
      } else {
        problems.push({ line: start + 1, message: 'A question with no "A:" answer - it will not be reviewed until you add one.' });
      }
      const note: BasicNote = {
        kind: 'basic',
        question: trimTrailingBlanks(question).join('\n'),
        answer: trimTrailingBlanks(answer).join('\n'),
        tags: dedupe(tags),
        tagStyle,
      };
      notes.push(note);
      continue;
    }

    // Cloze: either "C: ..." or a bare line carrying a deletion.
    const explicit = isC(i);
    const firstLine = explicit ? dropMarker(lines[i]) : lines[i];
    i++;
    const inline = splitInlineTags(firstLine);
    let tags = inline.tags;
    let tagStyle: 'inline' | 'line' = 'inline';
    const body: string[] = [inline.text];
    while (i < lines.length && !isCardStart(i) && lines[i].trim() !== '') {
      const tagLine = !fenced[i] ? TAGS_LINE_RE.exec(lines[i]) : null;
      if (tagLine) {
        tags = tags.concat(parseTagList(tagLine[1]));
        tagStyle = 'line';
        i++;
        continue;
      }
      body.push(lines[i++]);
    }
    const note: ClozeNote = {
      kind: 'cloze',
      text: trimTrailingBlanks(body).join('\n'),
      tags: dedupe(tags),
      tagStyle,
      explicit,
    };
    if (!CLOZE_TEST.test(note.text)) {
      problems.push({ line: start + 1, message: 'A "C:" card with no {{c1::deletion}} in it - nothing to hide.' });
    }
    notes.push(note);
  }

  return { title, description, notes, eol, trailingNewline, problems };
}

function dedupe(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/* --------------------------------------------------------- serialise */

function withMarker(marker: string, text: string): string[] {
  const lines = text.split('\n');
  const first = lines[0] === '' ? marker : `${marker} ${lines[0]}`;
  return [first, ...lines.slice(1)];
}

export function serialiseDeck(deck: ParsedDeck): string {
  const out: string[] = [];
  if (deck.title) out.push(`# ${deck.title}`);
  if (deck.description) {
    if (out.length) out.push('');
    out.push(...deck.description.split('\n'));
  }
  for (const note of deck.notes) {
    if (out.length) out.push('');
    const inlineTags = note.tagStyle === 'inline' && note.tags.length ? ` ${note.tags.map((t) => `#${t}`).join(' ')}` : '';
    if (note.kind === 'basic') {
      const q = withMarker('Q:', note.question);
      q[0] += inlineTags;
      out.push(...q);
      if (note.tagStyle === 'line' && note.tags.length) out.push(`tags: ${note.tags.join(', ')}`);
      out.push(...withMarker('A:', note.answer));
    } else {
      const body = note.explicit ? withMarker('C:', note.text) : note.text.split('\n');
      body[0] += inlineTags;
      out.push(...body);
      if (note.tagStyle === 'line' && note.tags.length) out.push(`tags: ${note.tags.join(', ')}`);
    }
  }
  const text = out.join(deck.eol);
  return deck.trailingNewline || text === '' ? text + deck.eol : text;
}

/* ------------------------------------------------------------- cards */

/** Every distinct `c<N>` number in a cloze text, in numeric order. */
export function clozeNumbers(text: string): number[] {
  const seen = new Set<number>();
  CLOZE_RE.lastIndex = 0;
  for (;;) {
    const m = CLOZE_RE.exec(text);
    if (!m) break;
    seen.add(Number(m[1]));
  }
  return Array.from(seen).sort((a, b) => a - b);
}

function replaceClozes(text: string, ordinal: number, target: (answer: string, hint?: string) => string): string {
  CLOZE_RE.lastIndex = 0;
  return text.replace(CLOZE_RE, (_all, n: string, answer: string, hint?: string) =>
    Number(n) === ordinal ? target(answer, hint) : answer
  );
}

/** The question side of a cloze card: the target deletion becomes
 *  `[...]` (or `[hint]` when the author wrote one), every other deletion
 *  reads normally. */
export function clozeFront(text: string, ordinal: number): string {
  return replaceClozes(text, ordinal, (_answer, hint) => (hint ? `[${hint}]` : '[...]'));
}

/** The answer side: everything reads normally. */
export function clozeBack(text: string, ordinal: number): string {
  return replaceClozes(text, ordinal, (answer) => answer);
}

/** Just the hidden text, for typing practice and the card browser. */
export function clozeAnswer(text: string, ordinal: number): string {
  const parts: string[] = [];
  CLOZE_RE.lastIndex = 0;
  for (;;) {
    const m = CLOZE_RE.exec(text);
    if (!m) break;
    if (Number(m[1]) === ordinal) parts.push(m[2]);
  }
  return parts.join(', ');
}

/** Turns a parsed deck into the cards that are actually reviewed: one
 *  per basic note, one per cloze number. Ids are unique within a deck -
 *  two notes with the same question get suffixed rather than sharing a
 *  schedule. */
export function expandCards(deck: ParsedDeck): Card[] {
  const cards: Card[] = [];
  const used = new Map<string, number>();
  const unique = (base: string): string => {
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    return seen === 0 ? base : stableId(`${base}#${seen}`);
  };
  deck.notes.forEach((note, noteIndex) => {
    if (note.kind === 'basic') {
      cards.push({
        id: unique(stableId(note.question)),
        noteIndex,
        kind: 'basic',
        front: note.question,
        back: note.answer,
        answerText: note.answer,
        tags: note.tags,
      });
      return;
    }
    for (const ordinal of clozeNumbers(note.text)) {
      cards.push({
        id: unique(stableId(`${note.text} c${ordinal}`)),
        noteIndex,
        kind: 'cloze',
        front: clozeFront(note.text, ordinal),
        back: clozeBack(note.text, ordinal),
        answerText: clozeAnswer(note.text, ordinal),
        tags: note.tags,
        ordinal,
      });
    }
  });
  return cards;
}

/* ------------------------------------------------------------- build */

export function emptyDeck(title: string, description = ''): ParsedDeck {
  return { title, description, notes: [], eol: '\n', trailingNewline: true, problems: [] };
}

export function basicNote(question: string, answer: string, tags: string[] = []): BasicNote {
  return { kind: 'basic', question, answer, tags: dedupe(tags), tagStyle: 'inline' };
}

export function clozeNote(text: string, tags: string[] = []): ClozeNote {
  return { kind: 'cloze', text, tags: dedupe(tags), tagStyle: 'inline', explicit: true };
}

/** What the agent tools and the importers hand over: a draft becomes a
 *  cloze note when its question already carries deletions and it has no
 *  separate answer, and a basic note otherwise. */
export function noteFromDraft(draft: DraftCard): Note {
  const question = draft.question.trim();
  const answer = (draft.answer ?? '').trim();
  if (!answer && CLOZE_TEST.test(question)) return clozeNote(question, draft.tags ?? []);
  return basicNote(question, answer, draft.tags ?? []);
}

/** Adds notes to a deck, skipping ones whose card ids the deck already
 *  has, and reports which were skipped. */
export function addNotes(deck: ParsedDeck, notes: Note[]): { deck: ParsedDeck; added: Note[]; duplicates: Note[] } {
  const existing = new Set(expandCards(deck).map((c) => c.id));
  const added: Note[] = [];
  const duplicates: Note[] = [];
  for (const note of notes) {
    const probe = expandCards({ ...deck, notes: [note] });
    if (probe.length && probe.every((c) => existing.has(c.id))) {
      duplicates.push(note);
      continue;
    }
    for (const c of probe) existing.add(c.id);
    added.push(note);
  }
  return { deck: { ...deck, notes: deck.notes.concat(added) }, added, duplicates };
}

/** The identity text a note's first card hashes to - used when an edit
 *  has to carry a card's schedule across to its new id. */
export function noteIdentity(note: Note): string {
  return note.kind === 'basic' ? note.question : `${note.text} c${clozeNumbers(note.text)[0] ?? 1}`;
}
