// Read-only projections over the existing capture index. Never infer chat identity.
const timestamp=t=>String(t?.capturedAt||t?.captured_at_utc||'');
const turnParent=t=>t?.harnessConversationId||t?.parentHarnessConversationId||'';
const text=t=>(t?.messages||[]).map(m=>typeof m.content==='string'?m.content:'').join('\n');
export function captureCompleteness(turn){
 const coverage=turn?.coverage||{};
 if(turn?.captureStatus==='partial'||coverage.user_message_copied===false||coverage.assistant_prepared_text_saved===false)return 'partial';
 const messages=turn?.messages||[];
 const pair=['user','assistant'].every(role=>messages.some(m=>m.role===role&&typeof m.content==='string'));
 if(pair&&(turn?.captureStatus==='prepared-complete'||(coverage.user_message_copied===true&&coverage.assistant_prepared_text_saved===true)))return 'prepared-complete';
 return 'unknown';
}
export function sourceLink(value){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='github.com'||!u.pathname.startsWith('/Wolfrine/chatgpt_harness/'))return '';return u.href;}catch{return '';}
}
export function buildDiscussionIndex(conversations=[],turns=[]){
 const sorted=[...turns].sort((a,b)=>timestamp(a).localeCompare(timestamp(b))||String(a.id||'').localeCompare(String(b.id||'')));
 const ids=new Set(conversations.map(c=>c.id));
 return {
  conversations:[...conversations].map(c=>{
   const linked=sorted.filter(t=>turnParent(t)===c.id);
   const count=Number.isInteger(c.turnCount)&&c.turnCount>=0?c.turnCount:null;
   return {...c,turns:linked,indexedTurnCount:linked.length,sourceTurnCount:count,missingIndexedTurns:count===null?null:Math.max(0,count-linked.length)};
  }).sort((a,b)=>String(b.lastCapturedAt||'').localeCompare(String(a.lastCapturedAt||''))||String(a.id).localeCompare(String(b.id))),
  legacyTurns:sorted.filter(t=>!turnParent(t)||!ids.has(turnParent(t))).reverse()
 };
}
export function filterDiscussionIndex(index,{query='',status='',date=''}={}){
 const q=String(query).trim().toLowerCase();
 const matches=t=>(!q||[t.conversationHint,t.userPreview,t.assistantPreview,text(t)].filter(Boolean).join('\n').toLowerCase().includes(q))&&(!status||captureCompleteness(t)===status)&&(!date||String(t.localDate||timestamp(t).slice(0,10))===date);
 return {conversations:index.conversations.filter(c=>{
  const titleMatch=!q||[c.title,c.id].filter(Boolean).join(' ').toLowerCase().includes(q);
  const turnMatch=c.turns.some(matches);
  return titleMatch&&!status&&!date||turnMatch;
 }),legacyTurns:index.legacyTurns.filter(matches)};
}
