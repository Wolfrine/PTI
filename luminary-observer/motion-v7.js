/** Motion Archive: presentation only. Firebase, auth and research writes remain in app.js. */
export function createMotionArchive(bridge) {
  const $ = (s) => document.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = bridge.escape;
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set();
  const objects = new Map();
  const records = new Map();
  let latest = null, patternRecords = [], sourceDetails = new Map(), selected = null;
  let sourceOrigin = null, view = 'observe', epoch = 0, captureEpoch = 0;
  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch {} }
  };
  const reduced = () => media.matches || storage.get('luminary.reduceMotion') === 'true';
  const kind = (item) => ['mark', 'voice', 'text'].includes(item?.sourceType) ? item.sourceType : 'observation';
  const ms = (item) => bridge.timeMs(item) ?? item?.dateMs ?? null;
  const date = (item) => {
    const t = ms(item);
    return Number.isFinite(t) ? new Intl.DateTimeFormat(undefined, {day:'2-digit',month:'short'}).format(new Date(t)) : 'Date unavailable';
  };
  const stamp = (item) => `${date(item)} · ${bridge.localTime({...item,clientCreatedAtMs:ms(item)})}`;
  const material = (item, cls = '', size = 96) => `<img class="material ${kind(item)} ${cls}" src="./assets/v6-material-mark.webp" width="${size}" height="${size}" alt="" draggable="false" decoding="async">`;
  function run(node, frames, duration = 420, delay = 0) {
    if (!node || reduced() || document.hidden || !node.animate) return Promise.resolve();
    const a = node.animate(frames, {duration, delay, easing:'cubic-bezier(.2,.75,.2,1)', fill:'both'});
    animations.add(a);
    return a.finished.catch(() => {}).finally(() => { animations.delete(a); a.cancel(); });
  }
  function cancelMotion() {
    for (const a of animations) a.cancel();
    animations.clear();
    $$('.flight-material').forEach(n => n.remove());
  }
  function applyPreference() {
    document.body.classList.toggle('reduce-motion', reduced());
    const input = $('#reduceMotionToggle');
    if (input) input.checked = storage.get('luminary.reduceMotion') === 'true';
    if (reduced()) cancelMotion();
  }
  media.addEventListener('change', applyPreference);
  $('#reduceMotionToggle')?.addEventListener('change', e => {
    storage.set('luminary.reduceMotion', String(e.target.checked));
    applyPreference();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelMotion(); });
  applyPreference();

  function bounds(root, selector) {
    return new Map($$(selector, root).map(n => [n.dataset.key, n.getBoundingClientRect()]));
  }
  function reflow(root, selector, before, duration = 400) {
    $$(selector, root).forEach((node, index) => {
      const old = before.get(node.dataset.key);
      node.getAnimations().forEach(a => a.cancel());
      const next = node.getBoundingClientRect();
      if (old && old.width && next.width) {
        const dx = old.left - next.left, dy = old.top - next.top;
        if (Math.abs(dx) + Math.abs(dy) > 1) run(node, [
          {transform:`translate(${dx}px,${dy}px)`}, {transform:'translate(0,0)'}
        ], duration);
      } else {
        run(node, [{clipPath:'inset(0 0 100% 0)'},{clipPath:'inset(0 0 0 0)'}], 320, Math.min(index * 24, 144));
      }
    });
  }
  async function transfer(from, target, item, duration = 520, host = document.body) {
    if (!target) return;
    const end = target.getBoundingClientRect();
    const start = from?.getBoundingClientRect?.() || from;
    if (reduced() || !start?.width || !end.width || start.bottom < 0 || start.top > innerHeight) return;
    const clone = document.createElement('img');
    clone.className = `material ${kind(item)} flight-material`;
    clone.src = './assets/v6-material-mark.webp';
    clone.alt = ''; clone.setAttribute('aria-hidden','true');
    Object.assign(clone.style, {left:`${start.left}px`,top:`${start.top}px`,width:`${start.width}px`,height:`${start.height}px`});
    host.append(clone);
    target.style.visibility = 'hidden';
    const dx = end.left - start.left, dy = end.top - start.top;
    try {
      await run(clone, [
        {transform:'translate(0,0) scale(1)',opacity:1},
        {transform:`translate(${dx * .58}px,${dy * .4 - 18}px) scale(${.55 + .45 * end.width / start.width})`,opacity:1,offset:.55},
        {transform:`translate(${dx}px,${dy}px) scale(${end.width / start.width},${end.height / start.height})`,opacity:1}
      ], duration);
    } finally { clone.remove(); target.style.visibility = ''; }
  }
  function navIndicator(animate = true) {
    const active = $('.nav-item.active'), indicator = $('#navIndicator'), nav = $('.bottom-nav');
    if (!active || !indicator || !nav) return;
    const old = indicator.getBoundingClientRect();
    indicator.getAnimations().forEach(a => a.cancel());
    const a = active.getBoundingClientRect(), b = nav.getBoundingClientRect();
    indicator.style.left = `${a.left - b.left + a.width / 2 - 16}px`;
    const dx = old.left - (a.left + a.width / 2 - 16);
    if (animate && Math.abs(dx) > 1) run(indicator,[{transform:`translateX(${dx}px)`},{transform:'translateX(0)'}],320);
    $$('.nav-item').forEach(n => {
      if (n === active) n.setAttribute('aria-current','page'); else n.removeAttribute('aria-current');
    });
  }
  new ResizeObserver(() => navIndicator(false)).observe($('.bottom-nav'));
  // Opening choreography is finite and never blocks sign-in.
  run($('.hero-material'), [{clipPath:'inset(38% 0 45% 0)',transform:'translateY(24px) rotate(-5deg)'},{clipPath:'inset(0)',transform:'translateY(0) rotate(0)'}],1100);
  function enterObserve() {
    navIndicator();
    run($('.mark-art'), [{clipPath:'inset(35% 0 45% 0)',transform:'translateY(14px)'},{clipPath:'inset(0)',transform:'translateY(0)'}],700);
  }
  function viewChanged(next) {
    view = next; navIndicator();
    const heading = $(`.view[data-view="${next}"] .section-head`);
    if (heading) run(heading,[{clipPath:'inset(0 0 100% 0)'},{clipPath:'inset(0)'}],280);
  }
  const markArt = $('.mark-art');
  $('#markBtn').addEventListener('pointerdown', () => run(markArt,[{transform:'scale(1)'},{transform:'scale(.975)'},{transform:'scale(1)'}],180));
  $('#markBtn').addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') run(markArt,[{transform:'scale(.975)'},{transform:'scale(1)'}],180); });
  function setLast(item) {
    latest = item;
    const button = $('#lastRecordButton');
    $('#lastMaterialSlot').innerHTML = item ? material(item, '', 48) : '';
    $('#lastCapture').textContent = item ? `${bridge.capitalize(kind(item))} · ${bridge.localTime(item)}` : 'Nothing yet';
    $('#lastRecordHint').textContent = item ? 'Open the raw moment' : 'Your next moment belongs here.';
    button.disabled = !item;
  }
  $('#lastRecordButton').addEventListener('click', () => { if (latest) open(latest.id, $('#lastMaterialSlot .material')); });
  function saved(item) {
    const sequence = ++captureEpoch;
    const from = kind(item) === 'mark' ? markArt : $(kind(item) === 'voice' ? '#voiceBtn' : '#saveTextBtn');
    const origin = from?.getBoundingClientRect();
    setLast(item);
    const target = $('#lastMaterialSlot .material');
    run($('.capture-shutter'),[{transform:'scaleX(0)'},{transform:'scaleX(1)',offset:.6},{transform:'scaleX(0)',offset:1}],420);
    transfer(origin,target,item).then(() => { if (sequence === captureEpoch) $('#lastCapture').textContent = `${bridge.capitalize(kind(item))} · ${bridge.localTime(item)}`; });
  }
  async function open(id, source) {
    sourceOrigin = source?.getBoundingClientRect?.() || null;
    await bridge.openMoment(id);
  }
  document.addEventListener('click', e => {
    const record = e.target.closest('.timeline-item');
    if (record) sourceOrigin = record.querySelector('.material')?.getBoundingClientRect() || null;
  }, true);
  function moment(item) {
    $('#momentHero').innerHTML = `<div class="moment-heading">${material(item,'detail-material',136)}<div><p class="meta">${esc(stamp(item))} / ${esc(kind(item))}</p><h2>${esc(kind(item)==='mark'?'Moment preserved.':(item.rawText||'No text recorded.'))}</h2></div></div>`;
    const origin = sourceOrigin; sourceOrigin = null;
    requestAnimationFrame(() => transfer(origin,$('#momentHero .material'),item,420,$('#momentDialog')));
  }
  function renderStream(items) {
    const root = $('#timelineList'), before = bounds(root,'.timeline-item');
    const fragment = document.createDocumentFragment();
    let lastDay = null;
    for (const item of items) {
      const day = bridge.dayKey(item);
      if (day !== lastDay) {
        const heading = document.createElement('h3'); heading.className='record-day'; heading.textContent = bridge.dayLabel(day); fragment.append(heading); lastDay = day;
      }
      let node = records.get(item.id);
      if (!node) {
        node = document.createElement('button'); node.type='button'; node.className='timeline-item';
        node.dataset.observationId=item.id; node.dataset.key=item.id; records.set(item.id,node);
      }
      node.dataset.source=kind(item);
      node.innerHTML = `${material(item,'record-art',64)}<span class="record-info"><span class="record-meta">${esc(bridge.localTime(item))} / ${esc(kind(item))}</span><span class="record-text">${esc(kind(item)==='mark'?'Moment preserved':item.rawText||'No text recorded')}</span></span><span class="record-arrow" aria-hidden="true">↗</span>`;
      fragment.append(node);
    }
    root.replaceChildren(fragment);
    reflow(root,'.timeline-item',before,360);
    $$('.filter').forEach(n => n.setAttribute('aria-pressed',String(n.classList.contains('active'))));
    const groups = new Map();
    for (const item of items) { const day=bridge.dayKey(item); if(!groups.has(day)) groups.set(day,[]); groups.get(day).push(item); }
    const visible = [...groups.entries()].slice(0,4);
    $('#streamRegister').innerHTML = `<p class="meta">Recorded days</p><h3>${items.length} loaded moment${items.length===1?'':'s'}</h3>` + visible.map(([day,list]) => `<div class="day-row"><div><span>${esc(bridge.dayLabel(day))}</span><span class="meta">${list.length}</span></div><div class="day-materials" aria-hidden="true">${list.slice(0,5).map(o=>material(o,'',36)).join('')}${list.length>5?`<span class="day-more">+${list.length-5}</span>`:''}</div></div>`).join('') + `<p class="day-note">Most recent loaded records, grouped by recorded local date. Counts change with the filter.${groups.size>4?` ${groups.size-4} older days remain in the list.`:''}</p>`;
    $('#streamRange').textContent = items.length ? `${date(items.at(-1))} — ${date(items[0])}` : 'No moments';
    $('#timelineEmpty').hidden = items.length>0;
  }
  function ensureScene() {
    if ($('#supportGrid')) return;
    $('#patternField').innerHTML = `<div class="evidence-heading"><h3>Moments behind the pattern</h3><span class="meta">Raw sources</span></div><p class="evidence-help">Select a material to open the original moment.</p><section class="support-region" aria-label="Supporting sources"><div class="region-title"><strong>Supporting this pattern</strong><span id="supportCount" class="region-count" role="status"></span></div><div id="supportGrid" class="source-grid"></div><p id="missingSourceNote" class="unresolved-note"></p></section><section class="context-region" id="contextRegion" aria-label="Other loaded sources"><div class="region-title"><strong>Other loaded sources</strong><span id="contextCount" class="meta"></span></div><div id="contextGrid" class="source-grid"></div></section>`;
  }
  function object(item) {
    let node = objects.get(item.id);
    if (!node) {
      node = document.createElement('button'); node.className='source-object'; node.type='button';
      node.dataset.key=item.id; node.dataset.observationId=item.id;
      node.addEventListener('click', () => open(item.id,node.querySelector('.material')));
      objects.set(item.id,node);
    }
    node.innerHTML = `${material(item,'',104)}<time>${esc(stamp(item))}</time><small>${esc(bridge.capitalize(kind(item)))} ↗</small>`;
    node.setAttribute('aria-label',`Open ${kind(item)} observation, ${stamp(item)}`);
    return node;
  }
  async function selectPattern(id, animate = true) {
    const token=++epoch;
    selected=id;
    const picker = $('#patternPicker'); if (picker) picker.value = id;
    const pattern=patternRecords.find(p=>p.id===id);
    if(!pattern) return;
    $$('.pattern-choice').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.patternId===id)));
    ensureScene();
    const refs=bridge.sources(pattern), ids=new Set(refs.map(s=>s.id));
    $('#supportCount').textContent='Loading…';
    const loaded = await bridge.resolveSources(pattern);
    if(token!==epoch) return;
    for(const [key,value] of loaded) sourceDetails.set(key,value);
    const root=$('#patternField');
    const before = animate ? bounds(root,'.source-object') : new Map();
    const support=[...ids].map(key=>sourceDetails.get(key)).filter(x=>x?.resolved).sort((a,b)=>(ms(a)??Infinity)-(ms(b)??Infinity));
    const other=[...sourceDetails.values()].filter(x=>x.resolved && !ids.has(x.id)).slice(0,6);
    const supportGrid=$('#supportGrid'), contextGrid=$('#contextGrid');
    const nodes = support.slice(0,24).map(object), rest=other.map(object);
    supportGrid.replaceChildren(...nodes);contextGrid.replaceChildren(...rest);
    $('#supportCount').textContent = `${support.length} linked`;
    $('#contextCount').textContent = String(other.length);
    $('#contextRegion').hidden=other.length===0;
    const missing=ids.size-support.length;
    const notes=[];
    if(missing>0) notes.push(`${missing} referenced source${missing===1?' is':'s are'} unavailable or not loaded. No substitute evidence is drawn.`);
    if(support.length>24) notes.push(`Showing the first 24 of ${support.length} resolved sources.`);
    if(!ids.size) notes.push('This pattern has no source references. Its published statement is not treated as raw evidence.');
    if(pattern.supportCount!=null) notes.push(`Published support count: ${pattern.supportCount}.`);
    $('#missingSourceNote').textContent=notes.join(' ');
    if(!nodes.length) supportGrid.innerHTML='<p class="source-empty">No linked raw moments available.</p>';
    reflow(root,'.source-object',before,520);
    bridge.track('pattern_visual_select',{patternId:id,sourceIds:support.slice(0,24).map(s=>s.id)});
  }
  function renderPatterns(patterns, details) {
    patternRecords=patterns;
    sourceDetails = new Map(details);
    let picker = $('#patternPicker');
    if (!picker) { picker = document.createElement('select'); picker.id='patternPicker'; picker.className='pattern-picker'; picker.setAttribute('aria-label','Choose a published pattern'); $('#patternList').before(picker); picker.addEventListener('change',e=>selectPattern(e.target.value)); }
    picker.hidden = patterns.length === 0;
    picker.innerHTML=patterns.map((p,i)=>`<option value="${esc(p.id)}">${i+1} / ${patterns.length} — ${esc(p.title||'Published pattern')}</option>`).join('');
    $('#patternList').innerHTML=patterns.map(p=>`<button type="button" class="pattern-choice" data-pattern-id="${esc(p.id)}" aria-pressed="false"><h3>${esc(p.title||p.statement||p.description||'Published pattern')}</h3><p>${esc(p.summary||'')}</p><span class="pattern-count">${esc(p.status||'Published')} · ${bridge.sources(p).length} source reference${bridge.sources(p).length===1?'':'s'}</span></button>`).join('');
    if(patterns.length) return selectPattern(patterns.some(p=>p.id===selected)?selected:patterns[0].id, false);
    epoch++;selected=null;
    $('#patternField').innerHTML='<div class="evidence-empty"><span class="empty-glyph" aria-hidden="true">∴</span><h3>No pattern to interpret.</h3><p>Your observations remain raw. This space changes only when external analysis publishes a pattern.</p></div>';
  }
  $('#patternList').addEventListener('click',e=>{const b=e.target.closest('.pattern-choice');if(b)selectPattern(b.dataset.patternId);});
  function voiceText(text) {
    const total=text.trim().split(/\s+/).filter(Boolean).length;
    $$('#transcriptGraphic i').forEach((bar,i)=>{
      const h=8+Math.min(36,Math.max(0,total-i)*4);
      const previous=bar.getBoundingClientRect().height;
      bar.style.height=h+'px';
      run(bar,[{transform:`scaleY(${previous/h})`},{transform:'scaleY(1)'}],180);
    });
  }
  function sheetOpened() {
    const sheet = $('#textComposer');
    $$('.observe-stage,.bottom-nav,.topbar').forEach(n => n.inert = true);
    const origin = $('#textBtn').getBoundingClientRect();
    const destination=sheet.getBoundingClientRect();
    // Transform relative to the resting sheet transform, leaving native text sharp.
    run(sheet,[{clipPath:'inset(0 0 88% 0)'},{clipPath:'inset(0)'}],300);
    if(origin.top<destination.bottom) sourceOrigin=null;
  }
  $('#textComposer').addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();bridge.closeComposer();$('#textBtn').focus();}
    if(e.key==='Tab'){
      const items=$$('button,textarea',e.currentTarget).filter(n=>!n.disabled);
      const first=items[0],last=items.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  function sheetClosed() { $$('.observe-stage,.bottom-nav,.topbar').forEach(n => n.inert = false); }
  function reset() { epoch++;captureEpoch++;latest=null;sourceDetails.clear();objects.clear();records.clear();cancelMotion();setLast(null); }
  return {enterObserve,viewChanged,saved,setLast,moment,renderStream,renderPatterns,voiceText,sheetOpened,sheetClosed,reduced,reset};
}
