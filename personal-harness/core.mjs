/** Small, shared contracts. Never treat provider text as executable instructions. */
export const TOPICS = ['AI & agents', 'Science', 'Business', 'Robotics'];
export const DEFAULT_SETTINGS = { topics: TOPICS, direction: '', geography: 'balanced', itemCount: 5 };
export const REACTIONS = ['useful', 'known', 'less', 'explore', 'thought'];
export function safeUrl(value) {
  try { const u = new URL(String(value)); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
export function canonicalUrl(value) {
  const safe = safeUrl(value); if (!safe) return '';
  const u = new URL(safe); u.hash = '';
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(k)) u.searchParams.delete(k);
  return u.href.replace(/\/$/, '');
}
export function validateSettings(value) {
  if (!value || !Array.isArray(value.topics) || !value.topics.length || value.topics.some(t => !TOPICS.includes(t))) throw new Error('Choose at least one supported topic.');
  if (!['balanced', 'india', 'global'].includes(value.geography)) throw new Error('Invalid geographic preference.');
  if (typeof value.direction !== 'string' || value.direction.length > 2000) throw new Error('Direction must be at most 2,000 characters.');
  return { topics: [...new Set(value.topics)], geography: value.geography, direction: value.direction.trim(), itemCount: 5 };
}
export function validateEdition(value, now = Date.now()) {
  if (!value || !Array.isArray(value.items) || value.items.length !== 5) throw new Error('An edition must contain exactly five items.');
  const seen = new Set(); const ids = new Set();
  const items = value.items.map(item => {
    if (!item || !TOPICS.includes(item.topic) || !['india', 'global'].includes(item.region)) throw new Error('Invalid topic or region.');
    for (const key of ['id', 'title', 'summary', 'why', 'source', 'publishedAt']) if (typeof item[key] !== 'string' || !item[key].trim()) throw new Error(`Missing ${key}.`);
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) || item.title.length > 300 || item.summary.length > 1600 || item.why.length > 800) throw new Error('Item is too large or has an invalid ID.');
    const url = canonicalUrl(item.url);
    if (!url || seen.has(url) || ids.has(item.id)) throw new Error('Invalid or duplicate source URL.');
    seen.add(url); ids.add(item.id);
    const date = Date.parse(item.publishedAt);
    if (!Number.isFinite(date) || date > now + 300000) throw new Error('Invalid or future publication date.');
    const action=String(item.action||'').slice(0,800),imageUrl=item.imageUrl?canonicalUrl(item.imageUrl):'';
    if(item.imageUrl&&(!imageUrl||!imageUrl.startsWith('https://')))throw new Error('Image URL must use HTTPS.');
    return { action,imageUrl,id: item.id, topic: item.topic, region: item.region, title: item.title.trim(), summary: item.summary.trim(), why: item.why.trim(), source: item.source.trim().slice(0, 150), url, publishedAt: new Date(date).toISOString() };
  });
  return { items, method: 'agent-reviewed', explanation: String(value.explanation || 'Selected by the scheduled Daily Intelligence agent.').slice(0, 1500), publishedAt: new Date(now).toISOString() };
}
