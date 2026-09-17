// A 40-line static server so the app can be opened in a real browser
// without NextOS. It copies React's UMD builds out of the repository's
// node_modules into preview/vendor (git-ignored - never committed) and
// serves three trees: this folder, the app's built files, and vendor.
//
//   node tools/sketch/app/preview/serve.mjs [port]
//
// Then open http://localhost:4173 (add ?theme=dark for the dark board).
import { createServer } from 'node:http';
import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

const here = new URL('.', import.meta.url).pathname;
const appDir = resolve(here, '..');
const repoRoot = resolve(appDir, '../../..');
const port = Number(process.argv[2] ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

async function vendor() {
  const dir = join(here, 'vendor');
  await mkdir(dir, { recursive: true });
  const wanted = [
    ['react/umd/react.production.min.js', 'react.production.min.js'],
    ['react-dom/umd/react-dom.production.min.js', 'react-dom.production.min.js'],
  ];
  for (const [from, to] of wanted) {
    const source = join(repoRoot, 'node_modules', from);
    if (!existsSync(source)) throw new Error(`Missing ${source} - run npm install in ${repoRoot} first.`);
    await copyFile(source, join(dir, to));
  }
}

function fileFor(pathname) {
  if (pathname === '/' || pathname === '/index.html') return join(here, 'index.html');
  if (pathname.startsWith('/files/')) return join(appDir, 'files', pathname.slice('/files/'.length));
  if (pathname.startsWith('/vendor/')) return join(here, 'vendor', pathname.slice('/vendor/'.length));
  return join(here, pathname.replace(/^\/+/, ''));
}

await vendor();
createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  const file = fileFor(pathname);
  if (!file.startsWith(appDir)) {
    res.writeHead(403).end('no');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end(`Not found: ${pathname}`);
  }
}).listen(port, () => console.log(`Sketch preview on http://localhost:${port}`));
