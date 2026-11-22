// One allowlist for both popup and existing-session login returns.
// Sibling PWAs need a document navigation; PTI routes stay in Angular.
export type LoginReturn = { path: string; fullPage: boolean };

const financePath = /^\/finance(?:\/(overview|transactions|accounts|income|investments|debts|reports|review|sources))?\/?$/;

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
  const sibling = /^\/one-piece(?:\/[^?#]*)?$/.test(pathname) || financePath.test(pathname);
  if (/^\/(?:dashboard|new-dashboard|codex-command(?:\/projects\/[^/?#]+)?)\/?$/.test(pathname)) return fallback;
  const angular = /^\/(?:home|intelligence|domains(?:\/[^/?#]+)?|activities|new-local-infrastructure)\/?$/.test(pathname);
  if (!sibling && !angular) return fallback;
  return { path: raw, fullPage: sibling };
}

export function navigateAfterLogin(raw: string | null | undefined, router: { navigateByUrl(url: string): unknown }, location: Pick<Location, 'assign'> = window.location): void {
  const target = safeLoginReturn(raw);
  if (target.fullPage) location.assign(siblingLoginAlias(target.path) ?? '/home');
  else router.navigateByUrl(target.path);
}

export function siblingLoginAlias(raw: string | null | undefined): string | null {
  const target = safeLoginReturn(raw);
  if (!target.fullPage) return null;
  const source = new URL(target.path, 'https://pti.invalid');
  const finance = financePath.exec(decodeURIComponent(source.pathname));
  if (!finance) return onePieceLoginAlias(raw);
  const destination = new URL('https://pti-app-2ab59-finance.web.app/');
  const month = source.searchParams.get('month');
  const range = /^20\d{2}-(0[1-9]|1[0-2])$/.test(month ?? '') ? `?month=${month}` : '';
  if (finance[1] || range) destination.hash = (finance[1] ?? 'overview') + range;
  return destination.href;
}

// Legacy PTI /login bookmarks go directly to the one native One Piece sign-in.
// Carry viewing intent only; authentication remains on the destination origin.
export function onePieceLoginAlias(raw: string | null | undefined): string | null {
  const target = safeLoginReturn(raw);
  if (!target.fullPage) return null;
  const source = new URL(target.path, 'https://pti.invalid');
  if (!/^\/one-piece(?:\/[^?#]*)?$/.test(decodeURIComponent(source.pathname))) return null;
  const destination = new URL('/one-piece/', 'https://pti-app-2ab59-one-piece.web.app');
  const episode = source.searchParams.get('episode') ?? source.pathname.match(/\/watch\/(\d{1,4}|one-piece-\d{4})$/)?.[1];
  if (/^(?:\d{1,4}|one-piece-\d{4})$/.test(episode ?? '')) {
    const number = Number(episode!.replace('one-piece-', ''));
    if (number >= 1 && number <= 1085) destination.searchParams.set('episode', episode!);
  }
  const from = source.searchParams.get('from'), range = source.searchParams.get('range');
  if (/^(?:continue|library|watch|bookmark)$/.test(from ?? '')) destination.searchParams.set('from', from!);
  if (/^\d{1,4}$/.test(range ?? '') && Number(range) >= 1 && Number(range) <= 1085) destination.searchParams.set('range', range!);
  if (/^#(?:player|main-content|episodes|episode-\d{1,4})$/.test(source.hash)) destination.hash = source.hash;
  return destination.href;
}

// Backward-compatible export for older AuthService return handlers.
export function onePieceEntry(raw: string): string {
  return onePieceLoginAlias(raw) ?? '/home';
}
