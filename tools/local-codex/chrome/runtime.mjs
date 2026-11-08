import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {approvedUrl,provider} from './extension/policy.js';

export {provider,approvedUrl};
export const root = 'F:\\Workspace\\Support\\LocalCodexBridge';
export const directory = path.join(root,'chrome');
export const ipc = path.join(directory,'ipc');
export const read = file => JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
export const alive = pid => {try { if(!Number.isInteger(pid)||pid<1)return false;process.kill(pid,0);return true;}catch{return false;}};
export function atomic(file,value) { const tmp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value));fs.renameSync(tmp,file); }
export function taskIdentity(id,pid,generation) {
  if(!/^[a-f0-9]{32}$/.test(id))throw Error('Invalid bridge task.');
  const job=read(path.join(root,'tasks',id,'task.json'));
  if(!['running','waiting_for_user'].includes(job.status)||job.workerPid!==pid||!alive(pid)||(job.relayGeneration||0)!==generation||fs.existsSync(path.join(root,'tasks',id,'cancel.json')))throw Error('Task lease ended, changed generation, or was canceled.');
  const relay=read(path.join(root,'data','relay-state.json'));
  if(!Number.isFinite(relay.lastSuccess)||Date.now()-relay.lastSuccess>45000||!(relay.active||[]).some(claim=>claim.localId===id&&claim.generation===generation))throw Error('No current hosted task claim for this worker/generation.');
  const config=read(path.join(root,'config.json')),project=config.projects?.[job.project];
  if(!project||fs.realpathSync.native(project.path).toLowerCase()!==fs.realpathSync.native(job.cwd).toLowerCase())throw Error('Task project is not in this owner bridge allowlist.');
  return {id,pid,generation,project:job.project,mode:job.mode,title:String(job.title||job.project).slice(0,100)};
}
export function validRequest(request) {
  if(!request||!/^[-a-f0-9]{36}$/.test(request.id)||request.deadline<Date.now()||request.deadline>Date.now()+65000)throw Error('Expired or invalid command.');
  const identity=taskIdentity(request.taskId,request.workerPid,request.generation);
  if(!['state','screenshot','release'].includes(request.action)&&identity.mode!=='edit')throw Error('Input/navigation requires an owner-authorized edit task.');
  return identity;
}
export function statusFor(identity) {
  let connection,session;
  try{connection=read(path.join(ipc,'connection.json'));}catch{}
  const connected=!!connection&&alive(connection.pid)&&Date.now()-connection.at<10000;
  try{session=read(path.join(ipc,'session.json'));}catch{}
  const active=connected&&session?.taskId===identity.id&&session?.workerPid===identity.pid&&session?.generation===identity.generation&&session.expiresAt>Date.now();
  const lastSeenAt=Number.isFinite(connection?.at)?new Date(connection.at).toISOString():null;
  return {provider,officialChatGptDesktop:false,state:active?'active':connected?'requires_handoff':'unavailable',authorized:active,
    reason:active?'chrome-debugger-attached-by-owner':connected?'owner-tab-and-task-approval-required':'native-connection-idle-or-unavailable',
    connection:{connected,lastSeenAt,idleDisconnectExpected:true,diagnosis:connected?'Native host is responding.':'The extension connects when its toolbar popup opens and deliberately disconnects while idle. A missing heartbeat alone does not prove an installation fault; status checks cannot reconnect it.'},
    authorizationProofKind:active?'chrome-action-user-gesture-and-debugger-attachment':'none',
    route:'task-scoped MCP pti_chrome through current-user Native Messaging',
    session:active?{runId:session.runId,tabId:session.tabId,origin:session.origin,expiresAt:session.expiresAt}:null,
    limits:{origins:['http://localhost:4173','https://taleweald.firebaseapp.com'],foregroundOnly:true,audioCapture:'unsupported',audioAnalysis:'unsupported',speakerPlayback:'unverified',arbitraryJavascript:false,cookies:false},
    observedAt:new Date().toISOString(),nextStep:active?'Use the approved foreground tab; release it when finished.':connected?'Select this exact task in PTI Owner Chrome and approve the requested tab/site. Keep the tab foreground.':'Open the requested page through the available authorized browser controller, then open the installed PTI Owner Chrome toolbar popup. Diagnose any error shown there before suggesting reinstallation. Report the missing connection once and continue independent work; repeat status only after a relevant setup or connection change.'};
}
export function saveArtifact(identity,requestId,kind,bytes,metadata) {
  const target=path.join(directory,'evidence',identity.id);fs.mkdirSync(target,{recursive:true});
  const file=path.join(target,requestId+(kind==='screenshot'?'.jpg':'.json'));fs.writeFileSync(file,bytes,{flag:'wx'});
  const receipt={provider,taskId:identity.id,generation:identity.generation,kind,file,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,capturedAt:new Date().toISOString(),source:'owner-approved-local-chrome',...metadata};
  fs.writeFileSync(path.join(target,requestId+'.receipt.json'),JSON.stringify(receipt,null,2),{flag:'wx'});return receipt;
}
