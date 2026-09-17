// src/files.ts
//
// Where games live: `<home>/Chess/games/<date>-<white>-<black>.pgn`, one
// game per file, plain PGN that any other chess program can open. The
// game in progress is written to `<home>/Chess/current.pgn` after every
// move, so closing the window - or the browser - never loses it.
//
// Every function here tolerates a filesystem that is not there. A native
// app can be denied its permissions, and an app whose window goes blank
// because a readdir threw is a worse app than one that says "no games
// yet".

import sdk from '@kumin/sdk';

interface VfsStat {
  path: string;
  name: string;
  kind: 'file' | 'dir' | 'symlink';
  size: number;
  mtime?: number;
}

interface VfsLike {
  readText(path: string): Promise<string>;
  writeFile(path: string, data: string | Uint8Array, opts?: { parents?: boolean }): Promise<unknown>;
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<unknown>;
  readdir(path: string): Promise<VfsStat[]>;
  exists(path: string): Promise<boolean>;
  rm(path: string, opts?: { recursive?: boolean; force?: boolean }): Promise<unknown>;
  rename(from: string, to: string): Promise<unknown>;
}

function vfs(): VfsLike | null {
  try {
    return (sdk.getVfs() as VfsLike | null) ?? null;
  } catch {
    return null;
  }
}

/** The user's home: the app's own directory with '/Apps/<id>' taken off.
 *  There is no `sdk.home`, and hard-coding '/home/user' would be wrong
 *  the first time someone's home is somewhere else. */
export function homeDir(): string {
  const dir = sdk.app.dir || '';
  const marker = `/Apps/${sdk.app.id}`;
  if (dir.endsWith(marker)) return dir.slice(0, -marker.length);
  const index = dir.indexOf('/Apps/');
  if (index > 0) return dir.slice(0, index);
  return dir || '/home/user';
}

export function chessDir(): string {
  return `${homeDir()}/Chess`;
}
export function gamesDir(): string {
  return `${chessDir()}/games`;
}
export function currentGamePath(): string {
  return `${chessDir()}/current.pgn`;
}

/** Turns anything into a safe path segment: no slashes, no dots at the
 *  ends, nothing that could climb out of the games folder. */
export function safeSegment(text: string, fallback: string): string {
  const cleaned = text
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^[.\-]+|[.\-]+$/g, '')
    .slice(0, 40);
  return cleaned || fallback;
}

export interface GameFile {
  path: string;
  name: string;
  size: number;
  /** Read from the PGN's own tags rather than the file name. */
  white: string;
  black: string;
  date: string;
  result: string;
  event: string;
  opening: string;
}

const TAG_RE = /\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]/g;

/** Reads the tag pairs at the top of a PGN without parsing the moves -
 *  a games list of two hundred files should not replay two hundred
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

export async function ensureDirs(): Promise<boolean> {
  const fs = vfs();
  if (!fs) return false;
  try {
    await fs.mkdir(gamesDir(), { recursive: true });
    return true;
  } catch {
    return false;
  }
}

/** Every saved game, newest first. */
export async function listGames(): Promise<GameFile[]> {
  const fs = vfs();
  if (!fs) return [];
  try {
    if (!(await fs.exists(gamesDir()))) return [];
    const entries = await fs.readdir(gamesDir());
    const files: GameFile[] = [];
    for (const entry of entries) {
      if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.pgn')) continue;
      let tags: Record<string, string> = {};
      try {
        tags = readTags(await fs.readText(`${gamesDir()}/${entry.name}`));
      } catch {
        tags = {};
      }
      files.push({
        path: `${gamesDir()}/${entry.name}`,
        name: entry.name,
        size: entry.size ?? 0,
        white: tags.White || 'White',
        black: tags.Black || 'Black',
        date: tags.Date || '',
        result: tags.Result || '*',
        event: tags.Event || '',
        opening: tags.Opening || '',
      });
    }
    files.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
    return files;
  } catch {
    return [];
  }
}

export async function readGame(path: string): Promise<string | null> {
  const fs = vfs();
  if (!fs) return null;
  try {
    return await fs.readText(path);
  } catch {
    return null;
  }
}

/** Writes a game, returning the path it went to, or null. The name is
 *  built from the date and the two players and made unique with a
 *  counter rather than overwriting someone's earlier game. */
export async function saveGame(pgn: string, tags: Record<string, string>): Promise<string | null> {
  const fs = vfs();
  if (!fs) return null;
  if (!(await ensureDirs())) return null;
  const date = (tags.Date || todayTag()).replace(/\./g, '-').replace(/\?/g, 'x');
  const white = safeSegment(tags.White || 'White', 'white');
  const black = safeSegment(tags.Black || 'Black', 'black');
  const base = `${date}-${white}-${black}`;
  try {
    let path = `${gamesDir()}/${base}.pgn`;
    let counter = 2;
    while (await fs.exists(path)) {
      path = `${gamesDir()}/${base}-${counter}.pgn`;
      counter++;
      if (counter > 200) break;
    }
    await fs.writeFile(path, pgn, { parents: true });
    return path;
  } catch {
    return null;
  }
}

export async function deleteGame(path: string): Promise<boolean> {
  const fs = vfs();
  if (!fs) return false;
  try {
    await fs.rm(path, { force: true });
    return true;
  } catch {
    return false;
  }
}

/** The autosave. Called after every move, debounced by the caller. */
export async function writeCurrent(pgn: string): Promise<boolean> {
  const fs = vfs();
  if (!fs) return false;
  try {
    await fs.mkdir(chessDir(), { recursive: true });
    await fs.writeFile(currentGamePath(), pgn, { parents: true });
    return true;
  } catch {
    return false;
  }
}

export async function readCurrent(): Promise<string | null> {
  const fs = vfs();
  if (!fs) return null;
  try {
    if (!(await fs.exists(currentGamePath()))) return null;
    return await fs.readText(currentGamePath());
  } catch {
    return null;
  }
}

/** '2026.09.17' - the PGN Date tag's format. */
export function todayTag(date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

/** Copies text to the clipboard, saying whether it worked - a button
 *  that lies about having copied something is worse than no button. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** Reads this app's own compiled bundle, so the engine worker can run
 *  it. Returns null when there is no filesystem or no build - the
 *  engine then falls back to the main thread. */
export async function readOwnBundle(): Promise<string | null> {
  const fs = vfs();
  if (!fs) return null;
  const path = `${sdk.app.dir}/build/app.js`;
  try {
    if (!(await fs.exists(path))) return null;
    return await fs.readText(path);
  } catch {
    return null;
  }
}
