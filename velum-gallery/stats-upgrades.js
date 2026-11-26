(() => {
  const DB_NAME = 'velum-local';
  const STORE_NAME = 'events';
  const SESSION_GAP = 10 * 60 * 1000;
  const DAY = 24 * 60 * 60 * 1000;
  const RANGE_OPTIONS = [
    { key: 'today', label: 'Today', ms: 0 },
    { key: '7d', label: '7 days', ms: 7 * DAY },
    { key: '30d', label: '30 days', ms: 30 * DAY },
    { key: 'all', label: 'All', ms: Infinity }
  ];
  let selectedRange = localStorage.getItem('velum-stats-range') || '7d';
  let renderToken = 0;
  let privacyEpoch = 0;
  let dbPromise = null;
  let getCollection = () => null;
  let openMedia = () => false;
  let favoriteKind = 'liked';
  let returnTarget = null;

  const style = document.createElement('style');
  style.textContent = `
    .stats-view{overflow:auto;touch-action:pan-y;padding:calc(76px + var(--safe-top)) 14px calc(34px + var(--safe-bottom));background:radial-gradient(110% 52% at 50% 0%,#211219 0%,#0c080a 58%,#080607 100%)}
    .stats-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;padding:0 4px 14px}.stats-head h1{font:400 31px/1 Georgia,serif;margin:6px 0 0;letter-spacing:-.02em}.stats-copy{height:36px;padding:0 13px;border-radius:999px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.055);color:#dfd2d6;font-size:10px;letter-spacing:.08em;text-transform:uppercase;display:flex;align-items:center;gap:7px}.stats-copy svg{width:15px;height:15px}.stats-copy.copied{background:rgba(90,56,67,.6);color:#fff}
    .stats-ranges{display:flex;gap:6px;padding:0 4px 15px;overflow:auto;scrollbar-width:none}.stats-ranges::-webkit-scrollbar{display:none}.stats-range{flex:0 0 auto;padding:8px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.075);background:rgba(255,255,255,.025);color:#807477;font-size:10px}.stats-range.active{background:#eadde1;color:#281a20;border-color:transparent}
    .stats-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.stat-card{min-height:92px;padding:14px;border-radius:17px;border:1px solid rgba(255,255,255,.07);background:linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.018));box-shadow:0 10px 30px rgba(0,0,0,.13)}.stat-card strong{display:block;font:400 26px/1.08 Georgia,serif;color:#f3e8eb;letter-spacing:-.02em}.stat-card span{display:block;margin-top:7px;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#827579}.stat-card small{display:block;margin-top:5px;color:#61575a;font-size:9px;line-height:1.3}
    .stats-section{margin-top:12px;padding:15px;border-radius:20px;border:1px solid rgba(255,255,255,.065);background:rgba(14,9,11,.66)}.stats-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:13px}.stats-section h2{margin:0;font:400 18px/1.15 Georgia,serif;color:#eee1e5}.stats-section-head span,.stats-note{font-size:9px;line-height:1.45;color:#776b6f}.stats-section-head span{text-align:right;max-width:44%}
    .activity-chart{height:102px;display:flex;align-items:flex-end;gap:4px;padding:7px 0 18px;position:relative}.activity-bar-wrap{height:100%;flex:1;min-width:4px;display:flex;align-items:flex-end;position:relative}.activity-bar{width:100%;min-height:2px;border-radius:5px 5px 2px 2px;background:linear-gradient(to top,rgba(122,70,89,.75),rgba(214,178,162,.9));opacity:.82}.activity-bar-wrap.today .activity-bar{opacity:1}.activity-bar-wrap i{position:absolute;left:50%;bottom:-15px;transform:translateX(-50%);font-style:normal;font-size:7px;color:#62575b;white-space:nowrap}.activity-bar-wrap:not(.label) i{display:none}
    .heatmap{display:grid;grid-template-columns:repeat(14,1fr);gap:4px}.heat{aspect-ratio:1;border-radius:4px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.025)}.heat.l1{background:rgba(122,70,89,.22)}.heat.l2{background:rgba(122,70,89,.38)}.heat.l3{background:rgba(173,109,128,.56)}.heat.l4{background:rgba(214,178,162,.78)}
    .coverage-row{display:flex;align-items:center;justify-content:space-between;gap:12px}.coverage-main strong{font:400 30px/1 Georgia,serif}.coverage-main span{display:block;margin-top:5px;font-size:9px;color:#74696c;text-transform:uppercase;letter-spacing:.11em}.coverage-ring{--p:0;width:72px;height:72px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#d6b2a2 calc(var(--p)*1%),rgba(255,255,255,.065) 0)}.coverage-ring::before{content:"";width:57px;height:57px;border-radius:50%;background:#100b0d;position:absolute}.coverage-ring b{position:relative;font:400 14px Georgia,serif;color:#eee2e5}.coverage-track{height:5px;margin-top:13px;border-radius:99px;overflow:hidden;background:rgba(255,255,255,.055)}.coverage-track i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#7a4659,#d6b2a2)}.coverage-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}.coverage-meta div{padding:9px 7px;border-radius:11px;background:rgba(255,255,255,.025);text-align:center}.coverage-meta strong{display:block;font:400 15px Georgia,serif}.coverage-meta span{display:block;margin-top:4px;font-size:7px;color:#6e6266;text-transform:uppercase;letter-spacing:.09em}
    .favorite-tabs{display:flex;gap:5px;margin-bottom:10px;overflow:auto;scrollbar-width:none}.favorite-tabs::-webkit-scrollbar{display:none}.favorite-tab{flex:0 0 auto;padding:6px 9px;border-radius:99px;background:rgba(255,255,255,.025);color:#75696d;font-size:8px;text-transform:uppercase;letter-spacing:.08em}.favorite-tab.active{background:rgba(214,178,162,.12);color:#dcc6cd}.media-list{display:grid;gap:5px}.media-row{width:100%;display:grid;grid-template-columns:28px 1fr auto;align-items:center;gap:9px;padding:9px 10px;border-radius:12px;background:rgba(255,255,255,.025);text-align:left}.media-rank{width:25px;height:25px;border-radius:8px;display:grid;place-items:center;background:rgba(255,255,255,.045);font:11px Georgia,serif;color:#aa979e}.media-copy{min-width:0}.media-copy strong{display:block;font-size:10px;font-weight:500;color:#cbbbc0}.media-copy span{display:block;margin-top:3px;font-size:8px;color:#675c60;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.media-value{text-align:right;font:13px Georgia,serif;color:#eadce1}.media-empty{padding:16px 4px;color:#6f6467;font-size:10px;line-height:1.5}
    .stats-foot{padding:15px 4px 2px;font-size:8px;line-height:1.55;color:#564c50;text-align:center}
    @media (min-width:720px){.stats-summary{grid-template-columns:repeat(3,minmax(0,1fr))}.heatmap{grid-template-columns:repeat(28,1fr)}}
  `;
  document.head.appendChild(style);

  const main = document.querySelector('.main-content');
  const nav = document.querySelector('.bottom-nav');
  if (!main || !nav) return;

  const statsView = document.createElement('section');
  statsView.id = 'statsView';
  statsView.className = 'view stats-view';
  statsView.setAttribute('aria-label', 'Stats');
  statsView.innerHTML = `
    <div class="stats-head">
      <div><span class="eyebrow">Local activity</span><h1>Stats</h1></div>
      <button class="stats-copy" id="statsCopy" type="button" aria-label="Copy Velum analysis state">
        <svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>
        <span>Copy state</span>
      </button>
    </div>
    <div class="stats-ranges" id="statsRanges"></div>
    <div id="statsBody"></div>
    <div class="stats-foot">Everything here is calculated on this device. Copy State uses anonymous media keys and excludes Drive filenames and raw Drive IDs.</div>`;
  main.appendChild(statsView);

  const statsNav = document.createElement('button');
  statsNav.className = 'nav-item';
  statsNav.dataset.view = 'stats';
  statsNav.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 20V10M12 20V4M19 20v-7"/></svg><span>Stats</span>';
  nav.insertBefore(statsNav, nav.querySelector('.release-stamp'));

  const ranges = statsView.querySelector('#statsRanges');
  const body = statsView.querySelector('#statsBody');
  const copyBtn = statsView.querySelector('#statsCopy');

  RANGE_OPTIONS.forEach(option => {
    const button = document.createElement('button');
    button.className = `stats-range${selectedRange === option.key ? ' active' : ''}`;
    button.dataset.range = option.key;
    button.textContent = option.label;
    button.addEventListener('click', () => {
      selectedRange = option.key;
      localStorage.setItem('velum-stats-range', selectedRange);
      ranges.querySelectorAll('.stats-range').forEach(el => el.classList.toggle('active', el === button));
      addLocalEvent({ type: 'interaction', action: `stats-range-${option.key}` });
      renderStats();
    });
    ranges.appendChild(button);
  });

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(resolve => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    return dbPromise;
  }

  async function allEvents() {
    const db = await openDb();
    if (!db) return [];
    return new Promise(resolve => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  async function addLocalEvent(event) {
    const db = await openDb();
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).add({ ...event, at: Date.now() });
    } catch {}
  }

  function startOfToday() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  function rangeStart(key) {
    if (key === 'today') return startOfToday();
    const option = RANGE_OPTIONS.find(r => r.key === key);
    return !option || option.ms === Infinity ? 0 : Date.now() - option.ms;
  }

  function shortHash(value) {
    let h = 2166136261;
    for (let i = 0; i < value.length; i++) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0').toUpperCase();
  }

  const alias = id => `M-${shortHash(String(id)).slice(0, 6)}`;
  // Start records are "impression" in new builds; old builds used zero-ms views.
  const isViewStart = e => e.type === 'impression' ||
    (e.type === 'view' && (!e.ms || e.ms <= 0));
  const isDwell = e => e.type === 'view' && Number(e.ms) > 0;

  // A small local reader for the same legacy-safe, duration-based model in
  // affection.mjs. Stats is loaded as a classic script before the app module.
  function affectionTimeMs(event) {
    if (event?.type !== 'affection') return 0;
    const ms = Number(event.ms);
    if (Number.isFinite(ms) && ms >= 450) return ms;
    const priorLevel = Number(event.level);
    return Number.isFinite(priorLevel) && priorLevel >= 1
      ? 450 + (Math.min(5, priorLevel) - 1) * 650 : 450;
  }


  function mediaStats(events) {
    const map = new Map();
    const get = id => {
      if (!map.has(id)) map.set(id, { id, views: 0, dwell: 0, up: 0, down: 0,
        pairUp: 0, pairDown: 0, skips: 0, affectionHolds: 0,
        affectionDurationMs: 0, affectionWeight: 0, lastView: 0 });
      return map.get(id);
    };
    for (const e of events) {
      for (const id of e.imageIds || []) {
        const s = get(id);
        if (isViewStart(e)) { s.views++; s.lastView = Math.max(s.lastView, Number(e.at) || 0); }
        if (isDwell(e)) { s.dwell += Number(e.ms) || 0; s.lastView = Math.max(s.lastView, Number(e.at) || 0); }
        if (e.type === 'up') s.up++;
        if (e.type === 'down') s.down++;
        if (e.type === 'pair-up') s.pairUp++;
        if (e.type === 'pair-down') s.pairDown++;
        if (e.type === 'skip' && Number(e.ms) >= 0 && Number(e.ms) < 1600) s.skips++;
        if (e.type === 'affection') {
          const holdMs = affectionTimeMs(e);
          s.affectionHolds++;
          s.affectionDurationMs += holdMs;
          s.affectionWeight += 2.5 * Math.log1p(holdMs / 1000) /
            Math.sqrt(s.affectionHolds);
        }
      }
    }
    return map;
  }

  function dedupedDwell(events) {
    const buckets = new Map();
    for (const e of events.filter(isDwell)) {
      const bucket = Math.round((Number(e.at) || 0) / 250);
      const prev = buckets.get(bucket);
      if (!prev || Number(e.ms) > prev.ms) buckets.set(bucket, { at: Number(e.at) || 0, ms: Number(e.ms) || 0 });
    }
    return [...buckets.values()];
  }

  function sessions(events) {
    const meaningful = events.filter(e => Number(e.at) > 0 && e.type !== 'interaction').sort((a, b) => a.at - b.at);
    if (!meaningful.length) return [];
    const groups = [];
    let group = [meaningful[0]];
    for (let i = 1; i < meaningful.length; i++) {
      if (meaningful[i].at - meaningful[i - 1].at > SESSION_GAP) {
        groups.push(group);
        group = [];
      }
      group.push(meaningful[i]);
    }
    groups.push(group);
    return groups.map(items => {
      const start = items[0].at;
      const end = items.at(-1).at;
      const dwell = dedupedDwell(items).reduce((sum, d) => sum + d.ms, 0);
      return { start, end, duration: Math.max(end - start, Math.min(dwell, SESSION_GAP)), events: items.length };
    });
  }

  function dayKey(timestamp) {
    const d = new Date(timestamp);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function dailySeries(events, count = 14) {
    const days = [];
    const dwell = dedupedDwell(events);
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push({ key: dayKey(d.getTime()), date: d.getTime(), ms: 0,
        views: 0, up: 0, down: 0, love: 0, loveMs: 0 });
    }
    const byKey = new Map(days.map(d => [d.key, d]));
    dwell.forEach(item => { const row = byKey.get(dayKey(item.at)); if (row) row.ms += item.ms; });
    events.forEach(e => {
      const row = byKey.get(dayKey(e.at));
      if (!row) return;
      if (isViewStart(e)) row.views++;
      if (e.type === 'up' || e.type === 'pair-up') row.up++;
      if (e.type === 'down' || e.type === 'pair-down') row.down++;
      if (e.type === 'affection') {
        row.love++;
        row.loveMs += affectionTimeMs(e);
      }
    });
    return days;
  }

  function eventCounts(events) {
    const out = {};
    events.forEach(e => {
      const key = e.type === 'interaction' ? `interaction:${e.action || 'unknown'}` : e.type || 'unknown';
      out[key] = (out[key] || 0) + 1;
    });
    return out;
  }

  function formatDuration(ms) {
    ms = Math.max(0, Number(ms) || 0);
    if (ms > 0 && ms < 10_000) return `${(ms / 1000).toFixed(1).replace(/\.0$/, '')}s`;
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    const mins = Math.round(ms / 60_000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem ? `${hours}h ${rem}m` : `${hours}h`;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(Number(value) || 0);
  }

  function buildSnapshot(all, key = selectedRange, collection = getCollection()) {
    const from = rangeStart(key);
    const filtered = all.filter(e => (Number(e.at) || 0) >= from);
    const allMedia = mediaStats(all);
    const rangeMedia = mediaStats(filtered);
    const ids = new Set(collection?.ids || []);
    const complete = collection?.state === 'complete';
    const seenInCollection = [...ids].filter(id => allMedia.get(id)?.views > 0).length;
    const seenAll = new Set([...allMedia.entries()].filter(([, s]) => s.views > 0).map(([id]) => id));
    const seenRange = new Set([...rangeMedia.entries()].filter(([, s]) => s.views > 0).map(([id]) => id));
    const rangeSessions = sessions(filtered);
    const dwell = dedupedDwell(filtered);
    const trackedMs = dwell.reduce((sum, d) => sum + d.ms, 0);
    const views = filtered.filter(isViewStart).length;
    const up = filtered.filter(e => e.type === 'up' || e.type === 'pair-up').length;
    const down = filtered.filter(e => e.type === 'down' || e.type === 'pair-down').length;
    const love = filtered.filter(e => e.type === 'affection');
    const affectionHolds = love.length;
    const affectionDurationMs = love.reduce((sum, e) => sum + affectionTimeMs(e), 0);
    const unique = seenRange.size;
    const averageDwell = views ? trackedMs / Math.max(1, filtered.filter(e => e.type === 'view' && e.mode === 'drift-end').length) : 0;
    return {
      key, from, filtered, allMedia, rangeMedia, ids, seenAll, seenRange, rangeSessions,
      trackedMs, views, up, down, affectionHolds, affectionDurationMs, unique, averageDwell,
      listingState: collection?.state || 'idle', complete, seenInCollection,
      coverage: complete && ids.size ? seenInCollection / ids.size * 100 : null
    };
  }

  function card(value, label, note = '') {
    return `<div class="stat-card"><strong>${value}</strong><span>${label}</span>${note ? `<small>${note}</small>` : ''}</div>`;
  }

  function renderActivity(snapshot) {
    const days = dailySeries(snapshot.filtered, 14);
    const max = Math.max(1, ...days.map(d => d.ms));
    const bars = days.map((d, index) => {
      const h = Math.max(3, d.ms / max * 72);
      const label = index === 0 || index === 6 || index === 13;
      const dd = new Date(d.date);
      return `<div class="activity-bar-wrap${label ? ' label' : ''}${index === 13 ? ' today' : ''}" title="${d.key}: ${formatDuration(d.ms)}"><div class="activity-bar" style="height:${h}px"></div><i>${dd.getDate()}</i></div>`;
    }).join('');
    const heatDays = dailySeries(snapshot.filtered, 28);
    const heatMax = Math.max(1, ...heatDays.map(d => d.ms));
    const heat = heatDays.map(d => {
      const ratio = d.ms / heatMax;
      const level = ratio <= 0 ? '' : ratio < .18 ? ' l1' : ratio < .42 ? ' l2' : ratio < .72 ? ' l3' : ' l4';
      return `<span class="heat${level}" title="${d.key}: ${formatDuration(d.ms)}"></span>`;
    }).join('');
    return `<section class="stats-section"><div class="stats-section-head"><h2>Activity</h2><span>Tracked viewing · last 14 days</span></div><div class="activity-chart">${bars}</div><div class="heatmap">${heat}</div></section>`;
  }

  function renderCoverage(snapshot) {
    if (!snapshot.complete || !snapshot.ids.size) {
      const message = snapshot.complete ? 'Private and References are empty.'
        : snapshot.listingState === 'partial' ? 'Use Sync to finish reading the collection.'
        : snapshot.listingState === 'loading' ? 'Reading the full collection from Drive…'
        : 'Connect Drive to see collection coverage.';
      return `<section class="stats-section"><div class="stats-section-head"><h2>Collection</h2></div><p class="media-empty">${message}</p></section>`;
    }
    const total = snapshot.ids.size;
    const seen = snapshot.seenInCollection;
    const never = total - seen;
    const views = [...snapshot.ids].map(id => snapshot.allMedia.get(id)?.views || 0);
    const frequent = views.filter(count => count >= 5).length;
    const once = views.filter(count => count === 1).length;
    return `<section class="stats-section"><div class="stats-section-head"><h2>Collection</h2><span>All-time exploration</span></div><div class="coverage-row"><div class="coverage-main"><strong>${formatNumber(seen)} / ${formatNumber(total)}</strong><span>media seen</span></div><div class="coverage-ring" style="--p:${snapshot.coverage.toFixed(2)}"><b>${Math.round(snapshot.coverage)}%</b></div></div><div class="coverage-track"><i style="width:${snapshot.coverage}%"></i></div><div class="coverage-meta"><div><strong>${formatNumber(never)}</strong><span>Unseen</span></div><div><strong>${formatNumber(once)}</strong><span>Once</span></div><div><strong>${formatNumber(frequent)}</strong><span>5+ views</span></div></div></section>`;
  }

  function mediaMetric(kind, s) {
    if (kind === 'revisited') return `${s.views} views`;
    if (kind === 'dwell' || kind === 'quiet') return formatDuration(s.dwell);
    return s.affectionHolds
      ? `${formatDuration(s.affectionDurationMs)} held`
      : `${s.up + s.pairUp} old likes`;
  }

  function mediaSubline(s) {
    return `${s.views} views · ${formatDuration(s.dwell)} viewing · ${s.affectionHolds} holds / ${formatDuration(s.affectionDurationMs)} · ${s.up + s.pairUp} old likes`;
  }

  function rankedMedia(snapshot, kind) {
    let arr = [...snapshot.allMedia.values()].filter(s => snapshot.ids.has(s.id) &&
      (s.views || s.affectionHolds || s.up || s.down || s.pairUp || s.pairDown));
    if (kind === 'revisited') arr.sort((a, b) => b.views - a.views || b.dwell - a.dwell);
    else if (kind === 'dwell') arr.sort((a, b) => b.dwell - a.dwell || b.views - a.views);
    else if (kind === 'quiet') arr = arr.filter(s =>
      s.up + s.pairUp + s.affectionHolds === 0 && s.views >= 2).sort((a, b) => b.dwell - a.dwell);
    else arr.sort((a, b) => (b.affectionWeight + b.up * 3 + b.pairUp) -
      (a.affectionWeight + a.up * 3 + a.pairUp) || b.dwell - a.dwell);
    return arr.slice(0, 6);
  }

  function renderFavorites(snapshot) {
    return `<section class="stats-section"><div class="stats-section-head"><h2>Favorites</h2><span>Tap a row to open it</span></div><div class="favorite-tabs"><button class="favorite-tab active" data-fav="liked">Most loved</button><button class="favorite-tab" data-fav="revisited">Revisited</button><button class="favorite-tab" data-fav="dwell">Longest</button><button class="favorite-tab" data-fav="quiet">Quiet favorites</button></div><div class="media-list" id="statsMediaList"></div></section>`;
  }

  function paintMediaList(snapshot, kind = 'liked') {
    const list = body.querySelector('#statsMediaList');
    if (!list) return;
    const items = rankedMedia(snapshot, kind);
    if (!items.length) {
      list.innerHTML = `<div class="media-empty">${snapshot.complete ? 'No available media in this category yet.' :
        'Favorites appear as Drive media becomes available.'}</div>`;
      return;
    }
    list.innerHTML = items.map((s, i) => `<button class="media-row" data-media="${s.id.replace(/"/g, '&quot;')}"><span class="media-rank">${i + 1}</span><span class="media-copy"><strong>${alias(s.id)}</strong><span>${mediaSubline(s)}</span></span><span class="media-value">${mediaMetric(kind, s)}</span></button>`).join('');
    list.querySelectorAll('.media-row').forEach(row => row.addEventListener('click', () => {
      const id = row.dataset.media;
      const scroll = statsView.scrollTop;
      if (!openMedia(id)) { renderStats(); return; }
      returnTarget = { id, scroll };
      addLocalEvent({ type: 'interaction', action: 'stats-open-media', imageIds: [id] });
    }));
  }

  async function renderStats() {
    if (!statsView.classList.contains('active') || !getCollection()) return;
    const token = ++renderToken;
    if (!body.childElementCount) body.innerHTML = '<div class="stats-section"><div class="media-empty">Reading local activity…</div></div>';
    const all = await allEvents();
    const collection = getCollection();
    if (token !== renderToken || !statsView.classList.contains('active') || !collection) return;
    const snapshot = buildSnapshot(all, selectedRange, collection);
    const scroll = statsView.scrollTop;
    const sessionDurations = snapshot.rangeSessions.map(s => s.duration);
    const avgSession = sessionDurations.length ? sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length : 0;
    const coverage = snapshot.coverage === null ? '—' : `${Math.round(snapshot.coverage)}%`;
    body.innerHTML = `<div class="stats-summary">${card(formatDuration(snapshot.trackedMs), 'Tracked viewing', 'Drift dwell time')}${card(formatNumber(snapshot.rangeSessions.length), 'Sessions', avgSession ? `${formatDuration(avgSession)} average` : '')}${card(formatNumber(snapshot.views), 'Media views', `${formatNumber(snapshot.unique)} unique`)}${card(formatDuration(snapshot.affectionDurationMs), 'Time expressed', `${snapshot.affectionHolds} holds · ${snapshot.up} legacy likes`)}${card(formatDuration(snapshot.averageDwell), 'Average dwell', 'Per completed Drift view')}${card(coverage, 'Collection explored', snapshot.complete ? `${formatNumber(snapshot.seenInCollection)} seen in the collection` : '')}</div>${renderActivity(snapshot)}${renderCoverage(snapshot)}${renderFavorites(snapshot)}`;
    paintMediaList(snapshot, favoriteKind);
    body.querySelectorAll('.favorite-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.fav === favoriteKind));
    statsView.scrollTop = returnTarget?.scroll ?? scroll;
    if (returnTarget) {
      const row = [...body.querySelectorAll('.media-row')].find(item => item.dataset.media === returnTarget.id);
      const focus = row || body.querySelector('.favorite-tab.active');
      focus?.focus({ preventScroll: true });
      returnTarget = null;
    }
    body.querySelectorAll('.favorite-tab').forEach(tab => tab.addEventListener('click', () => {
      favoriteKind = tab.dataset.fav;
      body.querySelectorAll('.favorite-tab').forEach(t => t.classList.toggle('active', t === tab));
      paintMediaList(snapshot, tab.dataset.fav);
    }));
  }

  async function buildCopyState() {
    const all = await allEvents();
    const snapshot = buildSnapshot(all, selectedRange);
    const allSnapshot = buildSnapshot(all, 'all');
    const days = dailySeries(all, 30).map(d => ({ date: d.key, trackedMs: Math.round(d.ms),
      views: d.views, up: d.up, down: d.down, affectionHolds: d.love, affectionDurationMs: d.loveMs }));
    const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, events: 0, views: 0, trackedMs: 0 }));
    all.forEach(e => {
      if (!e.at) return;
      const h = new Date(e.at).getHours();
      hourly[h].events++;
      if (isViewStart(e)) hourly[h].views++;
    });
    dedupedDwell(all).forEach(d => { hourly[new Date(d.at).getHours()].trackedMs += Math.round(d.ms); });
    const top = [...allSnapshot.allMedia.values()].sort((a, b) => b.dwell - a.dwell || b.views - a.views).slice(0, 20).map(s => ({
      media: alias(s.id), views: s.views, trackedMs: Math.round(s.dwell), up: s.up, down: s.down,
      pairUp: s.pairUp, pairDown: s.pairDown, skips: s.skips,
      affectionHolds: s.affectionHolds, affectionDurationMs: s.affectionDurationMs,
      lastView: s.lastView ? new Date(s.lastView).toISOString() : null
    }));
    const recent = all.slice(-750).map(e => ({
      at: e.at ? new Date(e.at).toISOString() : null,
      type: e.type,
      action: e.action || undefined,
      media: (e.imageIds || []).map(alias),
      ms: Number(e.ms) || undefined,
      affectionDurationMs: e.type === 'affection' ? affectionTimeMs(e) : undefined,
      mode: e.mode || undefined
    }));
    const state = {
      schema: 'VELUM_STATE_V2',
      generatedAt: new Date().toISOString(),
      selectedRange,
      collection: {
        status: allSnapshot.listingState,
        total: allSnapshot.complete ? allSnapshot.ids.size : null,
        seenAllTime: allSnapshot.complete ? allSnapshot.seenInCollection : null,
        coveragePct: allSnapshot.coverage === null ? null : Number(allSnapshot.coverage.toFixed(2)),
        neverSeen: allSnapshot.complete ? allSnapshot.ids.size - allSnapshot.seenInCollection : null
      },
      selected: {
        trackedMs: Math.round(snapshot.trackedMs),
        sessions: snapshot.rangeSessions.length,
        views: snapshot.views,
        uniqueMedia: snapshot.unique,
        upvotes: snapshot.up,
        downvotes: snapshot.down,
        affectionHolds: snapshot.affectionHolds,
        affectionDurationMs: snapshot.affectionDurationMs,
        avgDwellMs: Math.round(snapshot.averageDwell)
      },
      allTime: {
        trackedMs: Math.round(allSnapshot.trackedMs),
        sessions: allSnapshot.rangeSessions.length,
        views: allSnapshot.views,
        uniqueMedia: allSnapshot.unique,
        upvotes: allSnapshot.up,
        downvotes: allSnapshot.down,
        affectionHolds: allSnapshot.affectionHolds,
        affectionDurationMs: allSnapshot.affectionDurationMs
      },
      eventTypeCounts: eventCounts(all),
      last30Days: days,
      hourly,
      topMediaByTrackedTime: top,
      recentEvents: recent,
      cache: window.__velumCacheSnapshot?.() || null,
      privacy: 'Drive filenames and raw Drive IDs excluded; media aliases are stable hashes for correlation between copied states.'
    };
    return `VELUM_STATE_V2\n${JSON.stringify(state)}`;
  }

  async function copyText(text, isCurrent) {
    if (!isCurrent()) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      if (!isCurrent()) return false;
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }

  copyBtn.addEventListener('click', async () => {
    if (!getCollection()) return;
    const epoch = privacyEpoch;
    const isCurrent = () => epoch === privacyEpoch &&
      statsView.classList.contains('active') && Boolean(getCollection());
    copyBtn.disabled = true;
    const label = copyBtn.querySelector('span');
    const original = label.textContent;
    label.textContent = 'Preparing';
    try {
      await addLocalEvent({ type: 'interaction', action: 'copy-state' });
      const state = await buildCopyState();
      const ok = await copyText(state, isCurrent);
      if (!isCurrent()) return;
      label.textContent = ok ? 'Copied' : 'Copy failed';
      copyBtn.classList.toggle('copied', ok);
    } finally {
      setTimeout(() => {
        if (epoch !== privacyEpoch) return;
        label.textContent = original;
        copyBtn.classList.remove('copied');
        copyBtn.disabled = false;
      }, 1800);
    }
  });

  nav.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => {
    addLocalEvent({ type: 'interaction', action: `nav-${button.dataset.view || 'unknown'}` });
  }, true));

  const pointerStarts = new Map();
  function clearStats() {
    renderToken++;
    privacyEpoch++;
    returnTarget = null;
    pointerStarts.clear();
    body.replaceChildren();
    copyBtn.querySelector('span').textContent = 'Copy state';
    copyBtn.classList.remove('copied');
    copyBtn.disabled = false;
    statsView.scrollTop = 0;
  }
  window.addEventListener('velum:collection-changed', renderStats);
  window.addEventListener('velum:collection-cleared', clearStats);
  window.__velumStats = {
    connect({ getCollection: collection, openMedia: open }) {
      getCollection = collection;
      openMedia = open;
      return { update: renderStats, clear: clearStats };
    }
  };
  window.addEventListener('pointerdown', event => {
    if (!event.target?.closest?.('#driftStage')) return;
    pointerStarts.set(event.pointerId, { x: event.clientX, y: event.clientY, at: performance.now() });
    if (pointerStarts.size === 2) addLocalEvent({ type: 'interaction', action: 'drift-pinch' });
  }, true);
  window.addEventListener('pointerup', event => {
    const start = pointerStarts.get(event.pointerId);
    if (!start) return;
    pointerStarts.delete(event.pointerId);
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 52 && Math.abs(dx) >= Math.abs(dy)) addLocalEvent({ type: 'interaction', action: 'drift-swipe' });
    // No vertical voting gesture: deliberate holds now carry preference.
  }, true);
  window.addEventListener('pointercancel', event => pointerStarts.delete(event.pointerId), true);

  const interactionButtons = {
    exitBtn: 'quick-exit', returnBtn: 'quick-return', velumHardRefresh: 'hard-refresh', velumAutoTimer: 'timer-toggle'
  };
  const bindKnownInteractions = () => Object.entries(interactionButtons).forEach(([id, action]) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.statsBound) return;
    el.dataset.statsBound = '1';
    el.addEventListener('click', () => addLocalEvent({ type: 'interaction', action }), true);
  });
  bindKnownInteractions();
  new MutationObserver(bindKnownInteractions).observe(document.body, { childList: true, subtree: true });
})();
