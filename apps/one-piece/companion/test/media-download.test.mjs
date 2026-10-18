import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { ArchiveDownloader } from '../src/media/download.mjs';
import { candidate, temporary } from './media-helpers.mjs';

test('verified bounded download counts exact bytes and MD5; fixture data only', async t => {
  const root = await temporary(t), bytes = Buffer.from('mock verified original'), source = candidate(1, bytes);
  const downloader = new ArchiveDownloader({ fetchImpl: async () => new Response(bytes, { headers: { 'content-length': String(bytes.length) } }) });
  const file = path.join(root, 'episode.part');
  const result = await downloader.download(source, file);
  assert.equal(result.md5, source.checksums.md5); assert.equal(result.bytes, bytes.length);
  assert.deepEqual(await readFile(file), bytes);
});

test('rejects arbitrary URLs and cross-host redirects without consuming bodies', async t => {
  const root = await temporary(t), source = candidate(); let calls = 0;
  const downloader = new ArchiveDownloader({ fetchImpl: async () => { calls++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secrets' } }); } });
  await assert.rejects(downloader.download({ ...source, url: 'https://example.org/video.mkv' }, path.join(root, 'bad')), { code: 'INVALID_SOURCE' });
  assert.equal(calls, 0);
  await assert.rejects(downloader.download(source, path.join(root, 'redirect')), { code: 'SOURCE_REDIRECT' });
  assert.equal(calls, 1);
});

test('wrong MD5, truncated bodies and oversized bodies never become playable files', async t => {
  const root = await temporary(t), bytes = Buffer.from('verified fixture'), source = candidate(1, bytes);
  for (const [name, supplied] of [['wrong-md5', Buffer.alloc(bytes.length, 1)], ['short', bytes.subarray(0, 4)], ['long', Buffer.concat([bytes, bytes])]]) {
    const downloader = new ArchiveDownloader({ fetchImpl: async () => new Response(supplied) });
    const file = path.join(root, name);
    await assert.rejects(downloader.download(source, file), error => ['SOURCE_INTEGRITY', 'SOURCE_OVERSIZE'].includes(error.code));
    await assert.rejects(access(file));
  }
});

test('finite Retry-After behavior and caller cancellation', async t => {
  const root = await temporary(t), bytes = Buffer.from('retry fixture'), source = candidate(1, bytes); let calls = 0; const waits = [];
  const downloader = new ArchiveDownloader({ sleep: async ms => waits.push(ms), fetchImpl: async () => ++calls < 3
    ? new Response(null, { status: 429, headers: { 'retry-after': '1' } }) : new Response(bytes) });
  assert.equal((await downloader.download(source, path.join(root, 'retry'))).attempts, 3);
  assert.deepEqual(waits, [1000, 1000]);
  const excessive = new ArchiveDownloader({ fetchImpl: async () => new Response(null, { status: 429, headers: { 'retry-after': '60' } }) });
  await assert.rejects(excessive.download(source, path.join(root, 'limited')), { code: 'SOURCE_BUSY', retryAfterMs: 60000 });
  const controller = new AbortController(); controller.abort(new Error('viewer left'));
  await assert.rejects(downloader.download(source, path.join(root, 'aborted'), { signal: controller.signal }), /viewer left/);
});

test('never overwrites or removes an existing destination', async t => {
  const root = await temporary(t), file = path.join(root, 'existing'); await writeFile(file, 'keep');
  const downloader = new ArchiveDownloader({ fetchImpl: async () => new Response('anything') });
  await assert.rejects(downloader.download(candidate(), file), { code: 'CACHE_WRITE' });
  assert.equal(await readFile(file, 'utf8'), 'keep');
});
