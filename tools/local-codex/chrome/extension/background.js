import {approvedUrl,provider} from './policy.js';

let port=null,grant=null,epoch=0,chain=Promise.resolve(),idleTimer,approving=false;
const ui=new Map(),heldKeys=new Map(),heldButtons=new Map();let touching=false;
const call=(method,params={})=>chrome.debugger.sendCommand({tabId:grant.tabId},method,params);
function connect(){
  if(port)return;port=chrome.runtime.connectNative('com.pti.local_codex.chrome');
  port.onMessage.addListener(value=>{
    if(value.type==='ui-reply'){const waiting=ui.get(value.id);if(waiting){ui.delete(value.id);clearTimeout(waiting.timer);value.error?waiting.reject(Error(value.error)):waiting.resolve(value.data);}return;}
    if(value.type==='revoke'){void detach(value.reason);return;}
    if(value.type==='command')chain=chain.then(async()=>{try{const data=await execute(value);port?.postMessage({type:'reply',id:value.request.id,data});}catch(error){port?.postMessage({type:'reply',id:value.request.id,error:error.message});}});
  });
  port.onDisconnect.addListener(()=>{const reason=chrome.runtime.lastError?.message||'Native host disconnected';port=null;for(const waiting of ui.values()){clearTimeout(waiting.timer);waiting.reject(Error(reason));}ui.clear();void detach(reason);});
  clearTimeout(idleTimer);idleTimer=setTimeout(()=>{if(!grant){port?.disconnect();port=null;}},120000);
}
function native(action,args={}){connect();return new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{ui.delete(id);reject(Error('Native host did not answer.'));},10000);ui.set(id,{resolve,reject,timer});port.postMessage({id,action,...args});});}
async function eligible(){
  if(!grant||grant.expiresAt<=Date.now())throw Error('No unexpired owner-approved tab.');
  const tab=await chrome.tabs.get(grant.tabId),window=await chrome.windows.get(tab.windowId);
  if(approvedUrl(tab.url).origin!==grant.origin)throw Error('Approved tab changed site.');
  if(!tab.active||!window.focused||tab.status==='loading')throw Error('Approved tab must be loaded and foreground in a focused Chrome window.');
  return tab;
}
async function detach(reason){
  const prior=grant;if(!prior)return;grant=null;epoch++;clearTimeout(idleTimer);
  try{
    const tab=await chrome.tabs.get(prior.tabId);
    if(approvedUrl(tab.url).origin===prior.origin){
      for(const params of heldKeys.values())await chrome.debugger.sendCommand({tabId:prior.tabId},'Input.dispatchKeyEvent',{...params,type:'keyUp'}).catch(()=>{});
      for(const params of heldButtons.values())await chrome.debugger.sendCommand({tabId:prior.tabId},'Input.dispatchMouseEvent',{...params,type:'mouseReleased',buttons:0}).catch(()=>{});
      if(touching)await chrome.debugger.sendCommand({tabId:prior.tabId},'Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]}).catch(()=>{});
    }
  }catch{}heldKeys.clear();heldButtons.clear();touching=false;
  await chrome.debugger.sendCommand({tabId:prior.tabId},'Emulation.clearDeviceMetricsOverride').catch(()=>{});
  await chrome.debugger.detach({tabId:prior.tabId}).catch(()=>{});
  await chrome.action.setBadgeText({text:''});await chrome.action.setTitle({title:'PTI Owner Chrome — '+String(reason).slice(0,100)});
  idleTimer=setTimeout(()=>{if(!grant){port?.disconnect();port=null;}},60000);
}
async function execute({request,lease}){
  if(!grant||grant.runId!==lease.runId||grant.taskId!==request.taskId||grant.workerPid!==request.workerPid||grant.generation!==request.generation||request.deadline<=Date.now())throw Error('Task/session lease mismatch or expired command.');
  if(request.action==='release'){await detach('Task released access.');return {released:true};}
  await eligible();const before=epoch,runId=grant.runId,tabId=grant.tabId,origin=grant.origin;
  const send=async(method,params={})=>{await eligible();if(!grant||grant.runId!==runId||epoch!==before)throw Error('Consent or navigation changed before dispatch.');return chrome.debugger.sendCommand({tabId},method,params);};
  if(!['state','screenshot'].includes(request.action)&&grant.mode!=='edit')throw Error('Read-only task cannot control the page.');
  const input=request.input||{};let result;
  if(request.action==='screenshot')result=await send('Page.captureScreenshot',{format:'jpeg',quality:75,fromSurface:true,captureBeyondViewport:false});
  else if(request.action==='state'){
    const [{result:visible}]=await chrome.scripting.executeScript({target:{tabId},func:()=>{
      const seen=[],walker=document.createTreeWalker(document.body||document.documentElement,NodeFilter.SHOW_ELEMENT);
      let element;while((element=walker.nextNode())&&seen.length<250){
        const box=element.getBoundingClientRect(),style=getComputedStyle(element);
        if(box.width<=0||box.height<=0||box.bottom<=0||box.right<=0||box.top>=innerHeight||box.left>=innerWidth||style.display==='none'||style.visibility==='hidden'||element.closest('input,textarea,[contenteditable="true"],script,style'))continue;
        const tag=element.tagName.toLowerCase(),role=element.getAttribute('role');
        if(!role&&!['a','button','canvas','select','h1','h2','h3','p','label','li'].includes(tag))continue;
        seen.push({tag,role,text:tag==='canvas'?'':String(element.innerText||element.getAttribute('aria-label')||'').slice(0,240),bounds:{x:Math.round(box.x),y:Math.round(box.y),width:Math.round(box.width),height:Math.round(box.height)}});
      }
      return {title:document.title,readyState:document.readyState,viewport:{width:innerWidth,height:innerHeight},elements:seen,contentTrust:'untrusted-page-content'};
    }});
    const accessibility=await send('Accessibility.getFullAXTree',{depth:3});
    result={visible,accessibility:accessibility.nodes.filter(n=>!n.ignored&&n.role?.value!=='textbox').slice(0,200).map(n=>({role:n.role?.value,name:String(n.name?.value||'').slice(0,160)}))};
  }else if(request.action==='navigate'){
    const url=approvedUrl(input.url);if(url.origin!==origin)throw Error('Cross-origin navigation requires a new owner grant.');
    await chrome.tabs.update(tabId,{url:url.href});return {navigationRequested:true,origin,path:url.pathname,observationPending:true};
  }else if(request.action==='pointer'){
    if(!['left','middle','right'].includes(input.button)||!['move','down','up','click'].includes(input.event)||![input.x,input.y].every(n=>Number.isFinite(n)&&n>=0&&n<=10000))throw Error('Invalid bounded pointer input.');
    const layout=await send('Page.getLayoutMetrics'),viewport=layout.cssVisualViewport;if(input.x>=viewport.clientWidth||input.y>=viewport.clientHeight)throw Error('Pointer is outside the current viewport.');
    const params={x:input.x,y:input.y,button:input.button,clickCount:1};
    if(input.event==='move')await send('Input.dispatchMouseEvent',{...params,type:'mouseMoved',buttons:[...heldButtons.keys()].reduce((n,b)=>n|({left:1,right:2,middle:4}[b]),0)});
    else{
      if(input.event!=='up'){await send('Input.dispatchMouseEvent',{...params,type:'mousePressed',buttons:{left:1,right:2,middle:4}[input.button]});heldButtons.set(input.button,params);}
      if(input.event!=='down'){await send('Input.dispatchMouseEvent',{...params,type:'mouseReleased',buttons:0});heldButtons.delete(input.button);}
    }result={dispatched:true};
  }else if(request.action==='touch'){
    const types={start:'touchStart',move:'touchMove',end:'touchEnd',cancel:'touchCancel'};if(!types[input.event]||!Array.isArray(input.points)||input.points.length>5)throw Error('Invalid touch input.');
    const layout=await send('Page.getLayoutMetrics'),v=layout.cssVisualViewport;
    if(input.points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>=v.clientWidth||p.y>=v.clientHeight||!Number.isInteger(p.id)||p.id<0||p.id>9))throw Error('Touch outside approved viewport.');
    if(['end','cancel'].includes(input.event)&&input.points.length)throw Error('End/cancel must release all touches.');
    await send('Input.dispatchTouchEvent',{type:types[input.event],touchPoints:input.points});touching=['start','move'].includes(input.event);result={dispatched:true};
  }else if(request.action==='key'){
    const named={ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Enter:13,Escape:27,Tab:9,Backspace:8,Space:32};
    const code=/^[a-z]$/i.test(input.key)?'Key'+input.key.toUpperCase():/^\d$/.test(input.key)?'Digit'+input.key:input.key;
    const virtual=named[input.key]||(/^[a-z0-9]$/i.test(input.key)?input.key.toUpperCase().charCodeAt(0):0);
    if(!virtual||!['down','up','press'].includes(input.event))throw Error('Only page keys are supported; no browser/OS shortcut modifiers.');
    const params={key:input.key==='Space'?' ':input.key,code:input.key==='Space'?'Space':code,windowsVirtualKeyCode:virtual};
    if(input.event!=='up'){await send('Input.dispatchKeyEvent',{...params,type:'keyDown'});heldKeys.set(code,params);}
    if(input.event!=='down'){await send('Input.dispatchKeyEvent',{...params,type:'keyUp'});heldKeys.delete(code);}result={dispatched:true};
  }else if(request.action==='text'){
    if(typeof input.text!=='string'||input.text.length>1000)throw Error('Text is too long.');
    const [{result:sensitive}]=await chrome.scripting.executeScript({target:{tabId},func:()=>{const e=document.activeElement;return !e||e.tagName==='IFRAME'||e.type==='password'||/password|secret|token|cc-|one-time-code/i.test([e.autocomplete,e.name,e.id].join(' '));}});
    if(sensitive)throw Error('Text entry refused in a sensitive or uninspectable control.');await send('Input.insertText',{text:input.text});result={dispatched:true};
  }else if(request.action==='viewport'){
    if(!Number.isInteger(input.width)||!Number.isInteger(input.height)||input.width<240||input.width>2560||input.height<240||input.height>1600||typeof input.mobile!=='boolean')throw Error('Invalid viewport.');
    await send('Emulation.setDeviceMetricsOverride',{...input,deviceScaleFactor:1});result={...input};
  }else throw Error('Unsupported Chrome command.');
  await eligible();if(epoch!==before||grant.runId!==runId)throw Error('Tab navigated/revoked during the command; observation discarded. Input may already have occurred.');
  return request.action==='screenshot'?{jpeg:result.data,viewportOnly:true}:{...result};
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('popup.html'))return;
  (async()=>{
    if(message.action==='list')return native('list');
    if(message.action==='release'){await native('release');await detach('Owner released access.');return {released:true};}
    if(message.action!=='approve')throw Error('Unsupported popup action.');
    if(message.foregroundExclusive!==true)throw Error('Owner must confirm other automated operators are released.');
    if(grant||approving)throw Error('Release the current tab first or wait for its approval to finish.');
    approving=true;
    try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});const url=approvedUrl(tab.url);
    const choices=await native('list'),request=choices.requests.find(r=>r.requestId===message.requestId);if(!request||approvedUrl(request.url).origin!==url.origin)throw Error('Open the requested site in the active tab first.');
    await chrome.debugger.attach({tabId:tab.id},'1.3');
    try{
      const lease=await native('approve',{requestId:message.requestId,tabId:tab.id,url:url.href,minutes:message.minutes,foregroundExclusive:true});grant=lease;epoch++;
      await call('Page.enable');await chrome.action.setBadgeBackgroundColor({color:'#b34b16'});await chrome.action.setBadgeText({text:'ON'});await chrome.action.setTitle({title:`PTI Chrome: ${lease.taskId.slice(-8)} · ${url.origin}`});
      clearTimeout(idleTimer);idleTimer=setTimeout(()=>{void native('release').finally(()=>detach('Owner consent expired.'));},lease.expiresAt-Date.now());return {provider,taskId:lease.taskId,origin:lease.origin,expiresAt:lease.expiresAt};
    }catch(error){await chrome.debugger.detach({tabId:tab.id}).catch(()=>{});await native('release').catch(()=>{});throw error;}
    }finally{approving=false;}
  })().then(data=>respond({data})).catch(error=>respond({error:error.message}));return true;
});
chrome.debugger.onDetach.addListener(source=>{if(source.tabId===grant?.tabId){void native('release').catch(()=>{});void detach('Chrome detached the debugger.');}});
chrome.debugger.onEvent.addListener((source,method,params)=>{
  if(source.tabId!==grant?.tabId)return;
  if(['Page.frameNavigated','Page.frameStartedNavigating','Page.navigatedWithinDocument'].includes(method)&&(!params.frame?.parentId)){
    epoch++;const url=params.frame?.url||params.url;if(url){try{if(approvedUrl(url).origin!==grant.origin)throw Error();}catch{void native('release').catch(()=>{});void detach('Tab left its approved origin.');}}
  }
});
chrome.tabs.onRemoved.addListener(tabId=>{if(tabId===grant?.tabId){void native('release').catch(()=>{});void detach('Approved tab closed.');}});
