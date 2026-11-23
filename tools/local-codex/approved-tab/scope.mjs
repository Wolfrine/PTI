// Reviewed browser origins. These are checked by the desktop host and the extension.
export const origins = new Set([
  'http://localhost:4173',
  'https://taleweald.firebaseapp.com',
  'https://example.com',
  'https://iana.org',
  'https://www.iana.org',
]);

export function pageUrl(value) {
  const url = new URL(value);
  if (!origins.has(url.origin) || url.username || url.password || url.search) {
    throw Error('This page is outside the approved browser sites or contains private URL parameters.');
  }
  url.hash = '';
  return url.href;
}

export function matchesPage(actual, requested) {
  const observed = pageUrl(actual);
  return observed === requested ||
    (requested === 'https://iana.org/help/example-domains' &&
     observed === 'https://www.iana.org/help/example-domains');
}
