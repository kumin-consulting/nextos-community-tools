#!/usr/bin/env node
// preview/serve.mjs
//
// A static server for the preview harness, and nothing else: it copies
// React's UMD builds out of this repository's node_modules into
// preview/vendor/ (so the page needs no network at all) and serves the
// app folder, with preview/index.html as the entry.
//
//   node tools/chess/app/preview/serve.mjs [port]
//   open http://localhost:4173/preview/index.html
//
// Query parameters the page understands:
//   ?theme=dark|light      which theme to render in
//   ?scenario=<name>       play, analysis, games, puzzles, fresh
//
// This exists so the app can be looked at - and screenshotted - in a
// real browser without installing it into NextOS.

import { createServer } from 'node:http';
import { readFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const APP_DIR = normalize(join(HERE, '..'));
const REPO_ROOT = normalize(join(HERE, '..', '..', '..', '..'));
const VENDOR = join(HERE, 'vendor');
const PORT = Number(process.argv[2] ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

async function vendorReact() {
  await mkdir(VENDOR, { recursive: true });
  const wanted = [
    ['react', 'umd/react.production.min.js', 'react.production.min.js'],
    ['react-dom', 'umd/react-dom.production.min.js', 'react-dom.production.min.js'],
  ];
  for (const [pkg, from, to] of wanted) {
    const source = join(REPO_ROOT, 'node_modules', pkg, from);
    if (!existsSync(source)) {
      console.error(`Missing ${source} - run npm install in the repository root first.`);
      process.exit(1);
    }
    await copyFile(source, join(VENDOR, to));
  }
  console.log('Copied React and ReactDOM UMD builds into preview/vendor/.');
}

await vendorReact();

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://localhost:${PORT}`);
    let path = decodeURIComponent(url.pathname);
    if (path === '/' || path === '') path = '/preview/index.html';
    // No climbing out of the app folder.
    const target = normalize(join(APP_DIR, path));
    if (!target.startsWith(APP_DIR)) {
      response.writeHead(403).end('No.');
      return;
    }
    const info = await stat(target).catch(() => null);
    if (!info || !info.isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain' }).end(`Not found: ${path}`);
      return;
    }
    const body = await readFile(target);
    response.writeHead(200, {
      'content-type': TYPES[extname(target)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain' }).end(String(error));
  }
});

server.listen(PORT, () => {
  console.log(`Preview at http://localhost:${PORT}/preview/index.html`);
  console.log('  ?theme=dark  ?scenario=play|analysis|games|puzzles|fresh');
});
