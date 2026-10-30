import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { decodeResult, formatJobStatus } from '../studio.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1cAAAAASUVORK5CYII=', 'base64');
const manifest = { mime: 'image/png', bytes: png.length, chunks: 2, sha256: createHash('sha256').update(png).digest('hex') };
const chunks = [{ index: 0, data: png.subarray(0, 24).toString('base64') }, { index: 1, data: png.subarray(24).toString('base64') }];

test('result preview verifies complete ordered PNG bytes and SHA-256 before display', async () => {
  const blob = await decodeResult(manifest, [...chunks].reverse());
  assert.equal(blob.type, 'image/png');
  assert.deepEqual(Buffer.from(await blob.arrayBuffer()), png);
});

test('incomplete, tampered, duplicate and excessive chunks cannot become a preview', async () => {
  await assert.rejects(decodeResult(manifest, chunks.slice(0, 1)));
  await assert.rejects(decodeResult({ ...manifest, sha256: '0'.repeat(64) }, chunks));
  await assert.rejects(decodeResult(manifest, [chunks[0], chunks[0]]));
  await assert.rejects(decodeResult({ ...manifest, chunks: 17 }, chunks));
  await assert.rejects(decodeResult({ ...manifest, bytes: png.length + 1 }, chunks));
  await assert.rejects(decodeResult({ ...manifest, mime: 'image/svg+xml' }, chunks));
});

test('queue status remains explicit and reports actual worker steps', () => {
  assert.equal(formatJobStatus({ status: 'running', progress: { step: 2, total: 4 } }), 'Generating · step 2 of 4');
  assert.equal(formatJobStatus({ status: 'queued' }), 'Queued on your PC');
  assert.equal(formatJobStatus({ status: 'failed' }), 'Generation stopped');
  assert.equal(formatJobStatus({ status: 'completed' }), 'Ready for your review');
});
