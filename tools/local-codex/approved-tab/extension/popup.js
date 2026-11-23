import {pageUrl, matchesPage} from './scope.mjs';
const host='com.pti.local_codex.tab_share';
const el=id=>document.getElementById(id);
const status=message=>{el('status').textContent=message;};
let requests=[], preview=null, busy=false, revision=0;
async function native(message) {
  const response=await chrome.runtime.sendNativeMessage(host,message);
  if(!response?.ok)throw Error(response?.error || 'Could not reach the Local Codex helper.');
  return response.data;
}
function messageText(e){return e?.message || String(e);}
function request(){return requests.find(r=>r.id===el('requests').value);}
async function selectedTab(){return (await chrome.tabs.query({active:true,currentWindow:true}))[0];}
function samePage(url,expected){try{return matchesPage(url,expected);}catch{return false;}}

async function inspect(tab, req) {
  const [frame]=await chrome.scripting.executeScript({
    target:{tabId:tab.id},args:[pageUrl(tab.url),req.linkText],
    func:(expected,label)=>{
      const url=new URL(location.href);url.hash='';
      if(url.href!==expected)throw Error('The page changed before it could be shared.');
      const visible=node=>node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) && node.getClientRects().length>0;
      const clean=node=>(node.innerText||'').replace(/\s+/g,' ').trim();
      const headings=[...document.querySelectorAll('h1,h2,h3,[role="heading"]')].filter(visible).map(clean).filter(Boolean).slice(0,16).map(t=>t.slice(0,240));
      let link=null;
      if(label){
        const links=[...document.querySelectorAll('a[href]')].filter(a=>visible(a) && clean(a)===label);
        if(links.length!==1)throw Error('The exact link must be visible and unique on this page.');
        link={text:label,url:links[0].href};
      }
      return {page:{title:document.title.slice(0,240),url:url.href,headings},link};
    }
  });
  if(!frame?.result)throw Error('Chrome did not return page information.');
  if(frame.result.link)frame.result.link.url=pageUrl(frame.result.link.url);
  return frame.result;
}
async function show(){
  const ticket=++revision;
  preview=null;
  el('preview').hidden=true;el('share').hidden=true;el('open').hidden=true;
  const r=request();if(!r)return;
  el('url').textContent=r.url;
  el('link').textContent=r.linkText ? 'Requested link: '+r.linkText : '';
  const tab=await selectedTab();
  if(ticket!==revision)return;
  if(!samePage(tab?.url,r.url)){
    status('Open the requested page, then click PTI Owner Chrome on that tab.');
    el('open').hidden=false;return;
  }
  try {
    const sample=await inspect(tab,r);
    if(ticket!==revision)return;
    preview={tabId:tab.id,...sample};
    el('title').textContent=sample.page.title;
    el('headings').replaceChildren(...sample.page.headings.map(h=>{const item=document.createElement('li');item.textContent=h;return item;}));
    el('destination').textContent=sample.link ? 'Opens '+sample.link.url : '';
    el('share').textContent=sample.link ? 'Share and open link' : 'Share with ChatGPT';
    el('preview').hidden=false;el('share').hidden=false;
    status('Review the page information before sharing.');
  }catch(e){if(ticket===revision)status(messageText(e));}
}
async function refresh(){
  const selected=el('requests').value;
  requests=(await native({action:'list'})).requests;
  el('requests').replaceChildren(...requests.map(r=>{
    const opt=document.createElement('option');opt.value=r.id;
    opt.textContent=(r.taskTitle||'Browser request')+' · '+r.id.slice(0,8);return opt;
  }));
  if(requests.some(r=>r.id===selected))el('requests').value=selected;
  el('panel').hidden=!requests.length;
  if(requests.length)await show();else status('No browser requests pending.');
}
async function run(fn){
  if(busy)return;busy=true;
  const controls=[...document.querySelectorAll('button,select')];controls.forEach(c=>c.disabled=true);
  try{await fn();}catch(e){status(messageText(e));}finally{busy=false;controls.forEach(c=>c.disabled=false);}
}
el('open').onclick=()=>run(async()=>{
  await chrome.tabs.create({url:pageUrl(request().url),active:true});window.close();
});
el('share').onclick=()=>run(async()=>{
  const r=request(),tab=await selectedTab();
  if(!preview || tab?.id!==preview.tabId || !samePage(tab.url,r.url))throw Error('The active tab changed. Refresh before sharing.');
  const current=await inspect(tab,r);
  if(JSON.stringify(current)!==JSON.stringify({page:preview.page,link:preview.link})){await show();status('The page changed. Review the updated preview.');return;}
  const next=await native({action:'share',id:r.id,stage:r.status,...current});
  if(next.status==='awaiting_destination'){
    await chrome.tabs.update(tab.id,{url:pageUrl(next.url)});
    window.close();return;
  }
  await refresh();status('Shared with the original Local Codex request.');
});
el('decline').onclick=()=>run(async()=>{
  const r=request();await native({action:'decline',id:r.id,stage:r.status});
  await refresh();status('Request declined.');
});
el('refresh').onclick=()=>run(refresh);
el('requests').onchange=()=>run(show);
void run(refresh);
