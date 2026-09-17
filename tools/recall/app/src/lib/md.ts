// src/lib/md.ts
//
// The little Markdown a flash card needs, tokenised. Cards are written
// by hand in a text file, so the renderer has to cope with whatever a
// person typed - but a card is not a web page, so this deliberately
// stops well short of CommonMark: headings, paragraphs, fenced and
// indented code, bullet and numbered lists, block quotes, rules, and
// inline **bold**, *italic*, `code`, [links](...) and images.
//
// It produces TOKENS, never HTML: `ui/Markdown.tsx` turns them into
// React elements, so nothing a deck file contains can inject markup
// into the OS's document. That separation is the whole reason this file
// exists rather than a regex in a component.

export type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'rule' };

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'em'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string }
  | { kind: 'image'; text: string; href: string }
  /** A cloze deletion's gap: `[...]` or `[a hint]`. */
  | { kind: 'blank'; text: string };

const FENCE_RE = /^ {0,3}(```+|~~~+)\s*(\S*)\s*$/;
const HEADING_RE = /^ {0,3}(#{1,6})\s+(.*?)\s*#*$/;
const BULLET_RE = /^ {0,3}([-*+])\s+(.*)$/;
const ORDERED_RE = /^ {0,3}(\d{1,9})[.)]\s+(.*)$/;
const QUOTE_RE = /^ {0,3}>\s?(.*)$/;
const RULE_RE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  const paragraph: string[] = [];
  const flush = (): void => {
    if (!paragraph.length) return;
    blocks.push({ kind: 'paragraph', text: paragraph.join('\n') });
    paragraph.length = 0;
  };

  while (i < lines.length) {
    const line = lines[i];

    const fence = FENCE_RE.exec(line);
    if (fence) {
      flush();
      const marker = fence[1];
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        const close = FENCE_RE.exec(lines[i]);
        if (close && close[1][0] === marker[0] && close[1].length >= marker.length) {
          i++;
          break;
        }
        body.push(lines[i++]);
      }
      blocks.push({ kind: 'code', lang: fence[2] ?? '', text: body.join('\n') });
      continue;
    }

    if (!line.trim()) {
      flush();
      i++;
      continue;
    }

    if (RULE_RE.test(line)) {
      flush();
      blocks.push({ kind: 'rule' });
      i++;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }

    const quote = QUOTE_RE.exec(line);
    if (quote) {
      flush();
      const body: string[] = [quote[1]];
      i++;
      while (i < lines.length) {
        const more = QUOTE_RE.exec(lines[i]);
        if (!more) break;
        body.push(more[1]);
        i++;
      }
      blocks.push({ kind: 'quote', text: body.join('\n') });
      continue;
    }

    const bullet = BULLET_RE.exec(line);
    const ordered = ORDERED_RE.exec(line);
    if (bullet || ordered) {
      flush();
      const isOrdered = Boolean(ordered);
      const items: string[] = [];
      while (i < lines.length) {
        const b = isOrdered ? ORDERED_RE.exec(lines[i]) : BULLET_RE.exec(lines[i]);
        if (b) {
          items.push(b[2]);
          i++;
          continue;
        }
        // A continuation line: indented, and not the start of anything else.
        if (items.length && /^\s{2,}\S/.test(lines[i]) && !FENCE_RE.test(lines[i])) {
          items[items.length - 1] += '\n' + lines[i].trim();
          i++;
          continue;
        }
        break;
      }
      blocks.push({ kind: 'list', ordered: isOrdered, items });
      continue;
    }

    // An indented code block, but only where a paragraph is not open.
    if (/^ {4}\S/.test(line) && !paragraph.length) {
      flush();
      const body: string[] = [];
      while (i < lines.length && (/^ {4}/.test(lines[i]) || !lines[i].trim())) {
        if (!lines[i].trim() && !/^ {4}/.test(lines[i + 1] ?? '')) break;
        body.push(lines[i].slice(4));
        i++;
      }
      blocks.push({ kind: 'code', lang: '', text: body.join('\n') });
      continue;
    }

    paragraph.push(line);
    i++;
  }
  flush();
  return blocks;
}

const INLINE_RE = new RegExp(
  [
    '(`+)([\\s\\S]*?)\\1', // code
    '!\\[([^\\]]*)\\]\\(([^)\\s]+)\\)', // image
    '\\[([^\\]]*)\\]\\(([^)\\s]+)\\)', // link
    '\\*\\*([\\s\\S]+?)\\*\\*', // strong
    '__([\\s\\S]+?)__', // strong
    '(?<![\\w*])\\*([^*\\n]+?)\\*(?![\\w*])', // em
    '(?<![\\w_])_([^_\\n]+?)_(?![\\w_])', // em
    '\\[(\\.\\.\\.|[^\\]\\n]{1,40})\\]', // a cloze gap
  ].join('|'),
  'g'
);

/**
 * Splits one run of text into inline tokens. Everything is flat: a card
 * that writes `**bold with *italic* inside**` gets the bold, and the
 * asterisks inside it stay visible, which is a better failure than a
 * parser that silently eats them.
 */
export function parseInline(source: string, options: { blanks?: boolean } = {}): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  INLINE_RE.lastIndex = 0;
  for (;;) {
    const m = INLINE_RE.exec(source);
    if (!m) break;
    const [all, , codeText, imgAlt, imgHref, linkText, linkHref, strong1, strong2, em1, em2, blank] = m;
    let token: Inline | null = null;
    if (codeText !== undefined) token = { kind: 'code', text: codeText.trim() };
    else if (imgHref !== undefined) token = { kind: 'image', text: imgAlt || imgHref, href: imgHref };
    else if (linkHref !== undefined) token = { kind: 'link', text: linkText || linkHref, href: linkHref };
    else if (strong1 !== undefined || strong2 !== undefined) token = { kind: 'strong', text: (strong1 ?? strong2) as string };
    else if (em1 !== undefined || em2 !== undefined) token = { kind: 'em', text: (em1 ?? em2) as string };
    else if (blank !== undefined) token = options.blanks ? { kind: 'blank', text: blank } : null;

    if (!token) continue;
    if (m.index > last) out.push({ kind: 'text', text: source.slice(last, m.index) });
    out.push(token);
    last = m.index + all.length;
  }
  if (last < source.length) out.push({ kind: 'text', text: source.slice(last) });
  return out.filter((t) => t.kind !== 'text' || t.text !== '');
}

/** Everything a card says, with the formatting taken out - for the card
 *  browser's one-line preview and for search. */
export function plainText(source: string): string {
  return parseBlocks(source)
    .map((block) => {
      if (block.kind === 'code') return block.text;
      if (block.kind === 'rule') return '';
      if (block.kind === 'list') return block.items.map((i) => inlineText(i)).join(' · ');
      return inlineText(block.text);
    })
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inlineText(source: string): string {
  return parseInline(source, { blanks: true })
    .map((token) => token.text)
    .join('');
}
