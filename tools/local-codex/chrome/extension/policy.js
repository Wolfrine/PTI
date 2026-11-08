// Deliberately fixed sites. Adding an origin requires an owner-reviewed release.
export const origins = ['http://localhost:4173', 'https://taleweald.firebaseapp.com'];
export function approvedUrl(value) {
  const url = new URL(value);
  if (!origins.includes(url.origin) || url.username || url.password || url.search) throw Error('Only localhost:4173 or the Taleweald host, without credentials/query parameters, is allowed.');
  return url;
}
export const provider = 'pti-owner-chrome';
