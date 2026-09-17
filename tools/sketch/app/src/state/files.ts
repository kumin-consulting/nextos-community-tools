// Everything that touches the VFS. A board is one JSON file in
// <home>/Sketches; this module is the only place that knows that, so the
// rest of the app deals in documents and names, and the agent tools and
// the UI share exactly one implementation of "save this board".

import sdk from '@kumin/sdk';
import {
  type ParseResult,
  type SketchDocument,
  FILE_EXTENSION,
  FOLDER_NAME,
  fileNameFor,
  isSketchFile,
  nameFromFileName,
  parseDocument,
  serializeDocument,
  uniqueName,
} from '../lib/document';

interface VfsStat {
  path: string;
  name: string;
  kind: string;
  size: number;
  mtime: number;
}

interface VfsLike {
  readText(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<unknown>;
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
  readdir(path: string): Promise<VfsStat[]>;
  exists(path: string): Promise<boolean>;
  rm(path: string, opts?: { recursive?: boolean; force?: boolean }): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

const vfs = (): VfsLike => sdk.getVfs() as VfsLike;

/** `~/Apps/sketch` -> `~`. The OS hands an app its own directory; the
 *  person's home is its grandparent, and that is where their work lives. */
export function homeDir(): string {
  const dir = sdk.app.dir || '';
  const stripped = dir.replace(/\/Apps\/[^/]+\/?$/, '');
  return stripped || '/home/user';
}

export const sketchesDir = (): string => `${homeDir()}/${FOLDER_NAME}`;

export const pathFor = (name: string): string => `${sketchesDir()}/${fileNameFor(name)}`;

export interface DocumentFile {
  name: string;
  path: string;
  size: number;
  mtime: number;
}

export async function ensureFolder(): Promise<void> {
  await vfs().mkdir(sketchesDir(), { recursive: true });
}

export async function listDocuments(): Promise<DocumentFile[]> {
  try {
    const entries = await vfs().readdir(sketchesDir());
    return entries
      .filter((e) => e.kind !== 'dir' && isSketchFile(e.name))
      .map((e) => ({ name: nameFromFileName(e.name), path: e.path, size: e.size, mtime: e.mtime }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

export async function readDocumentFile(path: string): Promise<ParseResult> {
  const fallback = nameFromFileName(path.split('/').pop() ?? 'Untitled');
  try {
    const text = await vfs().readText(path);
    return parseDocument(text, fallback);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `This board could not be read (${message}).`, raw: '' };
  }
}

export async function writeDocumentFile(path: string, doc: SketchDocument): Promise<void> {
  await ensureFolder();
  await vfs().writeFile(path, serializeDocument({ ...doc, updatedAt: new Date().toISOString() }));
}

export async function deleteDocumentFile(path: string): Promise<void> {
  await vfs().rm(path, { force: true });
}

export async function renameDocumentFile(from: string, name: string): Promise<string> {
  const to = pathFor(name);
  if (to !== from) await vfs().rename(from, to);
  return to;
}

/** A name nothing else in the folder is using. `ignorePath` excludes one
 *  file from the check - the one being renamed, so changing a board's
 *  name to a different spelling of itself does not append a "2". */
export async function freeName(base: string, ignorePath?: string): Promise<string> {
  const existing = await listDocuments();
  return uniqueName(existing.filter((f) => f.path !== ignorePath).map((f) => f.name), base);
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    return await vfs().exists(path);
  } catch {
    return false;
  }
}

export { FILE_EXTENSION };
