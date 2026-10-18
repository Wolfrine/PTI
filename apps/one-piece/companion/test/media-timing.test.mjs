import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile, symlink } from 'node:fs/promises';
import { temporary } from './media-helpers.mjs';
import { createTimingInspector, inspectSelectedTiming } from '../src/media/timing.mjs';
import { trimVodManifest } from '../src/media/jellyfin.mjs';

const metadata = { format: { duration: '1432.415' }, streams: [
  { index: 0, codec_type: 'video', start_time: '.028', tags: { DURATION: '00:23:39.001000000' } },
  { index: 1, codec_type: 'audio', tags: { DURATION: '00:23:52.415000000' } },
  { index: 2, codec_type: 'audio', tags: { DURATION: '00:23:39.040000000' } }
] };
const ends = new Map([[0, 1419.001], [1, 1432.415], [2, 1419.04]]);
const tail = index => ({ packets: [{ stream_index: index, pts_time: String(ends.get(index) - .02), duration_time: '.02' }] });

test('selected Japanese presentation excludes the longer unselected English track and validates actual tail packets', () => {
  const japanese = inspectSelectedTiming(metadata, new Map([[0, tail(0)], [2, tail(2)]]), { videoIndex: 0, audioIndex: 2 });
  assert.equal(japanese.effectiveDurationSeconds, 1419.04); assert.equal(japanese.containerDurationSeconds, 1432.415);
  const english = inspectSelectedTiming(metadata, new Map([[0, tail(0)], [1, tail(1)]]), { videoIndex: 0, audioIndex: 1 });
  assert.equal(english.effectiveDurationSeconds, 1432.415);
  const suffixed = { ...metadata, streams: metadata.streams.map(stream => ({ ...stream,
    tags: { 'DURATION-eng': stream.tags.DURATION } })) };
  assert.equal(inspectSelectedTiming(suffixed, new Map([[0, tail(0)], [2, tail(2)]]), { videoIndex: 0, audioIndex: 2 }).effectiveDurationSeconds, 1419.04);
  assert.throws(() => inspectSelectedTiming(metadata, new Map([[0, tail(0)], [2, { packets: [] }]]), { videoIndex: 0, audioIndex: 2 }), { code: 'TIMING_UNVERIFIED' });
  assert.throws(() => inspectSelectedTiming({ ...metadata, streams: metadata.streams.map(stream => ({ ...stream, tags: {} })) }, new Map(), { videoIndex: 0, audioIndex: 2 }), { code: 'TIMING_UNVERIFIED' });
});

test('selected timing rejects nonfinite starts, oversized ends and malformed packet collections', () => {
  const make = start => ({ format: { duration: '10' }, streams: [
    { index: 0, codec_type: 'video', duration: '10', start_time: start },
    { index: 2, codec_type: 'audio', duration: '10', start_time: start }
  ] });
  const packets = end => new Map([0, 2].map(index => [index, { packets: [{ stream_index: index, pts_time: String(end - .02), duration_time: '.02' }] }]));
  for (const start of ['20000', '14399', 'NaN', 'Infinity'])
    assert.throws(() => inspectSelectedTiming(make(start), packets(Number(start) + 10), { videoIndex: 0, audioIndex: 2 }), { code: 'TIMING_UNVERIFIED' });
  assert.throws(() => inspectSelectedTiming(metadata, new Map([[0, { packets: {} }], [2, tail(2)]]), { videoIndex: 0, audioIndex: 2 }), { code: 'TIMING_UNVERIFIED' });
  assert.throws(() => inspectSelectedTiming(metadata, new Map([[0, { packets: Array(8193).fill({}) }], [2, tail(2)]]), { videoIndex: 0, audioIndex: 2 }), { code: 'TIMING_UNVERIFIED' });
});

test('VOD tail excludes empty engine segments while keeping exact indices and subtitle/global timestamp headers', () => {
  const text = '#EXTM3U\n#EXT-X-TARGETDURATION:3\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-MAP:URI="init.mp4"\n'
    + Array.from({ length: 5 }, (_, i) => `#EXTINF:2.002,\nsegment-${i}.ts\n`).join('') + '#EXT-X-ENDLIST\n';
  const trimmed = trimVodManifest(text, 4.5);
  assert.match(trimmed, /#EXTINF:0.496,\nsegment-2.ts/);
  assert.ok(!trimmed.includes('segment-3') && !trimmed.includes('segment-4'));
  assert.ok(trimmed.includes('#EXT-X-MEDIA-SEQUENCE:0') && trimmed.includes('#EXT-X-MAP:URI="init.mp4"'));
  assert.equal((trimmed.match(/#EXT-X-ENDLIST/g) ?? []).length, 1);
  const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500000\nmain.m3u8\n';
  assert.equal(trimVodManifest(master, 4.5), master);
  assert.equal(trimVodManifest(text.replace('#EXT-X-ENDLIST\n', ''), 4.5), text.replace('#EXT-X-ENDLIST\n', ''));
  assert.throws(() => trimVodManifest(text, NaN), { code: 'TIMING_UNVERIFIED' });
});

test('cached timing uses only finite selected-track tail intervals; shares work and denies URL/outside inputs', async t => {
  const root = await temporary(t), file = path.join(root, 'original.mkv'); await writeFile(file, 'explicit metadata fixture');
  const calls = [], inspect = createTimingInspector({ originalRoot: root, ffprobePath: path.join(root, 'ffprobe.exe'),
    run: async (executable, args) => {
      calls.push({ executable, args });
      assert.equal(args.at(-1), file); assert.ok(!args.includes('-show_data'));
      if (!args.includes('-show_packets')) return metadata;
      assert.match(args[args.indexOf('-read_intervals') + 1], /^1415\.0\d{2}%\+8$/);
      return tail(Number(args[args.indexOf('-select_streams') + 1]));
    } });
  const [first, second] = await Promise.all([inspect(file, { videoIndex: 0, audioIndex: 2 }), inspect(file, { videoIndex: 0, audioIndex: 2 })]);
  assert.deepEqual(first, second); assert.equal(calls.length, 3);
  await inspect(file, { videoIndex: 0, audioIndex: 2 }); assert.equal(calls.length, 3);
  await assert.rejects(inspect('https://archive.org/anything', { videoIndex: 0, audioIndex: 2 }), { code: 'ENGINE_PATH' });
  await assert.rejects(inspect(path.join(path.dirname(root), 'outside.mkv'), { videoIndex: 0, audioIndex: 2 }), { code: 'ENGINE_PATH' });
});

test('cached timing refuses a real filesystem symlink', async t => {
  const root = await temporary(t), file = path.join(root, 'original.mkv'), linked = path.join(root, 'linked.mkv');
  await writeFile(file, 'explicit link fixture');
  try { await symlink(file, linked); } catch (error) { if (error.code === 'EPERM') { t.skip('Windows refused creation of the fixture symlink'); return; } throw error; }
  const inspect = createTimingInspector({ originalRoot: root, ffprobePath: path.join(root, 'ffprobe.exe'), run: async () => { throw new Error('A link must never start a probe'); } });
  await assert.rejects(inspect(linked, { videoIndex: 0, audioIndex: 2 }), { code: 'CACHE_LINK' });
});
