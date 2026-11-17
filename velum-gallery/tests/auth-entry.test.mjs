import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Execute the shipped handlers with a minimal DOM/services; no OAuth/cloud/media.
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function handler(name){const match=source.match(new RegExp(name==='quickExit'?`function ${name}\\(\\)[^\\n]+`:`(?:async )?function ${name}\\([^]*?\\n}`));assert.ok(match,`Missing handler ${name}`);return match[0];}
function fixture({fresh=false,user=true,studio=false}={}){
 const nodes=new Map(),nav=[];
 const node=id=>{if(!nodes.has(id)){const classes=new Set();nodes.set(id,{textContent:'',disabled:false,dataset:{},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c);}},querySelector:()=>null,querySelectorAll:()=>[],replaceChildren(){}});}return nodes.get(id);};
 for(const view of ['drift','browse','studio','stats']){const button=node(`nav-${view}`);button.dataset.view=view;nav.push(button);node(`#${view}View`).classList.toggle('active',view===(studio?'studio':'drift'));}
 node('#authGate').classList.add('open');
 const calls={connections:0,toasts:[],sync:0,clear:0},listeners=new Map();let connected=fresh;
 const access={has:()=>connected,restore:async()=>connected,connect:async()=>{if(!connected){calls.connections++;connected=true;}}};
 const context={Date,Headers,AbortController,console:{error(){}},auth:{currentUser:user?{uid:'owner-fixture'}:null},access,connectingDrive:false,pendingGalleryView:'',initializedGallery:false,DRIVE_READ_SCOPE:'https://www.googleapis.com/auth/drive.readonly',galleryOwner:'',galleryEpoch:0,galleryLocked:false,galleryRevision:0,renderSerial:0,galleryRequests:new Set(),history:[],historyIndex:-1,current:{type:'single',ids:[]},browseObserver:null,ambientLayers:[],browseGrid:node('#browseGrid'),revokeObjectUrls(){},libraryControls:{resume:async()=>{},clear(){}},
  gallerySync:null,galleryListingState:'idle',pendingDiscoveryBase:null,discovered:{},browseState:null,browseRenderVersion:0,browseStatus:node('browse-status'),browsePagination:node('browse-pagination'),updateBrowseStatus(){},
  $:node,document:{querySelectorAll:()=>nav},authGate:node('#authGate'),authTitle:node('#authTitle'),authCopy:node('#authCopy'),authStatus:node('#authStatus'),connectBtn:node('#connectBtn'),syncBtn:node('#syncBtn'),syncLabel:node('#syncLabel'),driftMedia:node('#driftMedia'),
  window:{__velumInteraction:{clearAdvance(){}},addEventListener(type,listener){listeners.set(type,listener);},dispatchEvent(event){listeners.get(event.type)?.(event);}},studioDrive:{clear(){calls.clear++;connected=false;}},Event:class{constructor(type){this.type=type;}},
  gestures:{fit(){}},finalizeView(){},renderBrowse(){},scheduleAdvance(){},showToast:message=>calls.toasts.push(message),rememberDiscovery(){},images:[],imageMap:new Map(),initGallery(){context.initializedGallery=true;},
  listPrivateImages:async function*(){calls.sync++;yield{items:[{id:'fixture-media'}],complete:true};},onAuthStateChanged:(_auth,callback)=>{context.changed=callback;}};
 runInNewContext(['tokenProbablyFresh','setAuthMessage','activateView','connectDrive','syncDrive','clearGallerySession','quickExit','restoreGalleryConnection'].map(handler).join('\n')+"\n"+source.match(/window\.addEventListener\('velum:lock',clearGallerySession\);/)[0]+'\n'+source.slice(source.lastIndexOf('onAuthStateChanged(auth,')),context);
 return{context,node,calls};
}
test('signed-in owner retains the Drive connection gate on boot and can explicitly enter Studio',async()=>{
 for(let reload=0;reload<2;reload++){
  const f=fixture();await f.context.changed(f.context.auth.currentUser);
  assert.equal(f.node('#authGate').classList.contains('open'),true);assert.equal(f.calls.sync,0);assert.equal(f.calls.connections,0);
  f.context.activateView('studio');assert.equal(f.node('#studioView').classList.contains('active'),true);assert.equal(f.node('#authGate').classList.contains('open'),false);
 }
});
test('signed-out entry keeps the existing private collection sign-in gate',async()=>{
 const f=fixture({user:false});await f.context.changed(null);assert.equal(f.node('#authGate').classList.contains('open'),true);assert.equal(f.calls.connections,0);
});
test('fresh Drift token reload keeps the gallery path and does not ask Google again',async()=>{
 const f=fixture({fresh:true});await f.context.changed(f.context.auth.currentUser);assert.equal(f.calls.sync,1);assert.equal(f.calls.connections,0);assert.equal(f.node('#driftView').classList.contains('active'),true);
});
test('expired server-side Drift access during boot keeps the connection gate available',async()=>{
 const f=fixture({fresh:true});f.context.listPrivateImages=async function*(){throw new Error('expired');};await f.context.changed(f.context.auth.currentUser);assert.equal(f.node('#driftView').classList.contains('active'),true);assert.equal(f.node('#authGate').classList.contains('open'),true);assert.equal(f.calls.connections,0);
});
test('late failed Drift sync cannot cover an already open Studio',async()=>{
 const f=fixture({fresh:true});let reject;
 f.context.listPrivateImages=async function*(){await new Promise((_,fail)=>{reject=fail;});};const sync=f.context.syncDrive({initial:true});f.context.activateView('studio');reject(new Error('Drive unavailable'));await sync;
 assert.equal(f.node('#studioView').classList.contains('active'),true);assert.equal(f.node('#authGate').classList.contains('open'),false);
});
test('explicit gallery entry uses the shared connection and resumes the requested view',async()=>{
 const f=fixture({studio:true});f.context.activateView('browse');assert.equal(f.node('#authGate').classList.contains('open'),true);await f.context.connectDrive();assert.equal(f.calls.connections,1);assert.equal(f.node('#browseView').classList.contains('active'),true);
});
test('repeat Connect reuses a fresh grant and connection denial leaves Studio available',async()=>{
 const cached=fixture({fresh:true});await cached.context.connectDrive();assert.equal(cached.calls.connections,0);
 const denied=fixture({studio:true});denied.node('#authGate').classList.remove('open');denied.context.access.connect=async()=>{throw new Error('Consent denied');};await denied.context.connectDrive();assert.equal(denied.node('#authGate').classList.contains('open'),false);assert.equal(denied.context.connectingDrive,false);
});
test('Quick Exit still clears Studio Drive and shows the neutral screen',()=>{
 const f=fixture({studio:true});f.context.quickExit();assert.equal(f.calls.clear,1);assert.equal(f.node('#neutralScreen').classList.contains('open'),true);
 // This source assertion leaves the real PIN return flow for owner-device verification.
 const bootstrap=readFileSync(new URL('../bootstrap.js',import.meta.url),'utf8');assert.match(bootstrap,/await showPinGate\(\{ setup: false \}\)/);
});
test('signed-in Drive authorization uses GIS incremental grants without forcing consent',()=>{
 const tokenSource=readFileSync(new URL('../google-drive-token.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/reauthenticateWithPopup/);
 assert.match(source,/requestAccess:\s*scopes\s*=>\s*tokenRequests\.request\(scopes\)/);
 assert.doesNotMatch(tokenSource,/prompt\s*:\s*['"]consent['"]/);
 assert.match(tokenSource,/oauth\.initTokenClient\(/);
 assert.match(tokenSource,/include_granted_scopes:\s*false/);
 assert.match(tokenSource,/requestAccessToken\(\{prompt:\s*['"]['"],\s*login_hint:\s*googleUid\}/);
});
