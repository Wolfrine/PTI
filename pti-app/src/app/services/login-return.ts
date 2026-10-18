// One allowlist for both popup and existing-session login returns.
// Sibling PWAs need a document navigation; PTI routes stay in Angular.
export type LoginReturn = { path: string; fullPage: boolean };

export function safeLoginReturn(raw: string | null | undefined): LoginReturn {
  const fallback = { path: '/home', fullPage: false };
  if (!raw || raw.length > 2048 || !raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(raw)) return fallback;
  let decoded: string;
  try { decoded = decodeURIComponent(raw); } catch { return fallback; }
  // Reject layered encodings and URL/parser path normalization ambiguities.
  if (/%[0-9a-f]{2}/i.test(decoded) || /[\\\u0000-\u001f\u007f]/.test(decoded)) return fallback;
  const rawPath = raw.split(/[?#]/, 1)[0];
  const pathname = decodeURIComponent(rawPath);
  if (/[?#]/.test(pathname)) return fallback;
  if (pathname.startsWith('//') || pathname.split('/').some(part => part === '.' || part === '..') || /%2f|%5c/i.test(raw.split(/[?#]/, 1)[0])) return fallback;
  const sibling = /^\/one-piece(?:\/[^?#]*)?$/.test(pathname);
  const angular = /^\/(?:home|dashboard|new-dashboard|domains(?:\/[^/?#]+)?|activities|codex-command(?:\/projects\/[^/?#]+)?)\/?$/.test(pathname);
  if (!sibling && !angular) return fallback;
  return { path: raw, fullPage: sibling };
}

export function navigateAfterLogin(raw: string | null | undefined, router: { navigateByUrl(url: string): unknown }, location: Pick<Location, 'assign'> = window.location): void {
  const target = safeLoginReturn(raw);
  if (target.fullPage) location.assign(onePieceEntry(target.path));
  else router.navigateByUrl(target.path);
}

// Installed older Angular workers still treat a new sibling path as Angular navigation.
// Its supported bypass boots the child worker once; that worker removes this marker.
export function onePieceEntry(raw: string): string {
  const target = safeLoginReturn(raw);
  if (!target.fullPage) return '/home';
  const url = new URL(target.path, 'https://pti.invalid');
  if (url.pathname === '/one-piece') url.pathname += '/';
  url.searchParams.set('ngsw-bypass', 'true');
  return url.pathname + url.search + url.hash;
}
