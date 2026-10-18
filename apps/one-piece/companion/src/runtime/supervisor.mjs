import {spawn} from 'node:child_process';
import {readFile,open,unlink,access,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import https from 'node:https';
import {loadRuntimeConfig,loadRuntimeSecret,saveRuntimeSecret} from './config.mjs';
import {ensureJellyfinAccount} from './setup.mjs';
import {dedicatedEngineDescriptor} from '../media/runtime.mjs';
import {stopVerifiedEngineChildren} from './engine-processes.mjs';
import {atomicJson} from '../progress.mjs';
export {stopOwnedEngineChildren} from './engine-processes.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const restartDelay=failures=>Math.min(30000,1000*2**Math.min(5,Math.max(0,failures-1)));
export async function portFree(host,port){return new Promise(resolve=>{const server=net.createServer();server.once('error',()=>resolve(false));server.listen(port,host,()=>server.close(()=>resolve(true)));});}
export function strictTlsHealth(config,ca){return new Promise(resolve=>{
  const request=https.get(config.controlsOrigin+'/runtime-health',{ca,servername:'onepiece.local',lookup:(_name,options,callback)=>options?.all?callback(null,[{address:config.mdns.address,family:4}]):callback(null,config.mdns.address,4),timeout:2000},response=>{response.resume();resolve(response.statusCode===200);});
  request.once('timeout',()=>request.destroy());request.once('error',()=>resolve(false));
});}
export class RuntimeSupervisor{
  constructor(config,{spawnImpl=spawn,clock=()=>Date.now(),persistSetup=(configuration,challenge)=>saveRuntimeSecret(configuration,'setupChallenge',JSON.stringify(challenge)),bootstrapImpl=ensureJellyfinAccount,tlsHealthImpl=strictTlsHealth}={}){
    Object.assign(this,{config,spawnImpl,clock,persistSetup,bootstrapImpl,tlsHealthImpl});this.children=new Map();this.failures=new Map();this.restarts=new Map();this.badHealth=new Map();this.stopping=new Set();this.ready=new Set();this.saveQueue=Promise.resolve();this.shuttingDown=false;
    this.state={version:1,supervisorPid:process.pid,startedAt:new Date().toISOString(),processes:{},health:{},startupMode:'current-user-logon',preLoginVerified:false,rebootVerified:false};
  }
  async save(){const snapshot=structuredClone(this.state);this.saveQueue=this.saveQueue.catch(()=>{}).then(()=>atomicJson(this.config.statePath,snapshot));return this.saveQueue;}
  async lock(){
    this.lockPath=path.join(this.config.privateRoot,'supervisor.lock');this.stopPath=path.join(this.config.privateRoot,'stop.request');
    for(let attempt=0;attempt<2;attempt++){
      try{const handle=await open(this.lockPath,'wx',0o600);await handle.writeFile(JSON.stringify({pid:process.pid}));await handle.close();this.lockOwned=true;await unlink(this.stopPath).catch(error=>{if(error.code!=='ENOENT')throw error;});return;}
      catch(error){if(error.code!=='EEXIST')throw error;const previous=JSON.parse(await readFile(this.lockPath,'utf8'));try{process.kill(previous.pid,0);throw new Error('runtime-already-running');}catch(probe){if(probe.code!=='ESRCH')throw probe;}await unlink(this.lockPath);}
    }
    throw new Error('runtime-lock');
  }
  descriptor(name){
    const c=this.config;
    if(name==='jellyfin'){const engine=dedicatedEngineDescriptor({runtimeRoot:c.jellyfin.runtimeRoot,binaryDir:c.jellyfin.binaryDir,port:18097});return {executable:engine.executable,args:engine.args,cwd:engine.workingDirectory};}
    if(name==='backend')return {executable:c.nodeExecutable,args:[c.serverEntry,'--config',c.configPath],cwd:c.repositoryRoot};
    if(name==='caddy')return {executable:c.caddy.executable,args:['run','--config',c.caddy.configurationPath,'--adapter','caddyfile'],cwd:c.privateRoot};
    if(name==='mdns')return {executable:c.pythonExecutable,args:[path.join(HERE,'mdns.py'),'--config',c.configPath],cwd:c.privateRoot};
    throw new Error('runtime-process-kind');
  }
  async startChild(name){
    if(this.shuttingDown||this.children.has(name))return;
    const descriptor=this.descriptor(name);await access(descriptor.executable);if(name==='backend')await access(this.config.serverEntry);
    if(this.shuttingDown||this.children.has(name))return;
    const child=this.spawnImpl(descriptor.executable,descriptor.args,{cwd:descriptor.cwd,windowsHide:true,stdio:name==='backend'?['pipe','pipe','pipe','ipc']:['pipe','pipe','pipe'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
    this.children.set(name,child);this.state.processes[name]={pid:child.pid??null,executable:descriptor.executable,startedAt:new Date().toISOString(),state:'starting'};
    const failed=()=>{
      if(this.children.get(name)!==child)return;
      this.children.delete(name);this.ready.delete(name);this.state.processes[name]={...this.state.processes[name],state:'stopped',stoppedAt:new Date().toISOString()};this.save().catch(()=>{});
      if(!this.shuttingDown&&!this.stopping.has(name))this.scheduleRestart(name);
    };
    child.once('error',failed);child.once('exit',failed);
    // Child output is drained but never logged: libraries can include capabilities in errors.
    child.stdout?.on('data',chunk=>{
      if(name==='mdns'&&String(chunk).includes('"event": "ready"')){this.ready.add(name);this.state.processes[name].state='ready';this.save().catch(()=>{});}
    });child.stderr?.on('data',()=>{});
    if(name==='backend')child.on('message',message=>{
      if(this.children.get(name)!==child)return;
      if(message?.type==='one-piece-backend-ready'){this.ready.add(name);this.state.processes[name].state='ready';this.save().catch(()=>{});}
      else if(message?.type==='one-piece-local-setup'&&typeof message.code==='string'&&message.code.length<=128&&Number.isFinite(message.expiresAt)&&message.expiresAt>this.clock()&&message.expiresAt<=this.clock()+310000){
        // Secret arrives only through inherited IPC; CurrentUser DPAPI, not an HTTP/log/CLI surface.
        this.persistSetup(this.config,{code:message.code,expiresAt:message.expiresAt,backendPid:child.pid}).catch(()=>{this.state.setupChallenge='protection-failed';this.save().catch(()=>{});});
      }
    });
    await this.save();
  }
  scheduleRestart(name){
    const key=['backend','jellyfin'].includes(name)?'core':name;
    if(this.restarts.has(key)||this.shuttingDown)return;
    const failures=(this.failures.get(key)??0)+1;this.failures.set(key,failures);
    const timer=setTimeout(async()=>{this.restarts.delete(key);try{if(key==='core')await this.recoverCore();else{await this.stopChild(name);await this.startChild(name);}}catch{this.scheduleRestart(name);}},restartDelay(failures));this.restarts.set(key,timer);
  }
  async recoverCore(){
    if(this.recovering)return this.recovering;
    this.recovering=(async()=>{await this.stopChild('backend');await this.stopChild('jellyfin');await this.startChild('jellyfin');await this.waitForEngine();await this.bootstrap();await this.startChild('backend');})();
    try{await this.recovering;}finally{this.recovering=null;}
  }
  async bootstrap(){for(let attempt=0;attempt<3;attempt++)try{return await this.bootstrapImpl(this.config);}catch(error){if(attempt===2)throw error;await wait(1000);}}
  async waitForEngine(){let stable=0;for(let attempt=0;attempt<60;attempt++){if(this.shuttingDown)throw new Error('runtime-stopping');try{const response=await fetch(this.config.jellyfin.origin+'/System/Info/Public',{signal:AbortSignal.timeout(1500)});const info=response.ok?await response.json():null;stable=info&&typeof info.StartupWizardCompleted==='boolean'&&typeof info.Version==='string'&&typeof info.Id==='string'?stable+1:0;if(stable>=2){this.ready.add('jellyfin');this.state.processes.jellyfin.state='ready';return;}}catch{stable=0;}await wait(500);}throw new Error('runtime-engine-start-timeout');}
  async stopChild(name){
    const child=this.children.get(name);if(!child)return;
    this.stopping.add(name);
    try{
      if(name==='jellyfin')await stopVerifiedEngineChildren(this.config,{enginePid:child.pid,supervisorPid:process.pid});
      if(child.exitCode===null&&child.signalCode===null){
        if(name==='backend'&&child.connected)child.send({type:'one-piece-shutdown'});
        else if(name==='mdns')child.stdin?.end('stop\n');
        else child.kill();
        for(let i=0;i<30&&child.exitCode===null&&child.signalCode===null;i++)await wait(100);
        if(child.exitCode===null&&child.signalCode===null)child.kill();
        for(let i=0;i<20&&child.exitCode===null&&child.signalCode===null;i++)await wait(100);
        if(child.exitCode===null&&child.signalCode===null)throw new Error('runtime-child-stop-unconfirmed');
      }
      this.children.delete(name);this.ready.delete(name);this.state.processes[name]={...this.state.processes[name],state:'stopped'};await this.save();
    }finally{this.stopping.delete(name);}
  }
  async health(){
    if(this.shuttingDown||this.checking)return;this.checking=true;
    try{
      const checks={};
      for(const [name,url]of [['jellyfin',this.config.jellyfin.origin+'/System/Info/Public'],['backend','http://127.0.0.1:18098/api/health']]){
        try{const response=await fetch(url,{headers:name==='backend'?{'Origin':'https://pti-app-2ab59.web.app','X-OnePiece-Proxy':this.proxySecret,'X-Forwarded-Proto':'https'}:{},signal:AbortSignal.timeout(2000)});checks[name]=response.ok;await response.body?.cancel();}catch{checks[name]=false;}
      }
      checks.mdns=this.children.has('mdns')&&this.ready.has('mdns');checks.caddy=await this.tlsHealthImpl(this.config,this.ca);
      for(const [name,healthy]of Object.entries(checks))if(healthy&&this.state.processes[name])this.state.processes[name].state='ready';
      this.state.health={...checks,checkedAt:new Date().toISOString()};await this.save();
      for(const [name,healthy]of Object.entries(checks)){
        const failures=healthy?0:(this.badHealth.get(name)??0)+1;this.badHealth.set(name,failures);
        if(healthy)this.failures.set(['jellyfin','backend'].includes(name)?'core':name,0);
        if(failures===3)this.scheduleRestart(name);
      }
    }finally{this.checking=false;}
  }
  async start(){
    await this.lock();this.proxySecret=await loadRuntimeSecret(this.config,'proxySecret');this.ca=await readFile(this.config.caddy.rootCertificatePath);
    for(const [host,port]of [['127.0.0.1',18097],['127.0.0.1',18098],[this.config.httpMediaHost,18099],[this.config.httpMediaHost,8443]])if(!await portFree(host,port))throw new Error('runtime-port-in-use');
    await this.startChild('jellyfin');await this.waitForEngine();this.state.engineBootstrap=await this.bootstrap();await this.save();
    await this.startChild('mdns');await this.startChild('caddy');await this.startChild('backend');
    this.healthTimer=setInterval(()=>this.health().catch(()=>{}),10000);this.stopTimer=setInterval(()=>this.pollLocalRequests().catch(()=>{}),1000);
    await this.health();
  }
  async pollLocalRequests(){
    if(this.shuttingDown||this.pollingCommands)return;this.pollingCommands=true;
    try{
      try{await access(this.stopPath);if(!this.shuttingDown){await this.stop();if(this.exitOnStop)process.exit(0);}return;}catch(error){if(error.code!=='ENOENT')throw error;}
      const requestPath=path.join(this.config.privateRoot,'setup.request');let stat;
      try{stat=await lstat(requestPath);}catch(error){if(error.code==='ENOENT')return;throw error;}
      if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64)throw new Error('runtime-local-request');
      const child=this.children.get('backend');if(!child?.connected||!this.ready.has('backend'))return;
      await unlink(requestPath);child.send({type:'one-piece-local-setup-request'});
    }finally{this.pollingCommands=false;}
  }
  async stop(){
    if(this.shuttingDown)return;this.shuttingDown=true;clearInterval(this.healthTimer);clearInterval(this.stopTimer);for(const timer of this.restarts.values())clearTimeout(timer);this.restarts.clear();
    const failures=[];for(const name of ['backend','caddy','mdns','jellyfin'])try{await this.stopChild(name);}catch{failures.push(name);}
    this.state.stoppedAt=new Date().toISOString();if(failures.length)this.state.stopFailures=failures;await this.save();
    if(failures.length)throw new Error('runtime-stop-unconfirmed');
    if(this.lockOwned){await unlink(this.lockPath);this.lockOwned=false;}
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let supervisor;
  try{const index=process.argv.indexOf('--config');if(index<0)throw new Error();const config=await loadRuntimeConfig(process.argv[index+1]);supervisor=new RuntimeSupervisor(config);supervisor.exitOnStop=true;process.on('SIGINT',()=>supervisor.stop().finally(()=>process.exit()));process.on('SIGTERM',()=>supervisor.stop().finally(()=>process.exit()));await supervisor.start();}
  catch(error){if(supervisor){supervisor.state.startError={code:['runtime-engine-request','runtime-engine-response','runtime-engine-auth','runtime-port-in-use'].includes(error.message)?error.message:'runtime-start-failed',...(Number.isInteger(error.status)?{status:error.status}:{}),...(typeof error.operation==='string'?{operation:error.operation}:{})};await supervisor.save().catch(()=>{});}try{await supervisor?.stop();}catch{}console.error('one-piece-runtime-start-failed');process.exitCode=1;}
}
