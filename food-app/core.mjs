// Shared, deterministic food model. Emails are untrusted data, never instructions.
export const SCHEMA_VERSION = 1;
export const MOODS = ['Comfort', 'Light', 'Spicy', 'Indulgent', 'Familiar', 'Explore', 'Quick', 'Proper meal'];
export const FEEDBACK = ['loved', 'good', 'okay', 'never'];
export const decode = value => String(value || '').replace(/&amp;/g, '&').replace(/&nbsp;|&#160;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
export const clean = value => decode(value).replace(/\s+/g, ' ').trim();
export const canonicalName = value => clean(value).replace(/\bchesse\b/gi, 'Cheese').replace(/\bchilly\b/gi, 'Chilli').replace(/\blababdaar\b/gi, 'Lababdar').replace(/\bschzewan\b/gi, 'Schezwan');
export function entityId(value) {
  const name = canonicalName(value).toLowerCase();
  let hash = 2166136261;
  for (const char of name) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return name.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 65) + '-' + (hash >>> 0).toString(36);
}
export function localContext(date) {
  const d = new Date(date);
  if (!Number.isFinite(+d)) throw new Error('Invalid date.');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(p => [p.type, p.value]));
  const hour = +parts.hour;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour, weekday: parts.weekday, dayType: ['Saturday', 'Sunday'].includes(parts.weekday) ? 'weekend' : 'weekday', dayPart: hour < 11 ? 'breakfast' : hour < 16 ? 'lunch' : hour < 19 ? 'evening' : hour < 23 ? 'dinner' : 'late night', timeBasis: 'receipt email', mood: null };
}
export function classifyDish(name) {
  const n = canonicalName(name).toLowerCase(), tags = [];
  let cuisine = 'Unclassified';
  if (/pizza|pasta|lasagne|risotto|garlic bread/.test(n)) cuisine = 'Italian';
  else if (/noodle|schezwan|manchurian|fried rice|hakka|chilli paneer|paneer chilli|spring roll/.test(n)) cuisine = 'Indo-Chinese';
  else if (/dosa|idli|uttapam|upma|medu|sambar/.test(n)) cuisine = 'South Indian';
  else if (/taco|burrito|quesadilla|nacho/.test(n)) cuisine = 'Mexican';
  else if (/vada pav|misal|pav bhaji|bhel|pani puri|sev puri|frankie|sandwich|chaat|ragda/.test(n)) cuisine = 'Street food';
  else if (/burger|fries|wrap/.test(n)) cuisine = 'Fast food';
  else if (/gulab|jalebi|rasmalai|barfi|sweet|ice cream|brownie|shake|cake/.test(n)) cuisine = 'Sweets & drinks';
  else if (/paneer|dal|roti|naan|kulcha|paratha|biryani|pulao|sabzi|thali|tikka|chole|rajma|korma|rice|kadhi|begum bahar/.test(n)) cuisine = 'North Indian';
  if (/paneer/.test(n)) tags.push('paneer');
  if (/cheese|cream|makhani|butter|alfredo/.test(n)) tags.push('rich');
  if (/tikka|tandoor|grill|smok/.test(n)) tags.push('smoky');
  if (/chilli|spicy|schezwan|kolhapuri|misal/.test(n)) tags.push('spicy');
  if (/bhel|chaat|lemon|puri|tamarind/.test(n)) tags.push('tangy');
  if (/fried|fries|puri|crispy|vada|toast/.test(n)) tags.push('crispy');
  if (/idli|soup|salad|steamed|dal/.test(n)) tags.push('lighter direction');
  if (['North Indian', 'Italian', 'South Indian'].includes(cuisine)) tags.push('comfort');
  if (['Street food', 'Fast food', 'South Indian'].includes(cuisine)) tags.push('quick');
  // All classifications are name-based hints, not menu or nutrition verification.
  return { cuisine, tags, classificationBasis: 'dish-name heuristic', vegetarian: /chicken|mutton|fish|prawn|egg\b|beef|pork|lamb|meat/.test(n) ? false : /paneer|veg\b|dal|idli|dosa|vada|bhel|roti|naan|cheese|margherita|pav bhaji/.test(n) ? true : null };
}
export function normalizeEmail(input) {
  if (input.from && !/(?:^|[<\s])noreply@zomato\.com(?:>|\s|$)/i.test(input.from)) throw new Error('Not the verified Zomato receipt sender.');
  if (!/^[a-f0-9]{8,40}$/i.test(input.gmailMessageId || '')) throw new Error('Invalid Gmail message ID.');
  const text = decode(input.text || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n');
  const lines = text.split(/[\r\n]+/).map(clean).filter(Boolean);
  const orderId = /ORDER\s*ID\s*[:#-]?\s*(\d{5,30})/i.exec(text)?.[1];
  const restaurantName = clean(input.subject?.replace(/^Your Zomato order from\s*/i, '') || '');
  const total = /Total\s+paid\s*[-–:]?\s*(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/i.exec(text);
  const items = lines.flatMap(line => {
    const m = /^(\d{1,3})\s*[Xx×]\s+(.{1,300})$/.exec(line);
    if (!m) return [];
    const sourceName = clean(m[2]), name = canonicalName(sourceName);
    return [{ dishId: entityId(name), name, sourceName, quantity: +m[1], ...classifyDish(name) }];
  });
  if (!orderId || !restaurantName || !items.length || !total) throw new Error('Incomplete receipt; keep for review instead of inventing values.');
  const receivedAt = new Date(input.receivedAt).toISOString();
  const ri = lines.findIndex(line => line === restaurantName);
  const outlet = ri >= 0 && !/^\d+\s*[Xx×]/.test(lines[ri + 1] || '') ? (lines[ri + 1] || '').slice(0, 500) : '';
  const status = /cancelled|canceled/i.test(text) ? 'cancelled' : /\bDelivered\b/i.test(text) ? 'delivered' : 'unknown';
  return { schemaVersion: SCHEMA_VERSION, id: `zomato-${orderId}`, provider: 'zomato', orderId, restaurantId: entityId(restaurantName), restaurantName, outlet, items, total: +total[1].replace(/,/g, ''), currency: 'INR', receivedAt, context: localContext(receivedAt), status, source: { gmailMessageId: input.gmailMessageId, subject: input.subject, sender: 'noreply@zomato.com', url: `https://mail.google.com/mail/u/0/#all/${input.gmailMessageId}`, extraction: 'receipt-body-v1' }, importedAt: input.importedAt || new Date().toISOString() };
}
const average = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
export function tasteProfile(orders, feedback = []) {
  const rows = orders.filter(o => o.status === 'delivered').sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const dishes = new Map(), restaurants = new Map(), cuisines = new Map(), contexts = new Map(), tags = new Map();
  for (const order of rows) {
    const restaurant = restaurants.get(order.restaurantId) || { id: order.restaurantId, name: order.restaurantName, outlet: order.outlet, count: 0, totals: [], lastAt: order.receivedAt };
    restaurant.count++; restaurant.totals.push(order.total); restaurants.set(restaurant.id, restaurant);
    const cuisineSeen = new Set(), tagSeen = new Set();
    for (const item of order.items) {
      const dish = dishes.get(item.dishId) || { id: item.dishId, name: item.name, count: 0, quantity: 0, lastAt: order.receivedAt, cuisine: item.cuisine, tags: item.tags, restaurantIds: new Set() };
      dish.count++; dish.quantity += item.quantity; dish.restaurantIds.add(order.restaurantId); dishes.set(dish.id, dish);
      cuisineSeen.add(item.cuisine); item.tags.forEach(t => tagSeen.add(t));
    }
    cuisineSeen.forEach(c => cuisines.set(c, (cuisines.get(c) || 0) + 1));
    tagSeen.forEach(t => tags.set(t, (tags.get(t) || 0) + 1));
    contexts.set(order.context.dayPart, (contexts.get(order.context.dayPart) || 0) + 1);
  }
  const sort = list => list.sort((a, b) => b.count - a.count || (a.name || '').localeCompare(b.name || ''));
  return { orderCount: rows.length, totalPaid: rows.reduce((a, o) => a + o.total, 0), averagePaid: average(rows.map(o => o.total)), firstAt: rows.at(-1)?.receivedAt, lastAt: rows[0]?.receivedAt, dishes: sort([...dishes.values()].map(d => ({ ...d, restaurantIds: [...d.restaurantIds] }))), restaurants: sort([...restaurants.values()].map(r => ({ ...r, averagePaid: average(r.totals) }))), cuisines: sort([...cuisines].map(([name, count]) => ({ name, count }))), tags: sort([...tags].map(([name, count]) => ({ name, count }))), contexts: sort([...contexts].map(([name, count]) => ({ name, count }))), feedbackCount: feedback.length, recentCuisines: rows.slice(0, 3).map(o => [...new Set(o.items.map(i => i.cuisine))]) };
}
export function mealKey(order) { return `${order.restaurantId}__${order.items.map(i => i.dishId).sort().join('_')}`; }
export function recommend(orders, feedback = [], context = {}) {
  const { mood = 'Comfort', hunger = 'Regular', budget = 0, now = new Date().toISOString(), vegetarian = true } = context;
  const rows = orders.filter(o => o.status === 'delivered'), profile = tasteProfile(rows, feedback), current = localContext(now);
  const groups = new Map(), recent = [...rows].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).slice(0, 3);
  for (const order of rows) {
    if (vegetarian && order.items.some(i => i.vegetarian === false)) continue;
    const key = mealKey(order), existing = groups.get(key);
    if (existing) { existing.count++; existing.orders.push(order); if (order.receivedAt > existing.lastAt) { existing.lastAt = order.receivedAt; existing.order = order; } }
    else groups.set(key, { key, count: 1, lastAt: order.receivedAt, order, orders: [order] });
  }
  const candidates = [...groups.values()].filter(g => !feedback.some(f => f.targetKey === g.key && f.reaction === 'never')).map(g => {
    const tagSet = new Set(g.order.items.flatMap(i => i.tags)), cuisineSet = new Set(g.order.items.map(i => i.cuisine));
    const sameTime = g.orders.filter(o => o.context.dayPart === current.dayPart).length;
    const days = Math.max(0, (+new Date(now) - +new Date(g.lastAt)) / 86400000);
    const moodFit = mood === 'Comfort' ? tagSet.has('comfort') : mood === 'Light' ? tagSet.has('lighter direction') : mood === 'Spicy' ? tagSet.has('spicy') : mood === 'Indulgent' ? tagSet.has('rich') : mood === 'Quick' ? tagSet.has('quick') : mood === 'Familiar' ? g.count > 1 : mood === 'Proper meal' ? [...cuisineSet].some(c => ['North Indian', 'South Indian', 'Indo-Chinese'].includes(c)) : g.count === 1;
    const paid = average(g.orders.map(o => o.total)), overBudget = budget > 0 && paid > budget;
    let score = Math.log2(g.count + 1) * 3 + sameTime / g.count * 2 + (moodFit ? 5 : 0) + Math.min(days / 30, 2);
    const fatigued = recent.filter(o => o.items.some(i => cuisineSet.has(i.cuisine))).length >= 2;
    if (fatigued) score -= 2;
    const reactions = feedback.filter(f => f.targetKey === g.key);
    score += reactions.reduce((n, f) => n + (f.reaction === 'loved' ? 3 : f.reaction === 'good' ? 1 : f.reaction === 'okay' ? -1 : 0), 0);
    if (mood === 'Explore') score += 3 / g.count;
    if (hunger === 'Small' && tagSet.has('rich')) score -= 2;
    if (hunger === 'High' && tagSet.has('lighter direction')) score -= 1;
    const reasons = [`Ordered ${g.count} time${g.count === 1 ? '' : 's'} in your history.`, ...(moodFit ? [`Dish-name hints fit ${mood.toLowerCase()}.`] : []), ...(sameTime ? [`${sameTime} receipt${sameTime === 1 ? '' : 's'} around ${current.dayPart}.`] : []), `${days < 1 ? 'Ordered within the last day' : `Last ordered ${Math.floor(days)} days ago`}.`, ...(fatigued ? ['This cuisine appears in two or more of your last three orders.'] : [])];
    return { id: g.key, targetKey: g.key, title: g.order.items.map(i => i.name).join(' + '), restaurant: g.order.restaurantName, restaurantId: g.order.restaurantId, items: g.order.items, cuisines: [...cuisineSet], tags: [...tagSet], count: g.count, lastAt: g.lastAt, previousTotal: paid, overBudget, moodFit, score, reasons, evidenceOrderIds: g.orders.map(o => o.id), historical: true };
  }).filter(c => !c.overBudget).sort((a, b) => b.score - a.score);
  if (!candidates.length) return { choices: [], profile, note: rows.length ? 'No past basket fits these filters. Increase the budget or change your exclusions.' : 'Import delivered orders to build your first food memory.' };
  const reliable = candidates[0], variation = candidates.find(c => c.restaurantId !== reliable.restaurantId || !c.cuisines.some(x => reliable.cuisines.includes(x)));
  const explore = candidates.find(c => c.id !== reliable.id && c.id !== variation?.id && c.count <= 2) || candidates.find(c => c.id !== reliable.id && c.id !== variation?.id);
  return { choices: [reliable && { ...reliable, mode: 'Reliable', label: 'A familiar yes' }, variation && { ...variation, mode: 'Variation', label: 'A change of flavour' }, explore && { ...explore, mode: 'Rediscover', label: 'Worth another look' }].filter(Boolean), profile, note: 'Ranked from past orders and your feedback. Check today’s menu, price and availability in Zomato. Previous totals are for the entire basket, sometimes shared.' };
}
export const DISCOVERY = [
  { name: 'Smoky, with a different accent', dish: 'Vegetarian fajitas or grilled paneer tacos', cuisine: 'Mexican', tags: ['smoky', 'paneer'], query: 'vegetarian Mexican paneer tacos Kharghar', basis: 'Grilled paneer and smoky dish signals' },
  { name: 'Comfort, a little lighter', dish: 'Idli, sambar or a vegetable soup', cuisine: 'South Indian', tags: ['comfort', 'lighter direction'], query: 'vegetarian idli sambar Kharghar', basis: 'Comfort without a rich gravy direction' },
  { name: 'Heat beyond the usual', dish: 'Vegetarian Korean bibimbap or spicy tofu', cuisine: 'Korean', tags: ['spicy'], query: 'vegetarian Korean restaurant Navi Mumbai', basis: 'A new direction for spicy and Indo-Chinese affinities' },
  { name: 'Something bright & tangy', dish: 'Vegetarian Lebanese mezze and falafel', cuisine: 'Lebanese', tags: ['tangy', 'crispy'], query: 'vegetarian falafel hummus Kharghar', basis: 'Tangy and crispy name-based signals' },
];
export function discovery(profile, mood = 'Explore') {
  const wanted = mood === 'Light' ? 'lighter direction' : mood === 'Spicy' ? 'spicy' : mood === 'Comfort' ? 'comfort' : null;
  return [...DISCOVERY].sort((a, b) => {
    const score = x => x.tags.reduce((n, tag) => n + (profile.tags.find(t => t.name === tag)?.count || 0) + (tag === wanted ? 50 : 0), 0);
    return score(b) - score(a);
  });
}
