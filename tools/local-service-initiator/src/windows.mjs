import {spawn} from 'node:child_process';
import {readFile,writeFile,rename,access} from 'node:fs/promises';
import path from 'node:path';
import {endpointPort,runnerContract,samePath,startupFailure,validateRunner} from './gtop-runner.mjs';

const powershell = path.win32.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
export const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function readJson(file) { try { return JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,'')); } catch(error) { if(error.code==='ENOENT')return null; throw error; } }
export async function atomicJson(file,value) { await writeFile(file+'.tmp',JSON.stringify(value,null,2),'utf8'); await rename(file+'.tmp',file); }
export function runPowerShell(script,input,timeoutMs=20000) {
  return new Promise((resolve,reject)=>{
    const child=spawn(powershell,['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe'],env:{...process.env,PSModulePath:path.win32.join(path.win32.dirname(powershell),'Modules')}});
    let output='';let settled=false;
    const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);if(error){child.kill();reject(error);}else resolve(output);};
    const timer=setTimeout(()=>finish(Error('worker_start_timeout')),timeoutMs);
    child.stdout.on('data',chunk=>{output+=chunk.toString('utf8');if(output.length>65536)finish(Error('start_failed'));});
    child.stderr.on('data',()=>{});
    child.on('error',()=>finish(Error('start_failed')));child.stdin.on('error',()=>finish(Error('start_failed')));
    child.on('close',code=>finish(code===0?null:Error('start_failed')));
    child.stdin.end(JSON.stringify(input));
  });
}
export async function unprotect(secretProtected) {
  const script=String.raw`$ErrorActionPreference='Stop'; $r=[Console]::In.ReadToEnd() | ConvertFrom-Json; $s=ConvertTo-SecureString ([string]$r.secret); $b=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try {[Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($b))} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)}`;
  return runPowerShell(script,{secret:secretProtected});
}
export class WorkerHost {
  constructor(settings,settingsFile,{read=readJson,write=atomicJson,run=runPowerShell,wait=pause,now=()=>performance.now(),fetchImpl=fetch,checkAccess=access,resolveCodex}={}) {
    Object.assign(this,{settings,settingsFile,read,write,run,wait,now,fetchImpl,checkAccess,resolveCodex});
  }
  async startOnePieceTask() {
    if(this.settings.onePieceEnabled!==true)throw Error('configuration_invalid');
    const script=String.raw`$ErrorActionPreference='Stop'; $r=[Console]::In.ReadToEnd()|ConvertFrom-Json; $task=Get-ScheduledTask -TaskName 'PTI-OnePiece-Companion' -TaskPath '\'; $actions=@($task.Actions); $expected='"F:\Workspace\Support\PTI\local-service-initiator\settings.json" one-piece'; if($actions.Count -ne 1 -or [IO.Path]::GetFullPath($actions[0].Execute) -ine [IO.Path]::GetFullPath([string]$r.helper) -or $actions[0].Arguments -cne $expected -or [string]$task.Settings.MultipleInstances -ne 'IgnoreNew'){throw 'configuration'}; if(!$task.Settings.Enabled){Enable-ScheduledTask -TaskName 'PTI-OnePiece-Companion' -TaskPath '\'|Out-Null}; Start-ScheduledTask -TaskName 'PTI-OnePiece-Companion' -TaskPath '\'; [Console]::Out.Write('requested')`;
    try{if((await runPowerShell(script,{helper:this.settings.helperExecutable})).trim()!=='requested')throw Error();}
    catch{throw Error('configuration_invalid');}
  }
  async startHelper(mode,timeoutMs=30000) {
    if(!['ollama','worker','one-piece'].includes(mode) || mode==='one-piece' && this.settings.onePieceEnabled!==true)throw Error('configuration_invalid');
    await access(this.settings.helperExecutable);
    // A GUI-subsystem host creates each console child with CreateNoWindow=true.
    // Node's detached process with inherited file descriptors does not guarantee this.
    const helper=spawn(this.settings.helperExecutable,[this.settingsFile,mode],{windowsHide:true,detached:true,shell:false,stdio:'ignore'});
    await new Promise((resolve,reject)=>{helper.once('spawn',resolve);helper.once('error',()=>reject(Error('start_failed')));});helper.unref();
    const recordFile=path.join(this.settings.stateDirectory,mode+'-host.json');
    // First execution may wait for Windows loader/antivirus checks on the local binary.
    const deadline=this.now()+timeoutMs;
    while(this.now()<deadline){
      const record=await readJson(recordFile);
      if(record?.helperPid===helper.pid && record.phase==='running')return;
      if(helper.exitCode!==null)throw Error('start_failed');
      await this.wait(Math.min(100,Math.max(0,deadline-this.now())));
    }
    throw Error('worker_start_timeout');
  }
  async snapshot(timeoutMs=20000) {
    // Never export unrelated command contents or trust a PID without its creation time.
    // Query listeners by the configured dedicated port; an empty result is not an error.
    const script=String.raw`$ErrorActionPreference='Stop'
$r=[Console]::In.ReadToEnd()|ConvertFrom-Json
function HasArg($cmd,$arg){$cmd -and [regex]::IsMatch($cmd.Replace('\','/'),('(?:^|\s)"?'+[regex]::Escape($arg.Replace('\','/'))+'"?(?=\s|$)'),[Text.RegularExpressions.RegexOptions]::IgnoreCase)}
$listeners=@(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object {$_.LocalPort -eq [int]$r.port} | ForEach-Object {@{pid=[int]$_.OwningProcess;address=[string]$_.LocalAddress}})
$ps=@(Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='ollama.exe' OR Name='PTI.LocalServiceHost.exe'")
$workers=@($ps|Where-Object {$_.Name -eq 'node.exe' -and (HasArg $_.CommandLine $r.main) -and (HasArg $_.CommandLine $r.config)}|ForEach-Object {[int]$_.ProcessId})
$hosts=@($ps|Where-Object {$_.Name -eq 'PTI.LocalServiceHost.exe' -and (HasArg $_.CommandLine $r.settings)}|ForEach-Object {@{pid=[int]$_.ProcessId;mode=$(if(HasArg $_.CommandLine 'ollama'){'ollama'}elseif(HasArg $_.CommandLine 'worker'){'worker'}else{'other'})}})
$relevant=@($workers)+@($hosts|ForEach-Object {$_.pid})+@($listeners|ForEach-Object {$_.pid})+@($r.pids)
$processes=@($ps|Where-Object {$relevant -contains [int]$_.ProcessId}|ForEach-Object {@{pid=[int]$_.ProcessId;executable=[string]$_.ExecutablePath;startedAt=$_.CreationDate.ToUniversalTime().ToString('o')}})
[Console]::Out.Write((@{listeners=$listeners;workers=$workers;hosts=$hosts;processes=$processes}|ConvertTo-Json -Compress -Depth 5))`;
    try {
      const records=await Promise.all(['ollama','worker'].map(mode=>this.read(this.hostFile(mode))));
      const pids=records.flatMap(r=>[r?.childPid,r?.helperPid]).filter(pid=>Number.isSafeInteger(pid)&&pid>0);
      const result=JSON.parse(await this.run(script,{port:endpointPort(this.settings.ollamaEndpoint),main:path.win32.join(this.settings.controllerRoot,'src','main.ts'),config:this.settings.workerConfig,settings:this.settingsFile,pids},timeoutMs));
      if(!['listeners','workers','hosts','processes'].every(key=>Array.isArray(result[key])))throw Error();
      return result;
    } catch { throw startupFailure('configuration_invalid','configuration'); }
  }
  hostFile(mode) { return path.join(this.settings.stateDirectory,mode+'-host.json'); }
  owns(record,mode,snapshot) {
    const s=this.settings,child=snapshot.processes.find(p=>p.pid===record?.childPid),helper=snapshot.processes.find(p=>p.pid===record?.helperPid);
    const stamp=(actual,expected)=>Number.isFinite(Date.parse(actual)) && Math.abs(Date.parse(actual)-Date.parse(expected))<100;
    return record?.phase==='running' && record.mode===mode && child && helper &&
      samePath(helper.executable,s.helperExecutable) && samePath(record.helperExecutable,s.helperExecutable) &&
      samePath(child.executable,mode==='ollama'?s.ollamaExecutable:s.workerNodeExecutable) &&
      stamp(child.startedAt,record.childStartedAt) && stamp(helper.startedAt,record.helperStartedAt) &&
      record.ollamaEndpoint===s.ollamaEndpoint && samePath(record.modelDirectory,s.modelDirectory);
  }
  async workerRunning() {
    const [snapshot,record,contract]=await Promise.all([this.snapshot(),this.read(this.hostFile('worker')),this.read(path.join(this.settings.stateDirectory,'gtop-runner.json'))]);
    return !!(snapshot.workers.length===1 && snapshot.workers[0]===record?.childPid && this.owns(record,'worker',snapshot) && contract?.id && record.runnerContractId===contract.id);
  }
  async modelAvailable(model,timeoutMs) {
    const response=await this.fetchImpl(this.settings.ollamaEndpoint+'/api/tags',{redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
    if(!response.ok){await response.body?.cancel();return false;}
    const value=await response.json();
    if(!Array.isArray(value.models))return false;
    if(!value.models.some(m=>m.name===model))throw startupFailure('model_unavailable','model_missing');
    return true;
  }
  // Coalesce concurrent callers as well as the durable mailbox/native role mutexes.
  start() {
    if(!this.starting)this.starting=this.startOnce().finally(()=>{this.starting=undefined;});
    return this.starting;
  }
  async startOnce() {
    const s=this.settings,deadline=this.now()+75000;
    const remaining=()=>Math.max(0,deadline-this.now());
    const budget=(max=20000)=>{if(!remaining())throw startupFailure('worker_start_timeout','launch_timeout');return Math.min(max,remaining());};
    const inspect=()=>this.snapshot(budget());
    const diagnostic=path.join(s.stateDirectory,'gtop-startup.json');
    try {
      const worker=await this.read(s.workerConfig);
      let contract;
      // Separate safe local instructions from the fixed error codes sent to the gateway.
      try { validateRunner(s,worker); }
      catch { throw startupFailure('configuration_invalid','configuration'); }
      try { contract=await runnerContract(s,worker,{resolveCodex:this.resolveCodex,checkAccess:this.checkAccess}); }
      catch { throw startupFailure('configuration_invalid','codex'); }
      let snapshot=await inspect(),record=await this.read(this.hostFile('worker'));
      if(snapshot.workers.length || snapshot.hosts.some(h=>h.mode==='worker')) {
        if(snapshot.workers.length!==1 || snapshot.workers[0]!==record?.childPid || !this.owns(record,'worker',snapshot) || record.runnerContractId!==contract.id)throw startupFailure('configuration_invalid','worker_conflict');
      }
      const dispatcherDeadline=Math.min(deadline,this.now()+45000);
      let launched=false;
      for(;;) {
        const ollama=await this.read(this.hostFile('ollama'));
        const owned=this.owns(ollama,'ollama',snapshot);
        if(snapshot.listeners.length) {
          if(!owned || snapshot.listeners.some(l=>l.address!=='127.0.0.1' || l.pid!==ollama.childPid))throw startupFailure('port_in_use','listener_conflict');
          try { if(await this.modelAvailable(contract.model,budget(2000)))break; }
          catch(error){if(error.reason==='model_missing')throw error; /* Owned dispatcher may still be booting. */}
        } else if(snapshot.hosts.some(h=>h.mode==='ollama')) {
          if(!owned)throw startupFailure('port_in_use','listener_conflict');
        } else if(!launched) {
          await this.checkAccess(s.ollamaExecutable);await this.checkAccess(s.modelDirectory);
          await this.startHelper('ollama',budget(30000));launched=true;
        }
        if(this.now()>=dispatcherDeadline)throw startupFailure('model_unavailable','dispatcher_timeout');
        await this.wait(Math.min(500,dispatcherDeadline-this.now()));snapshot=await inspect();
      }
      // The worker receives one immutable contract, never a rewritten protected pairing.
      await this.write(path.join(s.stateDirectory,'gtop-runner.json'),contract);
      snapshot=await inspect();record=await this.read(this.hostFile('worker'));
      if(snapshot.workers.length || snapshot.hosts.some(h=>h.mode==='worker')) {
        if(snapshot.workers.length!==1 || snapshot.workers[0]!==record?.childPid || !this.owns(record,'worker',snapshot) || record.runnerContractId!==contract.id)throw startupFailure('configuration_invalid','worker_conflict');
      } else await this.startHelper('worker',budget(30000));
      for(;;) {
        snapshot=await inspect();record=await this.read(this.hostFile('worker'));
        if(snapshot.workers.length===1 && snapshot.workers[0]===record?.childPid && this.owns(record,'worker',snapshot) && record.runnerContractId===contract.id)break;
        budget();await this.wait(Math.min(100,remaining()));
      }
      budget();
      await this.write(diagnostic,{checkedAt:new Date().toISOString(),phase:'launch_verified',endpoint:s.ollamaEndpoint,runnerContractId:contract.id});
    } catch(error) {
      await this.write(diagnostic,{checkedAt:new Date().toISOString(),phase:'failed',errorCode:['port_in_use','model_unavailable','configuration_invalid','worker_start_timeout'].includes(error.message)?error.message:'start_failed',reason:error.reason||'launch_timeout',action:error.action||'Inspect private native host logs; no existing process was stopped.',endpoint:s.ollamaEndpoint});
      throw error;
    }
  }
}
