import http from 'node:http';
import {readFile, mkdir, writeFile, readdir, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const runtime = process.env.ONE_PIECE_BROWSER_RUNTIME || 'H:/PTI-OnePiece/pilot/browser-native';
const root = path.resolve(here, '../../../../../');
const evidence = path.join(runtime, 'evidence');
await mkdir(evidence, {recursive: true});
let evidenceBytes = 0;
for (const name of await readdir(evidence)) if (/^browser-.*\.json$/.test(name)) evidenceBytes += (await stat(path.join(evidence, name))).size;
const allowedHosts = new Set(['127.0.0.1:8792', 'localhost:8792']);
const allowedOrigins = new Set(['http://127.0.0.1:8792', 'http://localhost:8792']);
const catalog = JSON.parse(await readFile(path.join(root, 'docs/one-piece/evidence/sources/catalog.json'), 'utf8'));
const samples = catalog.episodes.filter(e => [1, 1001].includes(e.episodeNumber));
const mime = {'.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.woff2': 'font/woff2'};
const staticRoutes = new Map([
  ['/', path.join(here, 'index.html')], ['/app.mjs', path.join(here, 'app.mjs')], ['/media-probe.mjs', path.join(here, 'media-probe.mjs')],
  ['/vendor/jassub.js', path.join(runtime, 'bundle/jassub.js')], ['/vendor/jassub-worker.js', path.join(runtime, 'bundle/jassub-worker.js')],
  ['/vendor/default.woff2', path.join(runtime, 'node_modules/jassub/dist/default.woff2')],
  ['/vendor/jassub-worker.wasm', path.join(runtime, 'node_modules/jassub/dist/wasm/jassub-worker.wasm')],
  ['/vendor/jassub-worker-modern.wasm', path.join(runtime, 'node_modules/jassub/dist/wasm/jassub-worker-modern.wasm')],
]);
for (const suffix of ['mjs', 'wasm.mjs', 'wasm.wasm']) {
  const name = `libav-6.10.9.0-webcodecs.${suffix}`;
  staticRoutes.set(`/vendor/${name}`, path.join(runtime, 'node_modules/@libav.js/variant-webcodecs/dist', name));
}
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // No COEP: native <video> baseline must not inherit a cross-origin embed restriction.
  // JASSUB automatically uses its single-thread fallback without SharedArrayBuffer.
  try {
    if (!allowedHosts.has(req.headers.host)) {res.writeHead(403); return res.end('Host rejected');}
    const url = new URL(req.url, 'http://127.0.0.1:8792');
    if (req.method === 'GET' && url.pathname === '/samples') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(samples));
    }
    if (req.method === 'POST' && url.pathname === '/evidence') {
      if (!allowedOrigins.has(req.headers.origin) || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {res.writeHead(403); return res.end('Origin or content type rejected');}
      if (Number(req.headers['content-length']) > 512000) {res.writeHead(413); return res.end();}
      let body = '';
      let received = 0;
      for await (const chunk of req) {
        received += chunk.length;
        if (received > 512000) {res.writeHead(413); return res.end();}
        body += chunk;
      }
      const data = JSON.parse(body);
      const content = JSON.stringify(data, null, 2);
      const bytes = Buffer.byteLength(content);
      if (evidenceBytes + bytes > 20 * 1024 * 1024) {res.writeHead(507); return res.end('Pilot evidence limit reached');}
      evidenceBytes += bytes;
      try {await writeFile(path.join(evidence, `browser-${Date.now()}-${Math.random().toString(16).slice(2)}.json`), content, {flag: 'wx'});}
      catch (error) {evidenceBytes -= bytes; throw error;}
      return res.end('saved');
    }
    const file = staticRoutes.get(url.pathname);
    if (!file || req.method !== 'GET') {res.writeHead(404); return res.end();}
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch (error) {res.writeHead(500); res.end(error.message);}
});
server.listen(8792, '127.0.0.1', () => console.log('Technical pilot only: http://127.0.0.1:8792/'));
