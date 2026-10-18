import manifest from '../artwork.json' with { type: 'json' };
import { episodeId, episodeNumber } from './model.mjs';

export function safeArtworkUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'static.tvmaze.com' && !url.username && !url.password && /^\/uploads\/images\/(?:medium_landscape|original_untouched)\/\d+\/\d+\.(?:jpg|png|webp)$/.test(url.pathname) && !url.search && !url.hash ? url.href : null;
  } catch { return null; }
}
const art = number => manifest.episodes?.[episodeId(number)];
export const heroArtwork = () => safeArtworkUrl(manifest.safeHero) || safeArtworkUrl(art(1)?.originalImage) || safeArtworkUrl(art(1)?.image);
export function previewVisible(s, number) {
  if (number === 590 || !Number.isInteger(number) || number < 1 || number > 1085) return false;
  if (s.profile?.showTitles) return true;
  const reached = Object.values(s.progress ?? {}).reduce((max, p) => p?.watched || p?.positionSeconds > 0 ? Math.max(max, episodeNumber(p.episodeId) || 0) : max, 1);
  return number <= Math.max(reached, s.session?.episodeNumber || 0);
}
export function episodeArtwork(s, number, { original = false } = {}) {
  if (number === 590 || !Number.isInteger(number) || number < 1 || number > 1085) return null;
  return previewVisible(s, number) ? (original ? safeArtworkUrl(art(number)?.originalImage) : null) || safeArtworkUrl(art(number)?.image) || heroArtwork() : heroArtwork();
}
export function withArtwork(catalog) {
  if (!Array.isArray(catalog?.episodes)) return catalog;
  return { ...catalog, episodes: catalog.episodes.map(episode => {
    const item = art(episode.episodeNumber);
    if (episode.availability !== 'listed' || item?.episodeNumber !== episode.episodeNumber || !item.title || !safeArtworkUrl(item.image)) return episode;
    return { ...episode, title: episode.title || item.title, titleProvenance: episode.titleProvenance || item.sourceUrl };
  }) };
}
