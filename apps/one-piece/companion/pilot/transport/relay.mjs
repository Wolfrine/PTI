// Feasibility-only loopback relay. Not an application backend or a LAN/TV endpoint.
import http from 'node:http';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createArchiveTransport, PTI_ORIGIN, RANGE_MAX_BYTES } from '../../src/sources/transport.mjs';
import { lookupEpisode } from '../../src/sources/archive.mjs';

const evidenceDir = fileURLToPath(new URL('../../../../../docs/one-piece/evidence/sources/', import.meta.url));
const catalog = JSON.parse(await readFile(`${evidenceDir}/catalog.json`, 'utf8'));
const transport = createArchiveTransport({ timeoutMs: 45000 });
const allowedOrigins = new Set(['http://127.0.0.1:8792', 'http://localhost:8792', PTI_ORIGIN]);
const budgetBytes = 128 * 1024 * 1024;
let reservedBytes = 0;
let servedBytes = 0;
await mkdir(evidenceDir, { recursive: true });
const log = data => appendFile(`${evidenceDir}/relay-requests.ndjson`, `${JSON.stringify({ at: new Date().toISOString(), ...data })}\n`);

const server = http.createServer(async (req, res) => {
  const requestAt = performance.now();
  const origin = req.headers.origin;
  if (req.headers.host !== '127.0.0.1:8793' && req.headers.host !== 'localhost:8793') { res.writeHead(403).end(); return; }
  if (origin && !allowedOrigins.has(origin)) { res.writeHead(403).end(); return; }
  const cors = origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Allow-Private-Network': 'true' } : {};
  const common = { ...cors, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (req.method === 'OPTIONS') { res.writeHead(204, common).end(); return; }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, common).end(); return; }
  const match = /^\/media\/(1|500|944|1000|1001|1044|1085)\/(original|derivative)$/.exec(req.url ?? '');
  if (!match) { res.writeHead(404, common).end(); return; }
  const episodeNumber = Number(match[1]);
  const candidate = lookupEpisode(catalog, episodeNumber).candidates.find(c => c.role === match[2]);
  if (!candidate) { res.writeHead(404, common).end(); return; }
  const mime = candidate.container === 'mkv' ? 'video/x-matroska' : 'video/mp4';
  if (req.method === 'HEAD') {
    // This is inventory metadata, not a current upstream availability probe.
    res.writeHead(200, { ...common, 'X-Pilot-Metadata-Only': 'true', 'Content-Type': mime, 'Content-Length': candidate.bytes, 'Accept-Ranges': 'bytes' }).end(); return;
  }
  let start = 0, end;
  if (req.headers.range) {
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
    if (!range) { res.writeHead(416, { ...common, 'Content-Range': `bytes */${candidate.bytes}` }).end(); return; }
    start = Number(range[1]);
    end = range[2] ? Number(range[2]) : Math.min(candidate.bytes - 1, start + RANGE_MAX_BYTES - 1);
  } else end = Math.min(candidate.bytes - 1, RANGE_MAX_BYTES - 1);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= candidate.bytes || end < start) {
    res.writeHead(416, { ...common, 'Content-Range': `bytes */${candidate.bytes}` }).end(); return;
  }
  end = Math.min(end, candidate.bytes - 1, start + RANGE_MAX_BYTES - 1);
  const length = end - start + 1;
  if (reservedBytes + length > budgetBytes) { res.writeHead(429, common).end('Pilot byte budget exhausted'); return; }
  reservedBytes += length; // Reserve before I/O, including concurrent requests and failures.
  const controller = new AbortController();
  const cancel = () => { if (!res.writableEnded) controller.abort(new Error('Relay client disconnected')); };
  res.on('close', cancel);
  try {
    const result = await transport.range(candidate.itemId, candidate.fileName, { start, length, expectedTotal: candidate.bytes, signal: controller.signal });
    if (result.status !== 206) {
      res.writeHead(502, common).end(`Archive HTTP ${result.status}`);
      await log({ episodeNumber, candidateRole: candidate.role, start, length, upstreamStatus: result.status, outcome: 'upstream-rejected' });
      return;
    }
    res.writeHead(206, { ...common, 'Content-Type': mime, 'Content-Length': result.bytesRead,
      'Content-Range': `bytes ${start}-${end}/${candidate.bytes}`, 'Accept-Ranges': 'bytes' });
    res.end(result.bytes);
    servedBytes += result.bytesRead;
    await log({ episodeNumber, candidateRole: candidate.role, start, length, upstreamStatus: result.status,
      servedBytes: result.bytesRead, totalServedBytes: servedBytes, reservedBytes, elapsedMs: Math.round(performance.now() - requestAt),
      upstreamElapsedMs: result.elapsedMs, outcome: 'served-bounded-range' });
  } catch (error) {
    if (!res.destroyed && !res.headersSent) res.writeHead(502, common).end('Bounded source request failed');
    await log({ episodeNumber, start, length, error: error.message, reservedBytes, outcome: 'failed-or-cancelled' });
  }
});
server.listen(8793, '127.0.0.1', () => console.log(JSON.stringify({ url: 'http://127.0.0.1:8793/media/1/original',
  budgetBytes, maxRangeBytes: RANGE_MAX_BYTES, notes: 'Pilot only; bounded range chunks; no LAN binding, auth, install or firewall changes' })));
const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
