// preview/serve.mjs - the preview harness's static server.
//
//   node preview/serve.mjs [port]
//
// Serves tools/recall/app/ so preview/index.html can import the built
// ../files/build/app.js, and copies React's UMD builds out of the
// repository's node_modules into preview/vendor/ on the way (they are
// not ours to commit - see .gitignore). Nothing else: no bundler, no
// watcher, no dependencies.
import { createServer } from 'node:http';
import { readFile, mkdir, copyFile, access } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const APP_DIR = new URL('..', import.meta.url).pathname;
const REPO_ROOT = new URL('../../../../', import.meta.url).pathname;
const PORT = Number(process.argv[2] ?? 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

async function stageVendor() {
  const vendor = join(APP_DIR, 'preview', 'vendor');
  await mkdir(vendor, { recursive: true });
  const wanted = [
    ['react/umd/react.production.min.js', 'react.production.min.js'],
    ['react-dom/umd/react-dom.production.min.js', 'react-dom.production.min.js'],
  ];
  for (const [from, to] of wanted) {
    const source = join(REPO_ROOT, 'node_modules', from);
    try {
      await access(source);
    } catch {
      console.error(`Missing ${source} - run npm install in the repository root first.`);
      process.exit(1);
    }
    await copyFile(source, join(vendor, to));
  }
}

await stageVendor();

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${PORT}`);
  let path = decodeURIComponent(url.pathname);
  // index.html lives in preview/ and loads ./vendor and ./stub-sdk.js
  // relative to itself, so the browser has to be there too.
  if (path === '/' || path === '') {
    response.writeHead(302, { location: `/preview/${url.search}` }).end();
    return;
  }
  if (path === '/preview' || path === '/preview/') path = '/preview/index.html';
  const full = join(APP_DIR, normalize(path).replace(/^(\.\.[/\\])+/, ''));
  if (!full.startsWith(APP_DIR)) {
    response.writeHead(403).end('No');
    return;
  }
  try {
    const body = await readFile(full);
    response.writeHead(200, {
      'content-type': TYPES[extname(full)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' }).end(`Not found: ${path}`);
  }
}).listen(PORT, () => {
  console.log(`Recall preview: http://localhost:${PORT}/  (?theme=dark, ?seed=empty for the empty state)`);
});
