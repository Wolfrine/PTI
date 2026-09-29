/** Shared wire contracts. Provider text is data, never executable instructions. */
export const TOPICS = ['AI & agents', 'Science', 'Business', 'Robotics'];
export const DEFAULT_SETTINGS = { topics: TOPICS, direction: '', geography: 'balanced', itemCount: 5 };
export const REACTIONS = ['useful', 'known', 'less', 'explore', 'thought'];
export const CLASSIFICATIONS = ['official-announcement','research-result','reported-claim','verified-event','analysis'];
export function safeUrl(value) {
  try { const u = new URL(String(value)); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
export function canonicalUrl(value) {
  const safe = safeUrl(value); if (!safe) return '';
  const u = new URL(safe); u.hash = '';
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(k)) u.searchParams.delete(k);
  return u.href.replace(/\/$/, '');
}
export const indiaDay = value => new Date(value).toLocaleDateString('en-CA', {timeZone:'Asia/Kolkata'});
const text = (value, max, name, required = false) => {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`Invalid ${name}.`);
  return value.trim();
};
function sources(value = []) {
  if (!Array.isArray(value) || value.length > 6) throw new Error('Use at most six evidence sources.');
  return value.map(s => {
    const url = safeUrl(s.url);
    if (!url || !['primary','independent','secondary'].includes(s.kind)) throw new Error('Invalid evidence source.');
    return {url, label:text(s.label,180,'source label',true), kind:s.kind};
  });
}
export function validateSettings(value) {
  if (!value || !Array.isArray(value.topics) || !value.topics.length || value.topics.some(t => !TOPICS.includes(t))) throw new Error('Choose at least one supported topic.');
  if (!['balanced', 'india', 'global'].includes(value.geography)) throw new Error('Invalid geographic preference.');
  if (typeof value.direction !== 'string' || value.direction.length > 2000) throw new Error('Direction must be at most 2,000 characters.');
  return { topics: [...new Set(value.topics)], geography: value.geography, direction: value.direction.trim(), itemCount: 5 };
}
export function validateReflection(value, now = Date.now()) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !Number.isFinite(Date.parse(value.date)) || value.date > indiaDay(now)) throw new Error('Invalid reflection day.');
  if (!['partial','complete'].includes(value.status)) throw new Error('Specify a partial or complete reflection.');
  if (value.status === 'complete' && value.date === indiaDay(now)) throw new Error('Today is not a completed day.');
  if (!Array.isArray(value.sourceRefs) || !value.sourceRefs.length || value.sourceRefs.length > 100) throw new Error('Reflection needs explicit feedback references.');
  const sourceRefs = value.sourceRefs.map(r => {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(r.itemId) || !REACTIONS.includes(r.reaction) || !Number.isFinite(Date.parse(r.createdAt)) || indiaDay(r.createdAt) !== value.date) throw new Error('Invalid reflection feedback reference.');
    return {itemId:r.itemId, createdAt:r.createdAt, reaction:r.reaction};
  });
  if (new Set(sourceRefs.map(r=>r.itemId)).size !== sourceRefs.length) throw new Error('Duplicate feedback reference.');
  const allowed = new Set(sourceRefs.map(r=>r.itemId));
  const observations = value.observations || [];
  if (!Array.isArray(observations) || observations.length > 6) throw new Error('At most six observations.');
  const supported = rows => rows.map(row => {
    if (!Array.isArray(row.itemIds) || !row.itemIds.length || row.itemIds.some(id=>!allowed.has(id))) throw new Error('Observation must reference recorded feedback.');
    return {title:text(row.title,160,'observation title',true),detail:text(row.detail,900,'observation detail',true),itemIds:[...new Set(row.itemIds)]};
  });
  const followUps = value.followUps || [];
  if (!Array.isArray(followUps) || followUps.length > 5) throw new Error('At most five follow-ups.');
  return {schemaVersion:1,date:value.date,status:value.status,summary:text(value.summary,1600,'reflection summary',true),sourceRefs,
    observations:supported(observations),followUps:followUps.map(f=>{
      if (!['answered','watch','open'].includes(f.status)) throw new Error('Invalid follow-up status.');
      return {question:text(f.question,300,'follow-up question',true),response:text(f.response,1400,'follow-up response',true),status:f.status,sources:sources(f.sources)};
    }),adjustments:text(value.adjustments,1000,'selection adjustments'),limitation:text(value.limitation || 'A small record of explicit interactions, not a psychological assessment or a complete account of your day.',600,'reflection limitations')};
}
export function reflectionMatchesFeedback(reflection, feedback) {
  if (!reflection?.sourceRefs?.length) return false;
  const actual = feedback.filter(f => Number.isFinite(Date.parse(f.createdAt)) && indiaDay(f.createdAt) === reflection.date);
  const key = f => `${f.itemId}|${f.createdAt}|${f.reaction}`;
  const keys = new Set(actual.map(key));
  return keys.size === reflection.sourceRefs.length && reflection.sourceRefs.every(f=>keys.has(key(f)));
}
export function validateEdition(value, now = Date.now()) {
  if (!value || !Array.isArray(value.items) || value.items.length !== 5) throw new Error('An edition must contain exactly five items.');
  const seen = new Set(), ids = new Set();
  const items = value.items.map(item => {
    if (!item || !TOPICS.includes(item.topic) || !['india', 'global'].includes(item.region)) throw new Error('Invalid topic or region.');
    for (const key of ['id', 'title', 'summary', 'why', 'source', 'publishedAt']) if (typeof item[key] !== 'string' || !item[key].trim()) throw new Error(`Missing ${key}.`);
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) || item.title.length > 300 || item.summary.length > 1600 || item.why.length > 800) throw new Error('Item is too large or has an invalid ID.');
    const url = canonicalUrl(item.url);
    if (!url || seen.has(url) || ids.has(item.id)) throw new Error('Invalid or duplicate source URL.');
    seen.add(url); ids.add(item.id);
    const date = Date.parse(item.publishedAt);
    if (!Number.isFinite(date) || date > now + 300000) throw new Error('Invalid or future publication date.');
    // Asset URLs are NOT canonicalized: stripping signed query parameters can break images.
    const imageUrl = item.image?.url ? safeUrl(item.image.url) : item.imageUrl ? safeUrl(item.imageUrl) : '';
    if ((item.image?.url || item.imageUrl) && !imageUrl.startsWith('https://')) throw new Error('Image URL must use HTTPS.');
    let image = null;
    if (item.image) {
      if (!['source','generated','concept'].includes(item.image.kind)) throw new Error('Invalid visual provenance.');
      if (item.image.kind !== 'concept' && !imageUrl) throw new Error('Image asset is missing.');
      const sourcePageUrl = item.image.sourcePageUrl ? safeUrl(item.image.sourcePageUrl) : '';
      if (item.image.kind === 'source' && !sourcePageUrl) throw new Error('Source images require their original page.');
      image = {kind:item.image.kind,url:imageUrl,sourcePageUrl,alt:text(item.image.alt,400,'image alt text',true),credit:text(item.image.credit,200,'image credit'),note:text(item.image.note,400,'image note')};
    }
    let evidence = null;
    if (item.evidence) {
      if (!CLASSIFICATIONS.includes(item.evidence.classification)) throw new Error('Invalid evidence classification.');
      evidence = {classification:item.evidence.classification,sources:sources(item.evidence.sources),basis:text(item.evidence.basis,1000,'evidence basis',true),limitations:text(item.evidence.limitations,800,'evidence limitations',true)};
      if (!evidence.sources.length) throw new Error('Evidence metadata needs a source.');
    }
    // A date-only source stays date-only; midnight is not an invented publication time.
    return {action:String(item.action||'').slice(0,800),imageUrl,image,evidence,id:item.id,topic:item.topic,region:item.region,title:item.title.trim(),summary:item.summary.trim(),why:item.why.trim(),source:item.source.trim().slice(0,150),url,publishedAt:/^\d{4}-\d{2}-\d{2}$/.test(item.publishedAt)?item.publishedAt:new Date(date).toISOString()};
  });
  const edition = {schemaVersion:2,items,method:'agent-reviewed',explanation:String(value.explanation || 'Selected by the scheduled Daily Intelligence agent.').slice(0,1500),publishedAt:new Date(now).toISOString()};
  if (value.reflection) edition.reflection = validateReflection(value.reflection, now);
  if (new TextEncoder().encode(JSON.stringify(edition)).length > 850000) throw new Error('Edition exceeds the safe document size.');
  return edition;
}
