import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ARCHIVE_ITEMS, canonicalEpisodeId, parseEpisodeFile, sanitizeMetadata, buildCatalog, nextEpisode, archiveFileUrl } from '../src/sources/archive.mjs';
import { createArchiveTransport, retryAfterMs } from '../src/sources/transport.mjs';

const first = n => `[HorribleSubs] One Piece (01-1000) [720p] (Batch)/[HorribleSubs] One Piece - ${String(n).padStart(2, '0')} [720p].mkv`;
const lateFirst = n => `[HorribleSubs] One Piece (01-1000) [720p] (Batch)/[SubsPlease] One Piece - ${n} (720p) [DCD82E5D].mkv`;
const second = n => `[Anime Time] One Piece - ${n} - Source Title.mkv`;
const inventory = (itemId, files) => sanitizeMetadata(itemId, { files }, '2026-10-18T00:00:00Z', 'test-hash');

test('parses release filenames, not parent batch numbers or unrelated assets', () => {
  assert.equal(parseEpisodeFile(ARCHIVE_ITEMS[0], first(1)).episodeNumber, 1);
  assert.equal(parseEpisodeFile(ARCHIVE_ITEMS[0], first(500)).episodeNumber, 500);
  assert.equal(parseEpisodeFile(ARCHIVE_ITEMS[0], '[SubsPlease] One Piece - 944 (720p) [B064FE69].mkv').episodeNumber, 944);
  assert.equal(parseEpisodeFile(ARCHIVE_ITEMS[0], '[SubsPlease] One Piece - 1000 (720p) [DCD82E5D].mkv').episodeNumber, 1000);
  assert.equal(parseEpisodeFile(ARCHIVE_ITEMS[1], second(1085)).episodeNumber, 1085);
  for (const name of ['random 500.mkv', first(1) + '.jpg', '[HorribleSubs] One Piece - 0000 [720p].mkv', first(1001), first(944), lateFirst(943)]) {
    assert.equal(parseEpisodeFile(ARCHIVE_ITEMS[0], name), null);
  }
  assert.equal(parseEpisodeFile(ARCHIVE_ITEMS[1], second(1086)), null);
});

test('deduplicates identities and derivatives without inventing languages or provenance', () => {
  const original = { name: second(1001), source: 'original', size: '800', sha1: 'real-file-sha', format: 'Matroska' };
  const catalog = buildCatalog([
    inventory(ARCHIVE_ITEMS[0], [{ name: first(589), source: 'original' }, { name: first(591), source: 'original' }, { name: lateFirst(1000), source: 'original' }]),
    inventory(ARCHIVE_ITEMS[1], [original, original, { name: second(1001).replace('.mkv', '.mp4'), source: 'derivative', original: second(1001) },
      { name: second(1001).replace('.mkv', '.srt'), source: 'original' }]),
  ]);
  assert.equal(catalog.summary.listedEpisodes, 4);
  const row = catalog.episodes[1000];
  assert.equal(row.id, 'one-piece-1001');
  assert.equal(row.candidates.length, 2);
  assert.equal(row.subtitleCandidates.length, 1);
  assert.equal(row.candidates[0].checksums.sha1, 'real-file-sha');
  assert.equal(row.candidates[0].tracks.verification, 'not-probed');
  assert.equal(row.titleProvenance, 'source-filename');
  assert.equal(nextEpisode(catalog, 589).availability, 'missing');
  assert.equal(nextEpisode(catalog, 1000).episodeNumber, 1001);
  assert.equal(nextEpisode(catalog, 1085).availability, 'outside-sources');
  assert.equal(catalog.endBoundary.episodeNumber, 1086);
});

test('rejects unknown items, unsafe filenames, restricted inventories and unparsed video', () => {
  assert.throws(() => archiveFileUrl('arbitrary-item', first(1)));
  for (const name of ['../private.mkv', '/absolute.mkv', 'foo\\bar.mkv', 'foo/../bar.mkv']) assert.throws(() => archiveFileUrl(ARCHIVE_ITEMS[0], name));
  assert.throws(() => buildCatalog([{ ...inventory(ARCHIVE_ITEMS[0], []), access: { isDark: true } }]));
  assert.throws(() => buildCatalog([inventory(ARCHIVE_ITEMS[0], [{ name: 'unknown.mkv' }])]));
  assert.throws(() => canonicalEpisodeId(1.1));
});

test('bounded transport does not consume range-ignoring full file', async () => {
  let reads = 0;
  const body = new ReadableStream({ pull(c) { reads++; c.enqueue(new Uint8Array(1024)); } });
  const client = createArchiveTransport({ fetchImpl: async () => new Response(body, { status: 200 }) });
  const result = await client.range(ARCHIVE_ITEMS[0], first(1), { length: 10 });
  assert.equal(result.bytesRead, 0);
  assert.ok(reads <= 1);
});

test('range must match, and redirect cannot escape Archive item allowlist', async () => {
  const badRange = createArchiveTransport({ fetchImpl: async () => new Response('123', { status: 206, headers: { 'content-range': 'bytes 0-2/100' } }) });
  await assert.rejects(badRange.range(ARCHIVE_ITEMS[0], first(1), { length: 10 }), /Content-Range/);
  const badRedirect = createArchiveTransport({ fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }) });
  await assert.rejects(badRedirect.range(ARCHIVE_ITEMS[0], first(1)), /Unsafe Archive redirect/);
  await assert.rejects(badRedirect.range(ARCHIVE_ITEMS[0], first(1), { length: 2 ** 30 }), /excessive byte range/);
});

test('429 honors bounded Retry-After and has a finite retry count', async () => {
  let calls = 0;
  const waits = [];
  const client = createArchiveTransport({ sleep: async ms => waits.push(ms), fetchImpl: async () => {
    calls++;
    return calls < 3 ? new Response(null, { status: 429, headers: { 'retry-after': '1' } })
      : new Response('123', { status: 206, headers: { 'content-range': 'bytes 0-2/100' } });
  } });
  const result = await client.range(ARCHIVE_ITEMS[0], first(1), { length: 3 });
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1000, 1000]);
  assert.equal(result.bytesRead, 3);
  assert.equal(retryAfterMs('Sun, 18 Oct 2026 12:00:00 GMT', Date.parse('2026-10-18T11:59:55Z')), 5000);
  const excessive = createArchiveTransport({ fetchImpl: async () => new Response(null, { status: 429, headers: { 'retry-after': '60' } }) });
  await assert.rejects(excessive.range(ARCHIVE_ITEMS[0], first(1)), /retry later/);
});

test('changed upstream resource size is rejected before presenting stale seek metadata', async () => {
  const client = createArchiveTransport({ fetchImpl: async () => new Response('123', {
    status: 206, headers: { 'content-range': 'bytes 0-2/101' },
  }) });
  await assert.rejects(client.range(ARCHIVE_ITEMS[0], first(1), {
    length: 3, expectedTotal: 100,
  }), /Source size changed/);
  const same = await client.range(ARCHIVE_ITEMS[0], first(1), { length: 3, expectedTotal: 101 });
  assert.equal(same.bytesRead, 3);
  await assert.rejects(client.range(ARCHIVE_ITEMS[0], first(1), { length: 3, expectedTotal: 2 }), /Invalid expected/);
});

test('shared limiter permits at most two active upstreams including body consumption', async () => {
  let active = 0, peak = 0;
  const fetchImpl = async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 15));
    active--;
    return new Response('123', { status: 206, headers: { 'content-range': 'bytes 0-2/100' } });
  };
  const a = createArchiveTransport({ fetchImpl }), b = createArchiveTransport({ fetchImpl });
  await Promise.all(Array.from({ length: 6 }, (_, i) => (i % 2 ? a : b).range(ARCHIVE_ITEMS[0], first(1), { length: 3 })));
  assert.equal(peak, 2);
});

test('saved real inventories yield exactly the verified coverage and rendition counts', async () => {
  const evidence = new URL('../../../../docs/one-piece/evidence/sources/', import.meta.url);
  const inventories = await Promise.all(ARCHIVE_ITEMS.map(async item => JSON.parse(await readFile(new URL(`${item}.json`, evidence), 'utf8'))));
  const catalog = buildCatalog(inventories);
  assert.deepEqual(catalog.summary, { listedEpisodes: 1084, missing: [590], overlapEpisodes: [], videoCandidates: 1169, subtitleCandidates: 3 });
  assert.equal(inventories[0].files.filter(f => f.extension === 'mkv').length, 999);
  assert.equal(inventories[1].files.filter(f => f.extension === 'mkv').length, 85);
  assert.equal(inventories[1].files.filter(f => f.extension === 'mp4').length, 85);
  assert.deepEqual(catalog.episodes.filter(e => e.subtitleCandidates.length).map(e => e.episodeNumber), [1068, 1071, 1074]);
  assert.match(catalog.episodes[943].candidates[0].fileName, /SubsPlease.*944/);
  assert.ok(catalog.episodes.every((e, i) => e.episodeNumber === i + 1));
});

test('aborted queued requests do not consume an upstream slot', async () => {
  let calls = 0;
  const release = [];
  const fetchImpl = async () => {
    calls++;
    await new Promise(resolve => release.push(resolve));
    return new Response('123', { status: 206, headers: { 'content-range': 'bytes 0-2/100' } });
  };
  const client = createArchiveTransport({ fetchImpl });
  const firstTwo = [client.range(ARCHIVE_ITEMS[0], first(1), { length: 3 }), client.range(ARCHIVE_ITEMS[0], first(1), { length: 3 })];
  const controller = new AbortController();
  const queued = client.range(ARCHIVE_ITEMS[0], first(1), { length: 3, signal: controller.signal });
  controller.abort(new Error('test cancellation'));
  await assert.rejects(queued, /test cancellation/);
  assert.equal(calls, 2);
  release.forEach(resolve => resolve());
  await Promise.all(firstTwo);
});
