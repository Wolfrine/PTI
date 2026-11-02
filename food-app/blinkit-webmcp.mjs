import {projectDetail} from './blinkit-projection.mjs';
const origin='https://pti-app-2ab59-morsel.web.app';
const endpoint='https://pti-firestore-mcp-185802494856.asia-south1.run.app/morsel/blinkit';

// Token is obtained inside the app per request. It never enters tool input/output,
// storage, URLs or logs. No Blinkit transport or browser session is accessed here.
export function createMorselBlinkitBridge({document,location,getCurrentUser,fetchImpl=fetch}){
  let generation=0,controller=null;
  async function setUser(user){
    const version=++generation;controller?.abort();controller=null;
    if(!user||location.origin!==origin||typeof document.modelContext?.registerTool!=='function')return {registered:false};
    const lifetime=new AbortController();controller=lifetime;
    const current=()=>version===generation&&!lifetime.signal.aborted&&getCurrentUser()?.uid===user.uid;
    async function request(action,args={},signal){
      if(!current())return {ok:false,error:{code:'sign_in_required'}};
      const combined=AbortSignal.any([lifetime.signal,AbortSignal.timeout(45000),...(signal?[signal]:[])]);
      try{
        const token=await user.getIdToken();if(!current())return {ok:false,error:{code:'sign_in_required'}};
        const response=await fetchImpl(endpoint,{method:'POST',mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',
          headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,args}),signal:combined});
        const data=await response.json();if(!current())return {ok:false,error:{code:'sign_in_required'}};
        return data;
      }catch{
        if(signal?.aborted)throw signal.reason;
        return {ok:false,error:{code:current()?'service_unavailable':'sign_in_required'}};
      }
    }
    const capabilities=await request('capabilities');
    if(!capabilities.ok||!current())return {registered:false,error:capabilities.error?.code||'owner_authorization_required'};
    try{
      for(const action of ['context','ingest','sync','events']){
        const tool=capabilities.tools.find(t=>t.name==='food_blinkit_'+action);if(!tool)throw Error('missing_tool');
        const inputSchema=action==='ingest'?{type:'object',additionalProperties:false,required:['records'],properties:{records:{type:'array',minItems:1,maxItems:10,items:tool.inputSchema}}}:tool.inputSchema;
        await document.modelContext.registerTool({name:'morsel_blinkit_'+action,
          description:action==='ingest'?'Import already acquired first-party Blinkit FOOD purchase details into the signed-in owner’s Morsel account. Redacts unrelated data and verifies replay without placing orders.':tool.description,
          inputSchema,annotations:{readOnlyHint:action==='context',untrustedContentHint:true},
          execute:async(input,{signal}={})=>{
            if(!current())return {ok:false,error:{code:'sign_in_required'}};
            if(action!=='ingest')return request(action,input,signal);
            if(!Array.isArray(input?.records)||input.records.length<1||input.records.length>10)return {ok:false,error:{code:'bounded_records_required'}};
            try{
              const records=input.records.map(r=>({detail:projectDetail(r.detail),capturedAt:r.capturedAt,
                ...(r.listPlacedText!==undefined?{listPlacedText:r.listPlacedText}:{}),...(r.runId?{runId:r.runId}:{}),...(r.expectedRevision?{expectedRevision:r.expectedRevision}:{}),...(r.eventId?{eventId:r.eventId,eventLease:r.eventLease,sourceRow:r.sourceRow}:{})}));
              return request(action,{records},signal);
            }catch{return {ok:false,error:{code:'incomplete_detail'}};}
          }
        },{signal:lifetime.signal});
        if(!current()){lifetime.abort();return {registered:false};}
      }
      return {registered:true};
    }catch{lifetime.abort();return {registered:false,error:'registration_unavailable'};}
  }
  return {setUser,dispose(){generation++;controller?.abort();controller=null;}};
}
