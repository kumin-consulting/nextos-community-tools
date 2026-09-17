// scripts/lib/reproducibleZip.mjs
//
// A dependency-free, reproducible ZIP writer - copied verbatim in
// APPROACH from scripts/build-extension-zip.mjs (see that file's header
// for the full reasoning), factored out into its own module rather than
// duplicated inline because scripts/build-catalog.mjs needs to build
// several small zips (one per catalogue entry), not just one. Not used
// by build-extension-zip.mjs itself - that script is unrelated to the
// App Store and this workstream has no reason to touch it.
//
// Entries are STORED (uncompressed, method 0) with a fixed DOS date/time
// and a sorted file list, so building the same input twice produces
// byte-identical output - which is what keeps a catalogue entry's
// embedded sha256 stable across repeated `predev`/`prebuild` runs without
// needing to commit the zip itself (public/catalog/ is gitignored - see
// .gitignore's comment).

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Fixed DOS date/time (2026-01-01 00:00:00) - see build-extension-zip.mjs.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Recursively lists every file under `dir`, sorted, as zip entry names
 *  (forward slashes, relative to `dir`) paired with their bytes. */
export function listFilesForZip(dir) {
  const out = [];
  function walk(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(full);
    }
  }
  walk(dir);
  return out
    .sort()
    .map((full) => ({ name: relative(dir, full).split(sep).join('/'), data: readFileSync(full) }));
}

/**
 * Builds a STORED-entries zip from `files` (an array of { name, data },
 * `data` a Buffer/Uint8Array). Returns the zip's bytes as a Buffer.
 */
export function buildZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const crc = crc32(bytes);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(bytes.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(bytes.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);

    locals.push(local, nameBuf, bytes);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + bytes.length;
  }

  const centralStart = offset;
  const centralBuf = Buffer.concat(centrals);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(centralStart, 16);

  return Buffer.concat([...locals, centralBuf, eocd]);
}
