import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {directory,ipc,read,atomic,alive,taskIdentity,validRequest,approvedUrl,saveArtifact,provider} from './runtime.mjs';

const config=read(path.join(directory,'native-config.json'));
if(process.argv[2]!==`chrome-extension://${config.extensionId}/`)throw Error('Native Messaging caller origin is not the installed PTI extension.');
const lock=path.join(ipc,'native.lock');
if(fs.existsSync(lock)){if(alive(read(lock).pid))throw Error('PTI Chrome is already connected in another profile/window. Release it first.');fs.unlinkSync(lock);}
fs.writeFileSync(lock,JSON.stringify({pid:process.pid}),{flag:'wx'});
let session=null,buffer=Buffer.alloc(0),busy=false,closed=false;const pending=new Map();
function send(value){const body=Buffer.from(JSON.stringify(value));if(body.length>1000000)throw Error('Native host outbound message too large.');const size=Buffer.alloc(4);size.writeUInt32LE(body.length);process.stdout.write(Buffer.concat([size,body]));}
function revoke(reason){session=null;try{fs.unlinkSync(path.join(ipc,'session.json'));}catch{};send({type:'revoke',reason});}
function requests(){return fs.readdirSync(path.join(ipc,'requests')).filter(n=>/^[a-f0-9]{32}\.json$/.test(n)).flatMap(name=>{
  try{const request=read(path.join(ipc,'requests',name));taskIdentity(request.taskId,request.workerPid,request.generation);approvedUrl(request.url);return [request];}catch{return [];}
});}
function matching(request){validRequest(request);if(!session||request.runId!==session.runId||request.taskId!==session.taskId||request.workerPid!==session.workerPid||request.generation!==session.generation||session.expiresAt<=Date.now())throw Error('No matching unexpired owner-approved task/tab lease.');}
function respond(request,value){atomic(path.join(ipc,'responses',request.id+'.json'),{requestId:request.id,provider,...value});}
async function scan(){
  if(busy||closed)return;busy=true;
  try{for(const name of fs.readdirSync(path.join(ipc,'commands')).filter(n=>/^[-a-f0-9]{36}\.json$/.test(n))){
    const file=path.join(ipc,'commands',name);let request;
    try{
      if(fs.lstatSync(file).size>8192)throw Error('Command exceeds bounded protocol size.');request=read(file);if(name!==request.id+'.json')throw Error('Command identity mismatch.');matching(request);
      if(fs.existsSync(path.join(ipc,'responses',name))){fs.unlinkSync(file);continue;}
      if(!['state','screenshot','navigate','pointer','touch','key','text','viewport','release'].includes(request.action))throw Error('Unsupported operation.');
      const completed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(request.id);reject(Error('Chrome did not answer; input outcome unknown. Inspect before retry.'));},Math.max(1,request.deadline-Date.now()));pending.set(request.id,{request,resolve,reject,timer});});
      // Consume BEFORE dispatch: a crash must not replay a click/key/navigation.
      fs.unlinkSync(file);send({type:'command',request,lease:{...session}});
      const reply=await completed;matching(request);
      const metadata={runId:session.runId,tabId:session.tabId,origin:session.origin,operation:request.action,observationVerifiedBy:'local-extension-response',ownerAcceptance:false,audioObserved:false};
      let artifact;
      if(request.action==='screenshot'){
        if(typeof reply.data?.jpeg!=='string'||reply.data.jpeg.length>6000000)throw Error('Screenshot exceeds the viewport evidence limit.');
        const bytes=Buffer.from(reply.data.jpeg,'base64');if(bytes.length<4||bytes[0]!==255||bytes[1]!==216)throw Error('Chrome did not return a JPEG.');
        artifact=saveArtifact(taskIdentity(request.taskId,request.workerPid,request.generation),request.id,'screenshot',bytes,metadata);delete reply.data.jpeg;
      }else if(request.action==='state')artifact=saveArtifact(taskIdentity(request.taskId,request.workerPid,request.generation),request.id,'visible-state',Buffer.from(JSON.stringify(reply.data)),metadata);
      const receipt={...metadata,observedAt:new Date().toISOString(),data:reply.data,artifact:artifact||null};respond(request,receipt);
      fs.appendFileSync(path.join(ipc,'operations.jsonl'),JSON.stringify({requestId:request.id,taskId:request.taskId,...metadata,observedAt:receipt.observedAt,artifact:artifact?.file||null})+'\n');
      if(request.action==='release')revoke('Task released the tab.');
    }catch(error){if(request?.id&&/^[-a-f0-9]{36}$/.test(request.id))respond(request,{error:error.message});try{fs.unlinkSync(file);}catch{}}
  }}finally{busy=false;if(!closed&&fs.readdirSync(path.join(ipc,'commands')).some(name=>/^[-a-f0-9]{36}\.json$/.test(name)))setImmediate(()=>void scan());}
}
async function message(value){
  if(value.type==='reply'){
    const waiting=pending.get(value.id);if(!waiting)return;pending.delete(value.id);clearTimeout(waiting.timer);value.error?waiting.reject(Error(value.error)):waiting.resolve(value);return;
  }
  if(!/^[-a-f0-9]{36}$/.test(value.id||''))throw Error('Invalid owner UI message.');
  try{
    let data;
    if(value.action==='list')data={requests:requests(),session:session?{taskId:session.taskId,origin:session.origin,expiresAt:session.expiresAt}:null,provider};
    else if(value.action==='approve'){
      if(session)throw Error('Release the current tab before approving another task.');
      const request=requests().find(r=>r.requestId===value.requestId);if(!request)throw Error('The selected task/request is no longer active.');
      const origin=approvedUrl(value.url).origin;if(origin!==approvedUrl(request.url).origin)throw Error('Selected tab is not on the requested origin.');
      if(!Number.isInteger(value.tabId)||value.tabId<0||![5,15,30].includes(value.minutes)||value.foregroundExclusive!==true)throw Error('Valid tab, duration and owner foreground exclusivity confirmation are required.');
      session={taskId:request.taskId,workerPid:request.workerPid,generation:request.generation,requestId:request.requestId,runId:randomUUID(),tabId:value.tabId,origin,mode:request.mode,approvedAt:Date.now(),expiresAt:Date.now()+value.minutes*60000};
      atomic(path.join(ipc,'session.json'),session);data={...session};
    }else if(value.action==='release'){revoke('Owner revoked Chrome access.');data={released:true};}
    else throw Error('Unknown owner UI operation.');send({type:'ui-reply',id:value.id,data});
  }catch(error){send({type:'ui-reply',id:value.id,error:error.message});}
}
process.stdin.on('data',chunk=>{
  buffer=Buffer.concat([buffer,chunk]);
  try{while(buffer.length>=4){const length=buffer.readUInt32LE();if(length<2||length>8000000)throw Error('Invalid Chrome Native Messaging size.');if(buffer.length<length+4)break;const payload=buffer.subarray(4,length+4);buffer=buffer.subarray(length+4);message(JSON.parse(payload.toString('utf8'))).catch(close);}}catch{close();}
});
function close(){if(closed)return;closed=true;clearInterval(heartbeat);watcher.close();for(const {timer,reject} of pending.values()){clearTimeout(timer);reject(Error('Chrome disconnected; access revoked.'));}try{fs.unlinkSync(path.join(ipc,'session.json'));}catch{};try{if(read(lock).pid===process.pid)fs.unlinkSync(lock);}catch{};process.exit(0);}
const watcher=fs.watch(path.join(ipc,'commands'),()=>void scan());
const heartbeat=setInterval(()=>{
  atomic(path.join(ipc,'connection.json'),{pid:process.pid,at:Date.now(),provider});
  if(session){try{taskIdentity(session.taskId,session.workerPid,session.generation);if(session.expiresAt<=Date.now())throw Error('Owner consent expired.');}catch{revoke('Task ended/canceled, lost its lease, or consent expired.');}}
},2000);
atomic(path.join(ipc,'connection.json'),{pid:process.pid,at:Date.now(),provider});
process.stdin.on('end',close);process.stdin.on('error',close);process.stdout.on('error',close);process.on('SIGTERM',close);void scan();
