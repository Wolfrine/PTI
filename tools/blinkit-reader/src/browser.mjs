import {chromium} from 'playwright';
import {createBlinkitReader,decodeEnvelope} from './canonical/connector.mjs';
import {projectPage} from './canonical/model.mjs';
const urls={morsel:'https://pti-app-2ab59-morsel.web.app/',blinkit:'https://blinkit.com/'};
const permitted={blinkit:['get_session','list_orders','get_order'],morsel:['morsel_blinkit_context','morsel_blinkit_ingest','morsel_blinkit_events']};
export class BrowserRuntime{
 constructor({profile,chromePath}){this.profile=profile;this.chromePath=chromePath;this.pages={};}
 async open(){this.context=await chromium.launchPersistentContext(this.profile,{executablePath:this.chromePath,headless:true,chromiumSandbox:true,args:['--enable-features=WebMCP'],viewport:{width:1200,height:900}});}
 async close(){await this.context?.close();this.context=null;this.pages={};}
 async surface(kind,{reload=false}={}){
  let page=this.pages[kind];if(!page||page.isClosed()){page=await this.context.newPage();this.pages[kind]=page;reload=true;}
  if(reload){const response=await page.goto(urls[kind],{waitUntil:'domcontentloaded',timeout:30000});this[kind+'Status']=response?.status();}
  if(new URL(page.url()).origin!==new URL(urls[kind]).origin)throw Object.assign(Error('unexpected_origin'),{code:'first_party_tools_unavailable'});
  return page;
 }
 async tools(kind){
  const page=await this.surface(kind);
  return page.evaluate(async()=>typeof document.modelContext?.getTools==='function'?(await document.modelContext.getTools()).map(t=>({name:t.name})):[]);
 }
 async call(kind,base,args){
  if(!permitted[kind]?.includes(base))throw Error('read_only_boundary');
  const page=await this.surface(kind);
  return page.evaluate(async({base,args})=>{
   const api=document.modelContext;if(typeof api?.getTools!=='function'||typeof api.executeTool!=='function')throw Error('webmcp_unavailable');
   const found=(await api.getTools()).filter(t=>new RegExp('^'+base+'(?:__[A-Za-z0-9_-]+)?$').test(t.name));
   if(found.length!==1)throw Error('tool_unavailable');
   return api.executeTool(found[0],args);
  },{base,args});
 }
 async morsel(action,args){
  const raw=await this.call('morsel','morsel_blinkit_'+action,args);let data=raw;
  for(let i=0;i<5;i++){
   if(typeof data==='string'){data=JSON.parse(data);continue;}
   if(data?.structuredContent){data=data.structuredContent;continue;}
   if(data?.content&&!data.ok){data=data.content.find(c=>c.type==='text')?.text;continue;}break;
  }
  if(data?.ok===false)throw Object.assign(Error('canonical_rejected'),{code:data.error?.code||'transient'});
  return data;
 }
 persistence(){return {events:args=>this.morsel('events',args),context:args=>this.morsel('context',args),ingest:args=>this.morsel('ingest',args)};}
 async source(){
  const page=await this.surface('blinkit');
  if(this.blinkitStatus===403)throw Object.assign(Error('source_access_denied'),{code:'source_access_denied'});
  const names=await this.tools('blinkit');
  const reader=createBlinkitReader({discoverTools:async()=>names,callTool:(name,args)=>this.call('blinkit',name.replace(/__.*/,''),args)});
  await reader.open();
  return {detail:order=>reader.detail(order),list:async(cursor=null)=>{
   const args=cursor===null?{limit:10}:{limit:10,cursor};
   for(let attempt=0;attempt<2;attempt++){
    const value=decodeEnvelope(await this.call('blinkit','list_orders',args));
    if(!value.ok){if(attempt===0&&['busy','rate_limited','unavailable'].includes(value.error?.code)){const delay=value.error?.retryAfterMs||1000;if(delay<=60000){await page.waitForTimeout(delay);continue;}}throw Object.assign(Error('source_read_failed'),{code:value.error?.code});}
    const result=value.result;projectPage(result,cursor);if(!result.truncated)return result;
   }throw Error('truncated');
  }};
 }
}
