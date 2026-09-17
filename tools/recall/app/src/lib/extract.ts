// src/lib/extract.ts
//
// Notes in, cards out. Paste a page of revision notes and this turns it
// into a deck, using the shapes people already write in rather than
// asking them to learn a format:
//
//   Q: ... / A: ...        taken as written
//   Term: meaning          a definition line
//   - Term - meaning       a bullet with a dash, an en dash or an em dash
//   ## Heading + body      the heading asks, the body answers
//   X is Y.                a definition sentence becomes a cloze
//   anything {{c1::...}}   already a cloze, kept as one
//
// It is deliberately conservative: a line it cannot read confidently is
// left out rather than turned into a card nobody wants to see again at
// 7 am. Every card it does make is shown for review before anything is
// written to a deck, and `sdk.assistant.ask` can be asked for a second
// opinion on the same text (see tools.ts) - this module never calls it,
// so it stays pure and testable.

import type { DraftCard } from './types';

export interface ExtractOptions {
  /** Answers longer than this are cut at a sentence boundary. */
  maxAnswerChars?: number;
  /** Turn definition sentences into cloze cards (on by default). */
  cloze?: boolean;
  /** Tags put on every card the run produces. */
  tags?: string[];
}

export interface ExtractResult {
  /** The document's `# Title`, when it had one. */
  title: string;
  cards: DraftCard[];
  /** Lines the extractor deliberately ignored, for the preview's
   *  "n lines skipped" line. */
  skipped: number;
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*$/;
const BULLET_RE = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;
const FENCE_RE = /^ {0,3}(?:```|~~~)/;
const SEPARATOR_RE = /\s+(?:[-\u2013\u2014]|=>|->)\s+/;
const DEFINITION_LINE_RE = /^([^:{}]{2,60}?):\s+(.{2,})$/;
const DEFINITION_SENTENCE_RE = /^(.{2,60}?)\s+(is|are|was|were|means|meant|refers to|stands for)\s+(.{3,})\.$/i;
const CLOZE_TEST = /\{\{c\d+::/;
const INLINE_TAG_RE = /\s+#([A-Za-z0-9][\w./-]*)(?=\s|$)/g;
const STOP_TERMS = new Set(['note', 'notes', 'example', 'examples', 'warning', 'tip', 'see also', 'source', 'sources', 'todo', 'summary']);

interface Block {
  kind: 'heading' | 'text' | 'bullet' | 'code';
  text: string;
  level: number;
}

function stripInlineTags(line: string): { text: string; tags: string[] } {
  const tags: string[] = [];
  const text = line.replace(INLINE_TAG_RE, (_all, tag: string) => {
    tags.push(tag);
    return '';
  });
  return { text: text.trim(), tags };
}

/** Cuts a long answer at the end of a sentence rather than mid-word. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const window = text.slice(0, max);
  const stop = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '));
  if (stop > max * 0.4) return window.slice(0, stop + 1);
  const space = window.lastIndexOf(' ');
  return (space > 0 ? window.slice(0, space) : window).trimEnd() + '…';
}

function toBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let fence: string[] | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      if (fence) {
        fence.push(line);
        blocks.push({ kind: 'code', text: fence.join('\n'), level: 0 });
        fence = null;
      } else fence = [line];
      continue;
    }
    if (fence) {
      fence.push(line);
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', text: heading[2].trim(), level: heading[1].length });
      continue;
    }
    // Setext headings: a line underlined with === or ---.
    const next = lines[i + 1];
    if (line.trim() && next && /^(?:=+|-{3,})\s*$/.test(next)) {
      blocks.push({ kind: 'heading', text: line.trim(), level: next.trim()[0] === '=' ? 1 : 2 });
      i++;
      continue;
    }
    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      blocks.push({ kind: 'bullet', text: bullet[1].trim(), level: 0 });
      continue;
    }
    if (!line.trim()) continue;
    blocks.push({ kind: 'text', text: line.trim(), level: 0 });
  }
  if (fence) blocks.push({ kind: 'code', text: fence.join('\n'), level: 0 });
  return blocks;
}

function looksLikeTerm(term: string): boolean {
  const words = term.trim().split(/\s+/);
  if (words.length > 8 || !term.trim()) return false;
  if (STOP_TERMS.has(term.trim().toLowerCase())) return false;
  // "In 1492: Columbus sailed" is a sentence, not a term; a term does
  // not end in a comma or a conjunction.
  return !/[,;]$/.test(term.trim()) && !/^\s*(?:and|but|so|because|then)\b/i.test(term);
}

/** One line -> one card, when the line carries its own separator. */
function cardFromLine(line: string, options: Required<Pick<ExtractOptions, 'maxAnswerChars' | 'cloze'>>): DraftCard | null {
  const { text, tags } = stripInlineTags(line);
  if (!text) return null;
  if (CLOZE_TEST.test(text)) return { question: text, answer: '', tags };

  const dash = SEPARATOR_RE.exec(text);
  if (dash && dash.index > 0) {
    const term = text.slice(0, dash.index).trim();
    const meaning = text.slice(dash.index + dash[0].length).trim();
    if (looksLikeTerm(term) && meaning.length >= 2) {
      return { question: term, answer: clip(meaning, options.maxAnswerChars), tags };
    }
  }

  const colon = DEFINITION_LINE_RE.exec(text);
  if (colon && looksLikeTerm(colon[1]) && !/^https?$/i.test(colon[1])) {
    return { question: colon[1].trim(), answer: clip(colon[2].trim(), options.maxAnswerChars), tags };
  }

  const sentence = DEFINITION_SENTENCE_RE.exec(text);
  if (sentence && looksLikeTerm(sentence[1])) {
    const [, subject, verb, rest] = sentence;
    if (options.cloze) return { question: `${subject} ${verb} {{c1::${rest.trim()}}}.`, answer: '', tags };
    return { question: subject.trim(), answer: clip(`${verb} ${rest.trim()}`, options.maxAnswerChars), tags };
  }
  return null;
}

/**
 * The whole extractor. Walks the document once, keeping the heading it
 * is under so a heading whose body made no cards of its own can become
 * one itself.
 */
export function extractCards(text: string, options: ExtractOptions = {}): ExtractResult {
  const opts = { maxAnswerChars: options.maxAnswerChars ?? 320, cloze: options.cloze !== false };
  const extraTags = options.tags ?? [];
  const blocks = toBlocks(text);
  const cards: DraftCard[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let title = '';

  const add = (card: DraftCard | null): boolean => {
    if (!card) return false;
    const question = card.question.trim();
    if (!question) return false;
    const key = question.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    const tags = Array.from(new Set([...(card.tags ?? []), ...extraTags]));
    cards.push({ question, answer: card.answer.trim(), tags });
    return true;
  };

  let heading: string | null = null;
  let body: string[] = [];
  let bodyMadeCards = false;

  const flushHeading = (): void => {
    if (heading && !bodyMadeCards && body.length) {
      add({ question: heading, answer: clip(body.join('\n'), opts.maxAnswerChars), tags: [] });
    } else if (heading && !body.length) {
      skipped++;
    }
    heading = null;
    body = [];
    bodyMadeCards = false;
  };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (block.kind === 'heading') {
      flushHeading();
      if (!title && block.level === 1) {
        title = block.text;
        continue;
      }
      heading = block.text;
      continue;
    }

    if (block.kind === 'code') {
      body.push(block.text);
      continue;
    }

    // An explicit Q:/A: pair wins over everything else.
    const q = /^Q:\s*(.*)$/i.exec(block.text);
    if (q) {
      const answerParts: string[] = [];
      let j = i + 1;
      const a = j < blocks.length ? /^A:\s*(.*)$/i.exec(blocks[j].text) : null;
      if (a) {
        answerParts.push(a[1]);
        j++;
        while (j < blocks.length && blocks[j].kind !== 'heading' && !/^[QA]:/i.test(blocks[j].text)) {
          answerParts.push(blocks[j].text);
          j++;
        }
        const { text: question, tags } = stripInlineTags(q[1]);
        if (add({ question, answer: clip(answerParts.join('\n').trim(), opts.maxAnswerChars), tags })) bodyMadeCards = true;
        i = j - 1;
        continue;
      }
    }

    const card = cardFromLine(block.text, opts);
    if (card && add(card)) {
      bodyMadeCards = true;
      continue;
    }
    if (block.kind === 'bullet' || block.kind === 'text') {
      if (heading) body.push(block.kind === 'bullet' ? `- ${block.text}` : block.text);
      else skipped++;
    }
  }
  flushHeading();

  return { title, cards, skipped };
}

/** Merges cards an assistant drafted with the ones the rules found,
 *  keeping the rules' version when both produced the same question. */
export function mergeDrafts(base: DraftCard[], extra: DraftCard[]): DraftCard[] {
  const seen = new Set(base.map((c) => c.question.trim().toLowerCase()));
  const out = base.slice();
  for (const card of extra) {
    const key = card.question.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ question: card.question.trim(), answer: (card.answer ?? '').trim(), tags: card.tags ?? [] });
  }
  return out;
}

/**
 * Reads Q/A pairs out of an assistant's plain-text reply. Models answer
 * this question in one of three shapes however carefully you ask, so all
 * three are accepted: a JSON array, `Q:`/`A:` lines, and numbered
 * "question - answer" lines.
 */
export function parseAssistantCards(reply: string): DraftCard[] {
  const trimmed = reply.trim();
  const jsonStart = trimmed.indexOf('[');
  const jsonEnd = trimmed.lastIndexOf(']');
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    try {
      const parsed: unknown = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
      if (Array.isArray(parsed)) {
        const out: DraftCard[] = [];
        for (const item of parsed) {
          if (!item || typeof item !== 'object') continue;
          const row = item as Record<string, unknown>;
          const question = typeof row.question === 'string' ? row.question : typeof row.q === 'string' ? row.q : typeof row.front === 'string' ? row.front : '';
          const answer = typeof row.answer === 'string' ? row.answer : typeof row.a === 'string' ? row.a : typeof row.back === 'string' ? row.back : '';
          const tags = Array.isArray(row.tags) ? row.tags.filter((t): t is string => typeof t === 'string') : [];
          if (question.trim()) out.push({ question: question.trim(), answer: answer.trim(), tags });
        }
        if (out.length) return out;
      }
    } catch {
      // Not JSON after all - fall through to the line readers.
    }
  }
  const out: DraftCard[] = [];
  const lines = trimmed.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const q = /^\s*(?:\d+[.)]\s*)?Q(?:uestion)?\s*[:.]\s*(.+)$/i.exec(lines[i]);
    if (!q) continue;
    const answerLines: string[] = [];
    let j = i + 1;
    const a = j < lines.length ? /^\s*A(?:nswer)?\s*[:.]\s*(.*)$/i.exec(lines[j]) : null;
    if (!a) continue;
    answerLines.push(a[1]);
    j++;
    while (j < lines.length && lines[j].trim() && !/^\s*(?:\d+[.)]\s*)?Q(?:uestion)?\s*[:.]/i.test(lines[j])) {
      answerLines.push(lines[j].trim());
      j++;
    }
    out.push({ question: q[1].trim(), answer: answerLines.join('\n').trim(), tags: [] });
    i = j - 1;
  }
  if (out.length) return out;
  for (const line of lines) {
    const m = SEPARATOR_RE.exec(line);
    if (!m) continue;
    const question = line.slice(0, m.index).replace(/^\s*(?:\d+[.)]|[-*+])\s*/, '').trim();
    const answer = line.slice(m.index + m[0].length).trim();
    if (question && answer) out.push({ question, answer, tags: [] });
  }
  return out;
}
