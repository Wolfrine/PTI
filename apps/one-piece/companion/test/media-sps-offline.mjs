/** Offline SPS check of retained samples only. No process, engine, GPU, network or TV access. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

function videoPayload(bytes) {
  let pmtPid, videoPid; const pieces = [];
  for (let at = 0; at + 188 <= bytes.length; at += 188) {
    assert.equal(bytes[at], 0x47, 'Invalid TS packet');
    const pid = (bytes[at + 1] & 0x1f) * 256 + bytes[at + 2], control = bytes[at + 3] >> 4 & 3;
    if (!(control & 1)) continue;
    let start = at + 4 + (control === 3 ? 1 + bytes[at + 4] : 0); if (start >= at + 188) continue;
    const unitStart = Boolean(bytes[at + 1] & 0x40);
    if (unitStart && (pid === 0 || pid === pmtPid)) {
      const table = start + 1 + bytes[start], end = table + 3 + ((bytes[table + 1] & 15) * 256 + bytes[table + 2]) - 4;
      if (pid === 0 && bytes[table] === 0) {
        for (let i = table + 8; i + 4 <= end; i += 4) if (bytes[i] || bytes[i + 1]) pmtPid = (bytes[i + 2] & 31) * 256 + bytes[i + 3];
      } else if (pid === pmtPid && bytes[table] === 2) {
        for (let i = table + 12 + ((bytes[table + 10] & 15) * 256 + bytes[table + 11]); i + 5 <= end;) {
          if (bytes[i] === 0x1b) videoPid = (bytes[i + 1] & 31) * 256 + bytes[i + 2];
          i += 5 + ((bytes[i + 3] & 15) * 256 + bytes[i + 4]);
        }
      }
    }
    if (pid === videoPid) {
      if (unitStart) { assert.equal(bytes.readUIntBE(start, 3), 1); start += 9 + bytes[start + 8]; }
      pieces.push(bytes.subarray(start, at + 188));
    }
  }
  assert.ok(Number.isInteger(videoPid)); return Buffer.concat(pieces);
}

if (process.env.PTI_RUN_OFFLINE_SPS !== '1') console.log('Skipped: set PTI_RUN_OFFLINE_SPS=1 to inspect existing H: TS samples without any engine/probe.');
else {
  const evidence = new URL('../../../../docs/one-piece/evidence/cast-media-compat/', import.meta.url);
  const comparison = JSON.parse(await readFile(new URL('engine-comparison-2026-10-18T10-20-23-293Z.json', evidence), 'utf8'));
  const rows = [];
  for (const episode of [1000, 1001]) {
    const sample = `${episode}-cast-h264-segment-0.ts`, bytes = await readFile(`H:/PTI-OnePiece/production-media/cast-media-compat/${sample}`);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha256, comparison.policies.find(row => row.episode === episode).samples[0].segments[0].sha256);
    const elementary = videoPayload(bytes), found = [];
    for (let i = 0; i + 7 < elementary.length; i++) {
      let n = 0;
      if (elementary[i] === 0 && elementary[i + 1] === 0 && elementary[i + 2] === 1) n = i + 3;
      if (n && (elementary[n] & 31) === 7) found.push({ profileIdc: elementary[n + 1], constraintFlags: elementary[n + 2], levelIdc: elementary[n + 3] });
    }
    assert.ok(found.length); const sps = [...new Map(found.map(row => [JSON.stringify(row), row])).values()];
    rows.push({ episode, sample, sha256, sps, outputPixelFormatFromRecordedEncoderLog: 'yuv420p (8-bit 4:2:0)',
      heardOrDisplayed: false });
  }
  const report = { kind: 'offline-actual-encoder-sps-and-recorded-output-profile', checkedAt: new Date().toISOString(),
    engineOrGpuInvoked: false, actualTvControlled: false, rows };
  await writeFile(new URL('codec-profile-offline.json', evidence), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
