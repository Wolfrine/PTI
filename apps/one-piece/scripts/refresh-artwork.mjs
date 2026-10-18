import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const endpoint = 'https://api.tvmaze.com/shows/1505/episodes';
const orderingSha256 = 'a9a1f324e75665a24138496ce16e816c79145a89fb5940d601d687c68dfeec39';
const anchors = { 1:256125, 500:256624, 590:297502, 944:1929029, 1000:2211448, 1001:2211449, 1044:2442123, 1085:2685946 };
const seasonCounts = [8,44,42,44,37,39,39,38,45,47,49,49,48,49,48,50,48,46,49,47,49,41,48,41,40];
const normalize = value => value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');

export function validateOrdering(rows, catalog) {
  const considered = rows.slice(0,1085);
  if (considered.length !== 1085 || considered.some(e => e.type !== 'regular')) throw new Error('Expected 1,085 regular episodes, excluding specials.');
  const checksum = createHash('sha256').update(JSON.stringify(considered.map(e => e.id))).digest('hex');
  if (checksum !== orderingSha256) throw new Error('TVmaze episode ordering changed: manually review absolute mapping before refreshing.');
  for (const [number,id] of Object.entries(anchors)) if (considered[Number(number)-1].id !== id) throw new Error(`Anchor ${number} changed.`);
  let cursor = 0;
  seasonCounts.forEach((count,offset) => {
    for (let number=1; number<=count; number++) {
      const e = considered[cursor++];
      if (e.season !== 1999+offset || e.number !== number) throw new Error('Calendar-season episode sequence changed.');
    }
  });
  const titled = catalog.episodes.filter(e => e.episodeNumber >= 1001 && e.episodeNumber <= 1085);
  const normalizedTitleMatches = titled.filter(e => normalize(e.title || '') === normalize(considered[e.episodeNumber-1].name)).length;
  if (titled.length !== 85 || normalizedTitleMatches < 60) throw new Error('Archive title cross-check regressed; review translations and numbering.');
  return { orderingSha256:checksum, comparedArchiveTitles:titled.length, normalizedTitleMatches, translatedTitleVariants:titled.length-normalizedTitleMatches };
}

function imageUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'static.tvmaze.com' || !url.pathname.startsWith('/uploads/images/')) throw new Error('Unexpected artwork host.');
  return url.href;
}

function jpegDimensions(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Image is not JPEG.');
  for (let i=2; i+8<bytes.length;) {
    if (bytes[i] !== 0xff) throw new Error('Invalid JPEG marker.');
    const marker=bytes[i+1], length=bytes.readUInt16BE(i+2);
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) return {width:bytes.readUInt16BE(i+7),height:bytes.readUInt16BE(i+5)};
    i+=length+2;
  }
  throw new Error('JPEG dimensions not found.');
}

async function fetchBounded(url, maximum) {
  const response = await fetch(url, {signal:AbortSignal.timeout(20000),headers:{'User-Agent':'PTI-OnePiece-Artwork/1.0'}});
  if (!response.ok) throw new Error(`Artwork request failed: HTTP ${response.status}`);
  const chunks=[];let length=0;
  for await (const chunk of response.body) { length+=chunk.length; if(length>maximum) { await response.body.cancel().catch(()=>{}); throw new Error('Artwork response exceeds bound.'); } chunks.push(chunk); }
  return { response, bytes:Buffer.concat(chunks) };
}

export async function refreshArtwork() {
  const catalog = JSON.parse(await readFile(new URL('../../../docs/one-piece/evidence/sources/catalog.json',import.meta.url),'utf8'));
  const {bytes} = await fetchBounded(endpoint, 3_000_000);
  const rows = JSON.parse(bytes.toString('utf8'));
  const mapping = validateOrdering(rows,catalog);
  const episodes = {};
  for (const canonical of catalog.episodes) {
    if (canonical.episodeNumber > 1085 || canonical.availability !== 'listed') continue;
    const episode = rows[canonical.episodeNumber-1];
    if (!episode.image?.medium) continue;
    episodes[canonical.id] = { episodeNumber:canonical.episodeNumber, title:episode.name, image:imageUrl(episode.image.medium), originalImage:imageUrl(episode.image.original), sourceId:episode.id, sourceUrl:episode.url };
  }
  const checks=[];
  // Seven small images, fetched serially. Never request source videos or the entire image library.
  for (const episodeNumber of [1,500,944,1000,1001,1044,1085]) {
    const image=imageUrl(rows[episodeNumber-1].image.medium);
    const {response,bytes:imageBytes}=await fetchBounded(image, 2_000_000);
    checks.push({episodeNumber,status:response.status,bytes:imageBytes.length,contentType:response.headers.get('content-type'),...jpegDimensions(imageBytes)});
  }
  const manifest = {
    schemaVersion:1, provider:'TVmaze', source:'https://www.tvmaze.com/shows/1505/one-piece', fetchedAt:new Date().toISOString(),
    attribution:{label:'Episode artwork and metadata: TVmaze',url:'https://www.tvmaze.com/shows/1505/one-piece',license:'CC BY-SA',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/'},
    safeHero:'https://static.tvmaze.com/uploads/images/original_untouched/227/569819.jpg',
    safeHeroDescription:'Classic series promotional artwork, visually inspected: Luffy with the early Straw Hat crew. No later transformations or episode plot scene.',
    verification:{...mapping,upstreamEpisodeRecords:rows.length,availableCanonicalImages:Object.keys(episodes).length,missingCanonicalEpisodes:[590],imageChecks:checks},
    episodes
  };
  await writeFile(new URL('../web/artwork.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify(manifest.verification,null,2));
  return manifest;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await refreshArtwork();
