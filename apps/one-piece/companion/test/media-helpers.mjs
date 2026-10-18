import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ARCHIVE_ITEMS, archiveFileUrl } from '../src/sources/archive.mjs';

export async function temporary(t) {
  const prefix = path.join(os.tmpdir(), 'pti-media-test-');
  const root = await mkdtemp(prefix);
  t.after(async () => { if (!path.resolve(root).startsWith(path.resolve(prefix))) throw new Error('Unsafe test cleanup'); await rm(root, { recursive: true, force: true }); });
  return root;
}

export function candidate(number = 1, bytes = Buffer.from('explicit mock episode bytes')) {
  const itemId = ARCHIVE_ITEMS[number >= 1001 ? 1 : 0];
  const fileName = number >= 1001 ? `[Anime Time] One Piece - ${number} - Fixture Title.mkv`
    : number >= 944 ? `[SubsPlease] One Piece - ${number} (720p) [AABBCCDD].mkv`
      : `[HorribleSubs] One Piece - ${String(number).padStart(2, '0')} [720p].mkv`;
  return { id: 'archive-' + createHash('sha256').update(`${itemId}/${fileName}`).digest('hex').slice(0, 20),
    provider: 'archive', role: 'original', container: 'mkv', itemId, fileName, url: archiveFileUrl(itemId, fileName),
    bytes: bytes.length, checksums: { md5: createHash('md5').update(bytes).digest('hex') } };
}

export function fixtureDownloader(bytes, pauseMs = 0) {
  const state = { calls: 0, active: 0, peak: 0 };
  return { state, async download(source, target, { signal, onProgress }) {
    state.calls++; state.active++; state.peak = Math.max(state.peak, state.active);
    try {
      if (pauseMs) await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, pauseMs);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
      });
      if (signal.aborted) throw signal.reason;
      await writeFile(target, bytes); onProgress?.({ state: 'verifying', receivedBytes: bytes.length, totalBytes: bytes.length });
      return { bytes: bytes.length, md5: source.checksums.md5, fixture: true };
    } finally { state.active--; }
  } };
}
