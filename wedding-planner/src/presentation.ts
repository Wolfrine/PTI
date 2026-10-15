import { escapeHtml as esc } from './model';
export const leaf =
  '<svg class="leaf" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M13 41 33 6M18 31C7 27 11 19 11 19c10 0 12 6 7 12ZM24 22c-2-10 7-13 7-13 5 8 2 13-7 13ZM25 22c12 1 14-8 14-8-9-4-14 0-14 8ZM19 32c11 3 14-5 14-5-8-5-13-2-14 5Z" stroke="currentColor" stroke-width="1.2"/></svg>';
export function icon(kind: string) {
  const p: Record<string, string> = {
    food: '<path d="M5 5v8c0 4 6 4 6 0V5M8 5v22M21 5c-6 3-6 13 0 13h3M24 5v22"/>',
    guests:
      '<circle cx="12" cy="10" r="4"/><circle cx="23" cy="12" r="3"/><path d="M4 27v-4c0-7 16-7 16 0v4ZM21 19c6-2 9 3 7 8h-5"/>',
    stay: '<path d="M4 10v18M28 10v18M4 23h24M4 15h24v8M8 15v-4h7v4M18 15v-4h6v4"/>',
    tasks:
      '<rect x="7" y="6" width="19" height="23" rx="2"/><path d="M12 6V3h8v3M11 15l3 3 6-7M11 23h10"/>',
    calendar:
      '<rect x="5" y="7" width="22" height="21" rx="2"/><path d="M11 3v8M21 3v8M5 14h22M11 20h2M19 20h2"/>',
    lock: '<rect x="7" y="14" width="18" height="15" rx="2"/><path d="M11 14V9a5 5 0 0 1 10 0v5M16 20v4"/>',
    note: '<path d="M7 4h13l6 6v19H7ZM19 4v7h7M11 17h10M11 22h8"/>',
  };
  return `<svg class="ui-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true">${p[kind] || p.note}</svg>`;
}
export const brand = (href: string) =>
  `<a class="brand" href="${href}" aria-label="Mahima and Mayank"><span>M</span>${leaf}<span>M</span></a>`;
export const badge = (s: string) =>
  `<span class="status status-${esc(s)}">${s === 'unresolved' ? 'Open' : esc(s)}</span>`;
export function menuMarkup(text: string) {
  if (!text.trim())
    return '<p class="empty-inline">The menu is still to be planned.</p>';
  const blocks = text.trim().split(/\n\s*\n/);
  const groups =
    blocks.length > 1
      ? blocks.map((b) => {
          const a = b.split('\n');
          return a.length > 1
            ? `<section class="menu-group"><h3>${esc(a[0])}</h3><p>${esc(a.slice(1).join('\n'))}</p></section>`
            : `<p class="menu-note">${esc(b)}</p>`;
        })
      : text
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const i = line.indexOf(':');
            return i > 0 && i < 70
              ? `<section class="menu-group"><h3>${esc(line.slice(0, i))}</h3><p>${esc(line.slice(i + 1).trim())}</p></section>`
              : `<p class="menu-note">${esc(line)}</p>`;
          });
  return `<div class="menu-groups">${groups.join('')}</div>`;
}
