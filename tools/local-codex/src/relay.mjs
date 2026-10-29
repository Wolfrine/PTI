import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {home,config,project,read,write,digest,alive,subscriptionEnvironment,VERSION} from './common.mjs';
import {loadCredential,saveCredential,refresh} from './credentials.mjs';
const base='https://pti-firestore-mcp-185802494856.asia-south1.run.app/local-codex/worker';
fs.mkdirSync(path.join(home,'data'),{recursive:true});
const lock=path.join(home,'data','relay.lock');
if(fs.existsSync(lock)){if(alive(read(lock).pid))process.exit(0);fs.unlinkSync(lock);}
const fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));fs.closeSync(fd);
const stateFile=path.join(home,'data','relay-state.json');
let state=fs.existsSync(stateFile)?read(stateFile):{instanceId:randomUUID(),active:null};
let token='',until=0,client,lastSuccess=state.lastSuccess||0,stopping=false,authUntil=0,cachedAuth;
function persist(){write(stateFile,state);}
async function local(name,args={}){
  if(!client){const candidate=new Client({name:'pti-codex-relay',version:VERSION});try{await candidate.connect(new StdioClientTransport({command:process.execPath,args:[path.join(path.dirname(fileURLToPath(import.meta.url)),'server.mjs')],cwd:home,env:subscriptionEnvironment(),stderr:'pipe'}));client=candidate;client.onclose=()=>{client=undefined;authUntil=0;};}catch(error){await candidate.close().catch(()=>{});throw error;}}
  const result=await client.callTool({name,arguments:args});if(result.isError){const error=Error(result.content?.[0]?.text||'Local task failed.');error.scope='local';error.retryable=error.message==='The previous worker is still exiting; retry shortly.';throw error;}return result.structuredContent||JSON.parse(result.content[0].text);
}
async function api(action,body){
  if(Date.now()>until){const session=await refresh(await loadCredential());await saveCredential(session.refreshToken);token=session.idToken;until=Date.now()+3000000;}
  const response=await fetch(`${base}/${action}`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  if(!response.ok){await response.body?.cancel();if(response.status===401||response.status===400)until=0;throw Error(response.status===409?'lease_lost':'Relay request unavailable.');}return response.json();
}
function snapshot(job){return {status:job.status==='queued'?'running':job.status,final:job.final||null,error:job.error?.slice(0,2000)||null,messages:job.messages.slice(-10).map(m=>({text:m.text,phase:m.phase||null})),pending:job.pending||[],...(job.model?{model:job.model}:{})};}
async function authMode(){
  // A local no-model probe verifies the same installed runtime's auth mode. Worker checks again before every turn.
  if(Date.now()>authUntil){const health=await local('bridge_status');cachedAuth=health.authMode;authUntil=Date.now()+60000;}return cachedAuth;
}
process.on('SIGINT',()=>stopping=true);process.on('SIGTERM',()=>stopping=true);
try{
  while(!stopping){
    try{
      if(state.active&&Date.now()-lastSuccess>45000){if(state.active.localId)await local('cancel_task',{task_id:state.active.localId});}
      const mode=await authMode();
      if(mode!=='chatgpt')throw Error('ChatGPT subscription sign-in required.');
      const heartbeat={instanceId:state.instanceId,authMode:'chatgpt',version:VERSION,projects:Object.keys(config().projects).map(key=>{try{return {...project(key),available:true};}catch{return {key,name:key,path:'F:/unavailable',available:false};}})};
      const active=state.active;
      const response=await api('poll',{heartbeat,...(active?{active:{id:active.id,generation:active.generation,lease:active.lease}}:{})});
      lastSuccess=Date.now();state.lastSuccess=lastSuccess;persist();
      if(response.job){state.active={...response.job,localId:null};persist();}
      if(state.active){
        const job=state.active;
        if(!job.localId){
          const request_key=`relay-${job.id}-${job.generation}`;
          const previous=state.localTasks?.[job.id];
          const result=previous?await local('continue_task',{task_id:previous,prompt:job.prompt,request_key}):await local('start_task',{project:job.project,prompt:job.prompt,mode:job.mode,request_key});
          job.localId=result.id;state.localTasks||={};state.localTasks[job.id]=result.id;persist();
        }
        if(response.controls?.cancel)await local('cancel_task',{task_id:job.localId});
        for(const answer of response.controls?.responses||[]){const {task_id,...rest}=answer;try{await local('respond_to_task',{task_id:job.localId,...rest});}catch{/* Responses are idempotent; a completed request can already be absent. */}}
        const current=await local('get_task',{task_id:job.localId,wait_seconds:0});
        await api('report',{id:job.id,generation:job.generation,lease:job.lease,snapshot:snapshot(current)});
        if(['completed','failed','interrupted'].includes(current.status)){state.active=null;persist();}
      }
      write(path.join(home,'data','status.json'),{version:VERSION,at:new Date().toISOString(),state:'online',authMode:'chatgpt',activeTask:state.active?.id||null});
    }catch(error){
      if(error.message==='lease_lost'&&state.active){if(state.active.localId)await local('cancel_task',{task_id:state.active.localId}).catch(()=>{});state.active=null;persist();}
      else if(error.scope==='local'&&!error.retryable&&state.active){const job=state.active;try{await api('report',{id:job.id,generation:job.generation,lease:job.lease,snapshot:{status:'failed',error:error.message.slice(0,2000)}});state.active=null;persist();}catch{/* Keep the durable claim until the relay accepts its terminal report. */}}
      write(path.join(home,'data','status.json'),{version:VERSION,at:new Date().toISOString(),state:'unavailable',errorCode:error.message==='lease_lost'?'lease_lost':'connection_or_signin_required'});
    }
    await new Promise(resolve=>setTimeout(resolve,state.active?3000:15000));
  }
}finally{if(state.active?.localId)await local('cancel_task',{task_id:state.active.localId}).catch(()=>{});await client?.close();if(fs.existsSync(lock)&&read(lock).pid===process.pid)fs.unlinkSync(lock);}
