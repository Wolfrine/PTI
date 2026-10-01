export const NODE_TYPES = ['workstream','thread','problem','decision','outcome','insight','openLoop','recommendation','principle'];
export const EVENT_TONES = {
  implementation:'blue', decision:'purple', discovery:'teal', correction:'amber',
  'failure-correction':'amber', rejection:'red', revert:'red', 'scheduled-output':'green',
  reflection:'slate', exploration:'teal', 'open-loop':'slate'
};

const uniq = values => [...new Set((values || []).filter(Boolean))];
const compare = (a,b) => String(a || '').localeCompare(String(b || ''));
export const localDay = value => String(value || '').slice(0,10);
export const human = value => String(value || '').replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ').replaceAll('-',' ').replace(/^./,c=>c.toUpperCase());
export const byLocalDate = (a,b) => compare(a.localDate,b.localDate) || compare(a.occurredAt,b.occurredAt) || compare(a.title,b.title);
export const nodeMap = nodes => new Map((nodes || []).map(n => [n.id,n]));
export const eventMap = events => new Map((events || []).map(e => [e.id,e]));

export function dateRange(events, dayIndex){
  const days = uniq([...(events || []).map(e=>e.localDate), ...(dayIndex || []).map(d=>d.localDate)]).sort(compare);
  return {days, from:days[0] || '', to:days.at(-1) || ''};
}

export function workstreamRows(nodes, events){
  const map=nodeMap(nodes);
  const workstreams=(nodes || []).filter(n=>n.nodeType==='workstream');
  const counts=new Map();
  for(const event of events || []) for(const id of event.nodeIds || []) counts.set(id,(counts.get(id)||0)+1);
  return workstreams.sort((a,b)=>(counts.get(b.id)||0)-(counts.get(a.id)||0)||compare(a.title,b.title)).map(n=>({...n,eventCount:counts.get(n.id)||0}));
}

export function eventsForNode(nodeId, events){
  return (events || []).filter(e=>(e.nodeIds || []).includes(nodeId)).sort(byLocalDate);
}

export function relatedEdges(id, edges){
  return (edges || []).filter(e=>e?.from?.id===id||e?.to?.id===id);
}

export function traceNeighborhood(rootId, nodes, events, edges, depth=2){
  const nm=nodeMap(nodes), em=eventMap(events); const seen=new Set([rootId]); const queue=[{id:rootId,depth:0}]; const edgeIds=new Set();
  while(queue.length){const cur=queue.shift(); if(cur.depth>=depth) continue; for(const edge of edges || []){let next=''; if(edge.from?.id===cur.id) next=edge.to?.id; else if(edge.to?.id===cur.id) next=edge.from?.id; else continue; edgeIds.add(edge.id); if(next&&!seen.has(next)){seen.add(next); queue.push({id:next,depth:cur.depth+1});}}}
  return {items:[...seen].map(id=>nm.get(id)||em.get(id)).filter(Boolean),edges:(edges||[]).filter(e=>edgeIds.has(e.id))};
}

export function chronicleModel(nodes, events, edges, dayIndex){
  const range=dateRange(events,dayIndex); const rows=workstreamRows(nodes,events); const rowIds=new Set(rows.map(r=>r.id));
  const orphans=[]; const cells=[];
  for(const event of [...(events||[])].sort(byLocalDate)){
    const ids=(event.nodeIds||[]).filter(id=>rowIds.has(id));
    if(!ids.length) orphans.push(event);
    for(const id of ids) cells.push({workstreamId:id,day:event.localDate,event});
  }
  const cross=(edges||[]).filter(edge=>{
    const fromEvent=(events||[]).find(e=>e.id===edge.from?.id); const toEvent=(events||[]).find(e=>e.id===edge.to?.id);
    return Boolean(fromEvent||toEvent||edge.from?.type==='node'||edge.to?.type==='node');
  });
  return {...range,rows,cells,orphans,cross};
}

export function activeDaysForNode(id,events){return uniq(eventsForNode(id,events).map(e=>e.localDate)).length;}
export function recentEventForNode(id,events){return eventsForNode(id,events).at(-1)||null;}

export function investmentRows(nodes,events,edges){
  const workstreams=(nodes||[]).filter(n=>n.nodeType==='workstream');
  const out=[];
  for(const n of workstreams){
    const ev=eventsForNode(n.id,events); const types=ev.map(e=>e.eventType); const related=relatedEdges(n.id,edges); const reach=uniq(related.flatMap(e=>[e.from?.id,e.to?.id]).filter(id=>id!==n.id));
    const correctionCount=types.filter(t=>['correction','failure-correction','rejection','revert'].includes(t)).length;
    const durable=types.filter(t=>['implementation','decision','discovery','scheduled-output'].includes(t)).length;
    const leverage = reach.length>=3||types.includes('decision')?'high':durable>=2?'medium':'emerging';
    const rework = correctionCount>=2?'high':correctionCount===1?'medium':'low';
    const closure = types.includes('rejection')?'reopened':n.status==='implemented'?'closed':n.status==='active'?'active':'defined';
    out.push({...n,events:ev,activeDays:activeDaysForNode(n.id,events),leverage,rework,closure,reach,recent:ev.at(-1)||null});
  }
  const rank={high:3,medium:2,emerging:1,low:0};
  return out.sort((a,b)=>(rank[b.leverage]-rank[a.leverage])||(b.activeDays-a.activeDays)||compare(a.title,b.title));
}

export function searchAll(query,{nodes=[],events=[],evidence=[]}={}){
  const q=String(query||'').trim().toLowerCase(); if(!q) return [];
  const score=(obj,type)=>{const hay=[obj.title,obj.summary,obj.description,obj.question,obj.objective,obj.text,obj.kind,obj.eventType,obj.nodeType].filter(Boolean).join(' ').toLowerCase(); if(!hay.includes(q)) return null; const exact=String(obj.title||'').toLowerCase()===q?3:String(obj.title||'').toLowerCase().includes(q)?2:1; return {type,item:obj,score:exact};};
  return [...nodes.map(x=>score(x,'node')),...events.map(x=>score(x,'event')),...evidence.map(x=>score(x,'evidence'))].filter(Boolean).sort((a,b)=>b.score-a.score||compare(a.item.title,b.item.title));
}

export function validateCanonical({evidence=[],events=[],nodes=[],edges=[]}){
  const errors=[]; const eids=new Set(evidence.map(x=>x.id)), nids=new Set(nodes.map(x=>x.id)), vids=new Set(events.map(x=>x.id)); const all=new Set([...nids,...vids]);
  for(const event of events){if(!event.id||!event.title||!event.localDate)errors.push(`Invalid event ${event.id||'(missing id)'}`); for(const id of event.evidenceIds||[])if(!eids.has(id))errors.push(`Event ${event.id} missing evidence ${id}`); for(const id of event.nodeIds||[])if(!nids.has(id))errors.push(`Event ${event.id} missing node ${id}`);}
  for(const edge of edges){if(!all.has(edge.from?.id))errors.push(`Edge ${edge.id} missing from ${edge.from?.id}`); if(!all.has(edge.to?.id))errors.push(`Edge ${edge.id} missing to ${edge.to?.id}`); for(const id of edge.evidenceIds||[])if(!eids.has(id))errors.push(`Edge ${edge.id} missing evidence ${id}`);}
  return errors;
}
