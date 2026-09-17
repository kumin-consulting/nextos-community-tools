// src/lib/diff.ts
//
// Typing an answer only teaches you something if the app can show you
// exactly which part was wrong. This is a word-level longest-common-
// subsequence diff between what you typed and what the card says, with
// a comparison that forgives the things nobody is testing you on:
// capitals, punctuation, accents, doubled spaces, and a leading article.
//
// Pure, no DOM: the renderer walks `parts` and paints them.

/** One run of the comparison. `same` was right, `wrong` is what you
 *  typed and should not have, `missing` is what the card had and you
 *  did not write. */
export interface DiffPart {
  type: 'same' | 'wrong' | 'missing';
  text: string;
}

export interface DiffResult {
  correct: boolean;
  /** 0..1 - how much of the expected answer you got, by word count. */
  score: number;
  parts: DiffPart[];
}

const ARTICLE_RE = /^(?:the|a|an)\s+/i;

/** Lower case, accents folded, punctuation dropped, spaces collapsed -
 *  the form two answers are COMPARED in. Never shown to anyone. */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The same, with a leading "the"/"a"/"an" removed - used only for the
 *  whole-answer equality check, never per word. */
export function normaliseLoose(text: string): string {
  return normalise(text).replace(ARTICLE_RE, '');
}

function words(text: string): string[] {
  const out: string[] = [];
  const re = /\S+/g;
  for (;;) {
    const m = re.exec(text);
    if (!m) break;
    out.push(m[0]);
  }
  return out;
}

function push(parts: DiffPart[], type: DiffPart['type'], text: string): void {
  const last = parts[parts.length - 1];
  if (last && last.type === type) last.text += ' ' + text;
  else parts.push({ type, text });
}

/**
 * Compares a typed answer with the expected one. The diff is computed
 * over NORMALISED words but the parts carry the ORIGINAL ones, so the
 * highlight reads the way the person wrote it while "Pacific ocean."
 * still counts as "the Pacific Ocean".
 */
export function diffAnswer(typed: string, expected: string): DiffResult {
  const typedWords = words(typed);
  const expectedWords = words(expected);
  const a = typedWords.map(normalise).filter(Boolean);
  const b = expectedWords.map(normalise).filter(Boolean);
  // Keep the originals aligned with their normalised forms.
  const aOrig = typedWords.filter((w) => normalise(w));
  const bOrig = expectedWords.filter((w) => normalise(w));

  if (normaliseLoose(typed) === normaliseLoose(expected) && normaliseLoose(expected) !== '') {
    return { correct: true, score: 1, parts: [{ type: 'same', text: typed.trim() || expected.trim() }] };
  }

  // LCS table. Answers are short; a full table is the clearest code and
  // costs nothing at these sizes (capped so a pasted essay cannot hang
  // the review screen).
  const CAP = 400;
  if (a.length > CAP || b.length > CAP) {
    const correct = a.join(' ') === b.join(' ');
    return {
      correct,
      score: correct ? 1 : 0,
      parts: correct ? [{ type: 'same', text: typed }] : [{ type: 'wrong', text: typed }, { type: 'missing', text: expected }],
    };
  }

  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  let matched = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(parts, 'same', bOrig[j]);
      matched++;
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      push(parts, 'wrong', aOrig[i]);
      i++;
    } else {
      push(parts, 'missing', bOrig[j]);
      j++;
    }
  }
  while (i < a.length) push(parts, 'wrong', aOrig[i++]);
  while (j < b.length) push(parts, 'missing', bOrig[j++]);

  const score = b.length ? matched / b.length : a.length ? 0 : 1;
  return { correct: matched === b.length && matched === a.length, score, parts };
}

/** The grade a typed answer suggests: right on the nose is Good, a near
 *  miss is Hard, anything else is Again. The person can still overrule
 *  it - this only pre-selects a button. */
export function suggestedRating(result: DiffResult): 1 | 2 | 3 {
  if (result.correct) return 3;
  return result.score >= 0.75 ? 2 : 1;
}
