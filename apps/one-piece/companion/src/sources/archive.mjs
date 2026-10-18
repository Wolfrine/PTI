import { createHash } from 'node:crypto';

export const ARCHIVE_ITEMS = Object.freeze([
  'one-piece-0001-1000-1999-horrible-subs',
  '20260622_20260622_0310',
]);
export const LAST_LISTED_EPISODE = 1085;

export function canonicalEpisodeId(number) {
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid episode number');
  return `one-piece-${String(number).padStart(4, '0')}`;
}

export function assertItem(itemId) {
  if (!ARCHIVE_ITEMS.includes(itemId)) throw new Error('Archive item is not allowlisted');
}

export function assertFileName(name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || /[\x00-\x1f\x7f]/.test(name)
      || name.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Unsafe Archive filename');
  }
}

/** Anchored release-specific parser. Never parse a number from the batch directory. */
export function parseEpisodeFile(itemId, name) {
  assertItem(itemId);
  assertFileName(name);
  const basename = name.split('/').at(-1);
  let match;
  if (itemId === ARCHIVE_ITEMS[0]) {
    match = /^(?:\[(HorribleSubs)\] One Piece - (\d{2,4}) \[720p\]|\[(SubsPlease)\] One Piece - (\d{3,4}) \(720p\) \[[0-9A-Fa-f]{8}\])\.(mkv|mp4)$/.exec(basename);
    if (!match) return null;
    const episodeNumber = Number(match[2] ?? match[4]);
    if (episodeNumber < 1 || episodeNumber > 1000) return null;
    if ((match[1] && episodeNumber > 943) || (match[3] && episodeNumber < 944)) return null;
    return { episodeNumber, releaseGroup: match[1] ?? match[3], extension: match[5], titleFromFilename: null };
  }
  match = /^\[Anime Time\] One Piece - (\d{4}) - (.+)\.(mkv|mp4|srt)$/.exec(basename);
  if (!match) return null;
  const episodeNumber = Number(match[1]);
  if (episodeNumber < 1001 || episodeNumber > 1085) return null;
  return { episodeNumber, releaseGroup: 'Anime Time', extension: match[3], titleFromFilename: match[2] };
}

export function archiveFileUrl(itemId, name) {
  assertItem(itemId);
  assertFileName(name);
  if (!parseEpisodeFile(itemId, name)) throw new Error('Unrecognized episode file');
  return `https://archive.org/download/${itemId}/${name.split('/').map(encodeURIComponent).join('/')}`;
}

const numeric = value => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** Retains useful file provenance, not user/IP/account fields or Archive uploader metadata. */
export function sanitizeMetadata(itemId, metadata, fetchedAt, rawSha256) {
  assertItem(itemId);
  if (!Array.isArray(metadata.files)) throw new Error('Metadata response has no files inventory');
  const unparsedMedia = [];
  const files = [];
  for (const file of metadata.files) {
    if (!/\.(mkv|mp4|srt)$/i.test(file.name ?? '')) continue;
    const parsed = parseEpisodeFile(itemId, file.name);
    if (!parsed) { unparsedMedia.push(file.name); continue; }
    files.push({
      name: file.name, ...parsed,
      source: file.source ?? 'unknown', original: file.original ?? null,
      size: numeric(file.size), format: file.format ?? null,
      checksums: { sha1: file.sha1 ?? null, md5: file.md5 ?? null, crc32: file.crc32 ?? null },
      durationSeconds: numeric(file.length), width: numeric(file.width), height: numeric(file.height),
    });
  }
  return {
    schemaVersion: 1, itemId, fetchedAt, metadataUrl: `https://archive.org/metadata/${itemId}`,
    rawResponseSha256: rawSha256, metadataFileCount: metadata.files.length,
    title: metadata.metadata?.title ?? null,
    licenseUrl: metadata.metadata?.licenseurl ?? null,
    access: { isDark: Boolean(metadata.is_dark), isRestricted: Boolean(metadata.is_restricted) },
    files, unparsedMedia,
  };
}

export function buildCatalog(inventories) {
  const episodes = new Map();
  const seen = new Set();
  for (const inventory of inventories) {
    assertItem(inventory.itemId);
    if (inventory.access?.isDark || inventory.access?.isRestricted) throw new Error('Restricted item cannot be offered');
    if (inventory.unparsedMedia?.length) throw new Error('Unparsed media requires discovery review');
    for (const file of inventory.files) {
      const parsed = parseEpisodeFile(inventory.itemId, file.name);
      if (!parsed) throw new Error('Inventory contains unrecognized media');
      const id = canonicalEpisodeId(parsed.episodeNumber);
      const identity = `${inventory.itemId}/${file.name}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      const row = episodes.get(parsed.episodeNumber) ?? {
        id, episodeNumber: parsed.episodeNumber, availability: 'listed',
        title: parsed.titleFromFilename, titleProvenance: parsed.titleFromFilename ? 'source-filename' : null,
        candidates: [], subtitleCandidates: [],
      };
      const candidate = {
        id: `archive-${sha256(identity).slice(0, 20)}`, provider: 'archive', itemId: inventory.itemId,
        fileName: file.name, url: archiveFileUrl(inventory.itemId, file.name),
        role: parsed.extension === 'srt' ? 'subtitle' : file.source === 'derivative' ? 'derivative' : file.source === 'original' ? 'original' : 'unknown',
        source: file.source, originalFileName: file.original,
        container: parsed.extension, format: file.format, bytes: file.size, checksums: file.checksums,
        durationSeconds: file.durationSeconds, width: file.width, height: file.height,
        tracks: { verification: 'not-probed', audio: [], subtitles: [] },
        health: { status: 'listed-not-playback-verified', checkedAt: inventory.fetchedAt },
      };
      (parsed.extension === 'srt' ? row.subtitleCandidates : row.candidates).push(candidate);
      episodes.set(parsed.episodeNumber, row);
    }
  }
  const rows = [];
  for (let number = 1; number <= LAST_LISTED_EPISODE; number++) {
    const row = episodes.get(number);
    if (row?.candidates.length) {
      row.candidates.sort((a, b) => (a.role === 'derivative') - (b.role === 'derivative') || a.id.localeCompare(b.id));
      rows.push(row);
    } else rows.push({ id: canonicalEpisodeId(number), episodeNumber: number, availability: 'missing', candidates: [], subtitleCandidates: [] });
  }
  const available = rows.filter(row => row.availability === 'listed');
  return {
    schemaVersion: 1, inventories: inventories.map(i => ({ itemId: i.itemId, fetchedAt: i.fetchedAt, rawResponseSha256: i.rawResponseSha256 })),
    summary: { listedEpisodes: available.length, missing: rows.filter(r => r.availability === 'missing').map(r => r.episodeNumber),
      overlapEpisodes: available.filter(r => new Set(r.candidates.map(c => c.itemId)).size > 1).map(r => r.episodeNumber),
      videoCandidates: available.reduce((n, r) => n + r.candidates.length, 0), subtitleCandidates: available.reduce((n, r) => n + r.subtitleCandidates.length, 0) },
    episodes: rows,
    endBoundary: { id: canonicalEpisodeId(1086), episodeNumber: 1086, availability: 'outside-sources', candidates: [], subtitleCandidates: [] },
  };
}

export function lookupEpisode(catalog, number) {
  canonicalEpisodeId(number);
  if (number > LAST_LISTED_EPISODE) return { id: canonicalEpisodeId(number), episodeNumber: number, availability: 'outside-sources', candidates: [], subtitleCandidates: [] };
  return catalog.episodes[number - 1];
}

/** Does not silently jump a missing episode. UI must offer explicit skip. */
export function nextEpisode(catalog, number) { return lookupEpisode(catalog, number + 1); }
