// Device appearance is independent of account, progress and playback state.
export const THEME_KEY = 'one-piece-theme';
export function readTheme(storage) {
  try { return (storage ?? globalThis.localStorage)?.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}
export function applyTheme(theme, { document = globalThis.document, storage } = {}) {
  const value = theme === 'dark' ? 'dark' : 'light';
  try { (storage ?? globalThis.localStorage)?.setItem(THEME_KEY, value); } catch {}
  if (document) {
    document.documentElement.dataset.theme = value;
    document.documentElement.style.colorScheme = value;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value === 'dark' ? '#10141b' : '#f7f3eb');
    for (const button of document.querySelectorAll('[data-action="toggle-theme"]')) {
      const label = value === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      button.setAttribute('aria-pressed', String(value === 'dark'));
      const glyph = button.querySelector('[aria-hidden="true"]');
      if (glyph) glyph.textContent = value === 'dark' ? '☀' : '☾';
    }
  }
  return value;
}
