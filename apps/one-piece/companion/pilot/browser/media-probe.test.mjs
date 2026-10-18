import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readBoundedRange} from './media-probe.mjs';
const fetchOriginal = globalThis.fetch;
function response(parts, headers = {}, status = 206) {
  return new Response(new ReadableStream({start(controller) {for (const p of parts) controller.enqueue(new Uint8Array(p)); controller.close();}}), {status, headers: {'Content-Range': 'bytes 2-4/10', ...headers}});
}
test('range reader enforces exact range, length, truncation and overflow', async t => {
  t.after(() => {globalThis.fetch = fetchOriginal;});
  await t.test('returns only the requested bytes', async () => {
    globalThis.fetch = async (_url, options) => {assert.equal(options.headers.Range, 'bytes=2-4'); return response([[2], [3, 4]], {'Content-Length': '3'});};
    assert.deepEqual(await readBoundedRange('http://test.invalid', 2, 4, 10), new Uint8Array([2, 3, 4]));
  });
  await t.test('rejects a 200 whole-file reply', async () => {
    globalThis.fetch = async () => response([[2, 3, 4]], {}, 200);
    await assert.rejects(readBoundedRange('http://test.invalid', 2, 4, 10), /refusing full-file/);
  });
  await t.test('rejects mismatched file size or range', async () => {
    globalThis.fetch = async () => response([[2, 3, 4]], {'Content-Range': 'bytes 2-4/11'});
    await assert.rejects(readBoundedRange('http://test.invalid', 2, 4, 10), /Mismatched/);
  });
  await t.test('rejects misleading content length', async () => {
    globalThis.fetch = async () => response([[2, 3, 4]], {'Content-Length': '3000000'});
    await assert.rejects(readBoundedRange('http://test.invalid', 2, 4, 10), /Mismatched/);
  });
  await t.test('cancels streamed overflow even without content length', async () => {
    globalThis.fetch = async () => response([[2, 3], [4, 5]]);
    await assert.rejects(readBoundedRange('http://test.invalid', 2, 4, 10), /exceeded/);
  });
  await t.test('rejects truncated streamed body', async () => {
    globalThis.fetch = async () => response([[2, 3]]);
    await assert.rejects(readBoundedRange('http://test.invalid', 2, 4, 10), /Truncated/);
  });
});
