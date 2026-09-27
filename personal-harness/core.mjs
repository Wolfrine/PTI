/** Small, shared contracts. Never treat provider text as executable instructions. */
export const TOPICS = ['AI & agents', 'Science', 'Business', 'Robotics'];
export const DEFAULT_SETTINGS = { topics: TOPICS, direction: '', geography: 'balanced', itemCount: 5 };
export const REACTIONS = ['useful', 'known', 'less', 'explore'];
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
  const seen = new Set();
  const items = value.items.map(item => {
    if (!item || !TOPICS.includes(item.topic) || !['india', 'global'].includes(item.region)) throw new Error('Invalid topic or region.');
    for (const key of ['id', 'title', 'summary', 'why', 'source', 'publishedAt']) if (typeof item[key] !== 'string' || !item[key].trim()) throw new Error(`Missing ${key}.`);
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) || item.title.length > 300 || item.summary.length > 1600 || item.why.length > 800) throw new Error('Item is too large or has an invalid ID.');
    const url = canonicalUrl(item.url);
    if (!url || seen.has(url)) throw new Error('Invalid or duplicate source URL.');
    seen.add(url);
    const date = Date.parse(item.publishedAt);
    if (!Number.isFinite(date) || date > now + 300000) throw new Error('Invalid or future publication date.');
    return { id: item.id, topic: item.topic, region: item.region, title: item.title.trim(), summary: item.summary.trim(), why: item.why.trim(), source: item.source.trim().slice(0, 150), url, publishedAt: new Date(date).toISOString() };
  });
  return { items, method: value.method === 'agent-reviewed' ? 'agent-reviewed' : 'source-ranked', explanation: String(value.explanation || 'Selected from the configured sources.').slice(0, 1500), publishedAt: new Date(now).toISOString() };
}
export function selectEdition(candidates, settings, feedback = [], seenIds = [], now = Date.now()) {
  const wanted = validateSettings(settings); const rejected = new Set(feedback.filter(f => ['less','known'].includes(f.reaction)).map(f => f.itemId));
  const seen = new Set(seenIds); const byUrl = new Map(); const affinity = new Map();
  for (const f of feedback) if (f.source && ['useful', 'explore', 'less'].includes(f.reaction)) affinity.set(f.source, Math.max(-2, Math.min(2, (affinity.get(f.source) || 0) + (f.reaction === 'less' ? -1 : 1))));
  for (const c of candidates) {
    const url = canonicalUrl(c.url); const age = now - Date.parse(c.publishedAt);
    if (!url || !wanted.topics.includes(c.topic) || rejected.has(c.id) || seen.has(c.id) || age < -300000 || age > 7 * 86400000 || !Number.isFinite(age)) continue;
    if (!byUrl.has(url)) byUrl.set(url, { ...c, url, score: 20 - Math.max(0, age) / 86400000 + (affinity.get(c.source) || 0) });
  }
  const pool = [...byUrl.values()].sort((a,b) => b.score-a.score || a.id.localeCompare(b.id));
  const chosen = []; const pick = predicate => { const i = pool.findIndex(predicate); if (i < 0) return false; chosen.push(pool.splice(i,1)[0]); return true; };
  // Guarantee topic representation first. Geographic targets are explicit best-effort constraints.
  for (const t of wanted.topics) pick(c => c.topic === t);
  const targetRegion = wanted.geography === 'global' ? 'global' : 'india';
  const target = wanted.geography === 'balanced' ? 2 : 4;
  while (chosen.length < 5 && chosen.filter(c => c.region === targetRegion).length < target && pick(c => c.region === targetRegion)) {}
  while (chosen.length < 5 && pick(() => true)) {}
  if (chosen.length < 5) throw new Error('Fewer than five fresh, distinct items are available; previous edition retained.');
  for (let n = chosen.filter(c => c.region === targetRegion).length; n < target; n++) {
    const replacement = pool.find(c => c.region === targetRegion && chosen.some(x => x.region !== targetRegion && (x.topic === c.topic || chosen.filter(y => y.topic === x.topic).length > 1)));
    if (!replacement) break;
    const index = chosen.findIndex(x => x.region !== targetRegion && (x.topic === replacement.topic || chosen.filter(y => y.topic === x.topic).length > 1));
    chosen[index] = replacement; pool.splice(pool.indexOf(replacement), 1);
  }
  const missing = wanted.topics.filter(t => !chosen.some(c => c.topic === t));
  const actual = chosen.filter(c => c.region === targetRegion).length;
  return validateEdition({ items: chosen, method: 'source-ranked', explanation: `Source-ranked edition, not an AI-written briefing. Topic balance comes first; explicit source feedback adjusts selection within it. ${actual}/5 items have a ${targetRegion === 'india' ? 'India-focused' : 'global'} source scope.${missing.length ? ` No fresh candidate for: ${missing.join(', ')}.` : ''}${actual < target ? ' Geographic target could not be met with available sources.' : ''} Free-text directions are reserved for an external reviewing agent, not interpreted by this collector.` }, now);
}
