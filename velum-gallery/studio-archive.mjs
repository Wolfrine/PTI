export const ARCHIVE_PAGE_SIZE = 36;
export const ARCHIVE_FILTERS = ['all', 'kept', 'saved', 'drafts', 'removed'];

export function mergeArchivePage(previous, next) {
  const merged = new Map(previous.map(job => [job.id, job]));
  next.forEach(job => merged.set(job.id, { ...merged.get(job.id), ...job }));
  return [...merged.values()];
}

// Secondary filters are deliberately scoped to pages already fetched. We never
// scan an owner's entire history to fill a screen or download full PNGs here.
export function visibleCreations(jobs, { filter = 'all', model = '', date = '', saves = {}, removed = {} } = {}) {
  return jobs.filter(job => (filter==='removed' ? Boolean(removed[job.id]) : !removed[job.id]) && (!model || job.model === model) &&
    (!date || new Date(job.createdAt).toISOString().slice(0, 10) === date) &&
    (filter !== 'drafts' || (job.status === 'completed' && !saves[job.id])));
}

export function creationLocation(job, save, {remoteVerified=false,remoteError=false}={}) {
  const complete = job?.status === 'completed';
  const remote = complete && job.result?.chunks > 0;
  const expectedPath=complete?`H:\\AI-ImageGen\\portrait-pilot\\velum-studio\\${job.id}\\image.png`:'';
  const recorded=complete&&job.result?.localPath===expectedPath;
  return {
    localPath: expectedPath,
    metadataPath: complete ? `H:\\AI-ImageGen\\portrait-pilot\\velum-studio\\${job.id}\\result.json` : '',
    local: recorded ? 'Original and metadata reported by your PC' : complete ? 'Expected PC paths · this older record has no recorded local path' : 'No completed local original reported',
    remote: remoteVerified ? 'Private remote original verified' : remoteError ? 'Remote original unavailable or not verified' : remote ? 'Private remote copy reported · open to verify' : complete ? 'Local original only · remote preview unavailable' : 'Awaiting original',
    drive: save?.fileId ? 'Saved to Private on Google Drive' : 'Not saved to Drive'
  };
}

export async function decodeThumbnail(thumb) {
  if (thumb?.mime !== 'image/jpeg' || !Number.isInteger(thumb.bytes) || thumb.bytes < 4 || thumb.bytes > 65536 ||
      !Number.isInteger(thumb.width) || !Number.isInteger(thumb.height) || thumb.width < 1 || thumb.height < 1 ||
      Math.max(thumb.width, thumb.height) > 512 || typeof thumb.data !== 'string' || thumb.data.length > 90000 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(thumb.data) || !/^[a-f0-9]{64}$/.test(thumb.sha256 || '')) throw new Error('Invalid thumbnail');
  const bytes = Uint8Array.from(atob(thumb.data), value => value.charCodeAt(0));
  if (bytes.length !== thumb.bytes || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) throw new Error('Invalid thumbnail bytes');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
  if (hash !== thumb.sha256) throw new Error('Thumbnail integrity check failed');
  return new Blob([bytes], { type: 'image/jpeg' });
}

export function archiveSource(filter = 'all') {
  return filter === 'removed' ? { collection: 'removed', order: 'removedAt' } : filter === 'kept' ? { collection: 'feedback', order: 'updatedAt', where: ['verdict', '==', 'keep'] } :
    filter === 'saved' ? { collection: 'saves', order: 'savedAt' } :
    filter === 'drafts' ? { collection: 'jobs', order: 'createdAt', where: ['status', '==', 'completed'] } :
    { collection: 'jobs', order: 'createdAt' };
}
