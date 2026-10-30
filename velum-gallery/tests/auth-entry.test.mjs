import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Execute the shipped handlers with a minimal DOM/services; no OAuth/cloud/media.
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function handler(name){const match=source.match(new RegExp(name==='quickExit'?`function ${name}\\(\\)[^\\n]+`:`(?:async )?function ${name}\\([^]*?\\n}`));assert.ok(match,`Missing handler ${name}`);return match[0];}
function fixture({fresh=false,user=true,studio=false}={}){
 const nodes=new Map(),nav=[];
 const node=id=>{if(!nodes.has(id)){const classes=new Set();nodes.set(id,{textContent:'',disabled:false,dataset:{},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c);}},querySelector:()=>null});}return nodes.get(id);};
 for(const view of ['drift','browse','studio','stats']){const button=node(`nav-${view}`);button.dataset.view=view;nav.push(button);node(`#${view}View`).classList.toggle('active',view===(studio?'studio':'drift'));}
 node('#authGate').classList.add('open');
 const calls={popups:[],toasts:[],sync:0,clear:0};
 class Provider{constructor(){this.scopes=[];this.parameters={};}addScope(scope){this.scopes.push(scope);}setCustomParameters(parameters){this.parameters=parameters;}static credentialFromResult(){return{accessToken:'fixture-read'};}}
 const context={Date,Headers,console:{error(){}},auth:{currentUser:user?{uid:'owner-fixture'}:null},accessToken:fresh?'fixture-read':'',tokenIssuedAt:fresh?Date.now():0,connectingDrive:false,pendingGalleryView:'',initializedGallery:false,DRIVE_SCOPE:'https://www.googleapis.com/auth/drive.readonly',
  $:node,document:{querySelectorAll:()=>nav},authGate:node('#authGate'),authTitle:node('#authTitle'),authCopy:node('#authCopy'),authStatus:node('#authStatus'),connectBtn:node('#connectBtn'),syncBtn:node('#syncBtn'),syncLabel:node('#syncLabel'),driftMedia:node('#driftMedia'),
  GoogleAuthProvider:Provider,signInWithPopup:async(_auth,provider)=>{calls.popups.push(provider);return{user:context.auth.currentUser};},sessionStorage:{setItem(){},removeItem(){}},window:{__velumInteraction:{clearAdvance(){}},dispatchEvent(){}},studioDrive:{clear(){calls.clear++;}},Event:class{},
  gestures:{fit(){}},finalizeView(){},renderBrowse(){},scheduleAdvance(){},showToast:message=>calls.toasts.push(message),rememberDiscovery(){},images:[],imageMap:new Map(),initGallery(){context.initializedGallery=true;},
  listPrivateImages:async()=>{calls.sync++;return[{id:'fixture-media'}];},onAuthStateChanged:(_auth,callback)=>{context.changed=callback;}};
 runInNewContext(['tokenProbablyFresh','setAuthMessage','activateView','connectDrive','syncDrive','quickExit'].map(handler).join('\n')+'\n'+source.slice(source.lastIndexOf('onAuthStateChanged(auth,')),context);
 return{context,node,calls};
}
test('signed-in owner enters Studio without a Drive token on boot and reload',async()=>{
 for(let reload=0;reload<2;reload++){
  const f=fixture();await f.context.changed(f.context.auth.currentUser);
  assert.equal(f.node('#studioView').classList.contains('active'),true);assert.equal(f.node('#authGate').classList.contains('open'),false);assert.equal(f.calls.sync,0);assert.equal(f.calls.popups.length,0);
 }
});
test('signed-out entry keeps the existing private collection sign-in gate',async()=>{
 const f=fixture({user:false});await f.context.changed(null);assert.equal(f.node('#authGate').classList.contains('open'),true);assert.equal(f.calls.popups.length,0);
});
test('fresh Drift token reload keeps the gallery path and does not ask Google again',async()=>{
 const f=fixture({fresh:true});await f.context.changed(f.context.auth.currentUser);assert.equal(f.calls.sync,1);assert.equal(f.calls.popups.length,0);assert.equal(f.node('#driftView').classList.contains('active'),true);
});
test('expired server-side Drift access during boot falls back to signed-in Studio',async()=>{
 const f=fixture({fresh:true});f.context.listPrivateImages=async()=>{f.context.accessToken='';throw new Error('expired');};await f.context.changed(f.context.auth.currentUser);assert.equal(f.node('#studioView').classList.contains('active'),true);assert.equal(f.node('#authGate').classList.contains('open'),false);
});
test('late failed Drift sync cannot cover an already open Studio',async()=>{
 const f=fixture({fresh:true});let reject;
 f.context.listPrivateImages=()=>new Promise((_,fail)=>{reject=fail;});const sync=f.context.syncDrive({initial:true});f.context.activateView('studio');reject(new Error('Drive unavailable'));await sync;
 assert.equal(f.node('#studioView').classList.contains('active'),true);assert.equal(f.node('#authGate').classList.contains('open'),false);
});
test('explicit gallery entry requests only readonly, resumes requested view and never forces consent',async()=>{
 const f=fixture({studio:true});f.context.activateView('browse');assert.equal(f.node('#authGate').classList.contains('open'),true);await f.context.connectDrive();assert.equal(f.calls.popups.length,1);assert.deepEqual([...f.calls.popups[0].scopes],['https://www.googleapis.com/auth/drive.readonly']);assert.equal(f.calls.popups[0].parameters.prompt,undefined);assert.equal(f.node('#browseView').classList.contains('active'),true);
});
test('repeat Connect reuses a fresh Drift token; read consent denial leaves Studio available',async()=>{
 const cached=fixture({fresh:true});await cached.context.connectDrive();assert.equal(cached.calls.popups.length,0);
 const denied=fixture({studio:true});denied.node('#authGate').classList.remove('open');denied.context.signInWithPopup=async()=>{throw new Error('Consent denied');};await denied.context.connectDrive();assert.equal(denied.node('#authGate').classList.contains('open'),false);assert.equal(denied.context.connectingDrive,false);
});
test('Quick Exit still clears Studio Drive and shows the neutral screen',()=>{
 const f=fixture({studio:true});f.context.quickExit();assert.equal(f.calls.clear,1);assert.equal(f.node('#neutralScreen').classList.contains('open'),true);
 // Real PIN return handling is retained in bootstrap, separately browser-tested.
 const bootstrap=readFileSync(new URL('../bootstrap.js',import.meta.url),'utf8');assert.match(bootstrap,/await showPinGate\(\{ setup: false \}\)/);
});
test('write permission is incremental and is never forced through consent parameters',()=>{
 assert.doesNotMatch(source,/prompt\s*:\s*['"]consent['"]/);assert.match(source,/provider\.addScope\(scope\)/);assert.match(source,/reauthenticateWithPopup\(auth\.currentUser,provider\)/);
});
