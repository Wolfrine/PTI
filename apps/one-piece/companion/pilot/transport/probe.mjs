import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { lookupEpisode, sha256 } from '../../src/sources/archive.mjs';
import { createArchiveTransport, USER_AGENT } from '../../src/sources/transport.mjs';

const out = fileURLToPath(new URL('../../../../../docs/one-piece/evidence/sources/', import.meta.url));
const catalog = JSON.parse(await readFile(`${out}/catalog.json`, 'utf8'));
const transport = createArchiveTransport();
const episodes = [1, 500, 944, 1000, 1001, 1044, 1085];
const results = [];
for (const episodeNumber of episodes) {
  const candidate = lookupEpisode(catalog, episodeNumber).candidates.find(c => c.role === 'original');
  for (const position of ['start', 'middle', 'end']) {
    const length = 16384;
    const start = position === 'start' ? 0 : position === 'end' ? candidate.bytes - length : Math.floor(candidate.bytes / 2);
    try {
      const result = await transport.range(candidate.itemId, candidate.fileName, { start, length });
      const { bytes, ...evidence } = result;
      results.push({ episodeNumber, candidateId: candidate.id, checkedAt: new Date().toISOString(), position,
        ...evidence, sampleSha256: sha256(bytes),
        magicFirst16Hex: position === 'start' ? bytes.subarray(0, 16).toString('hex') : undefined,
        browserCors: result.headers['access-control-allow-origin'] === '*' || result.headers['access-control-allow-origin'] === result.request.origin });
      console.log(JSON.stringify({ episodeNumber, position, status: result.status, bytes: result.bytesRead, elapsedMs: result.elapsedMs,
        acao: result.headers['access-control-allow-origin'] }));
    } catch (error) {
      results.push({ episodeNumber, position, error: error.message, history: error.history ?? [], checkedAt: new Date().toISOString() });
      console.log(JSON.stringify({ episodeNumber, position, error: error.message }));
    }
  }
  try {
    const { bytes, ...evidence } = await transport.preflight(candidate.itemId, candidate.fileName);
    results.push({ episodeNumber, position: 'preflight-range', checkedAt: new Date().toISOString(), ...evidence });
  } catch (error) { results.push({ episodeNumber, position: 'preflight-range', error: error.message, history: error.history ?? [] }); }
}
await writeFile(`${out}/range-probes.json`, `${JSON.stringify({ completedAt: new Date().toISOString(),
  userAgent: USER_AGENT, command: 'node apps/one-piece/companion/pilot/transport/probe.mjs',
  maxParallelUpstreams: 2, bytesPerRange: 16384, totalMediaBytesRead: results.reduce((n, r) => n + (r.bytesRead ?? 0), 0),
  meaning: 'Bounded HTTP transport and CORS headers only. 206 responses do not establish player seeking, language, buffering, subtitle or Cast correctness.', results }, null, 2)}\n`);
