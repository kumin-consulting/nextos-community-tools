// src/lib/naming.ts
//
// Turning a game into a file name, and reading a file's tags back
// without parsing it. Pure, and separate from src/files.ts so it can be
// tested without a filesystem: a path built from a player called
// "../../etc" is a security bug, not a formatting one, and it deserves
// a test of its own.

/** A safe single path segment: no slashes, no dots at either end,
 *  nothing that could climb out of the games folder. */
export function safeSegment(text: string, fallback: string): string {
  const cleaned = text
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.\-]+|[.\-]+$/g, '')
    .slice(0, 40)
    .replace(/[.\-]+$/g, '');
  return cleaned || fallback;
}

/** '2026.09.17' - the PGN Date tag's format. */
export function todayTag(date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

/** The file name a finished game is saved under. */
export function gameFileName(tags: Record<string, string>, now = new Date()): string {
  const date = (tags.Date || todayTag(now)).replace(/\./g, '-').replace(/\?/g, 'x');
  return `${safeSegment(date, todayTag(now).replace(/\./g, '-'))}-${safeSegment(tags.White || 'White', 'white')}-${safeSegment(
    tags.Black || 'Black',
    'black'
  )}.pgn`;
}

const TAG_RE = /\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]/g;

/** The tag pairs at the top of a PGN, without parsing the moves - a
 *  games list of two hundred files should not replay two hundred
 *  games. */
export function readTags(text: string): Record<string, string> {
  const head = text.slice(0, 2000);
  const tags: Record<string, string> = {};
  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(head)) !== null) {
    tags[match[1]] = match[2].replace(/\\(["\\])/g, '$1');
  }
  return tags;
}
