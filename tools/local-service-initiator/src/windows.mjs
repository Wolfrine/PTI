import {spawn} from 'node:child_process';
import {readFile,writeFile,rename,mkdir,open,access} from 'node:fs/promises';
import path from 'node:path';

const powershell = path.win32.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
export const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function readJson(file) { try { return JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,'')); } catch(error) { if(error.code==='ENOENT')return null; throw error; } }
export async function atomicJson(file,value) { await writeFile(file+'.tmp',JSON.stringify(value,null,2),'utf8'); await rename(file+'.tmp',file); }
function runPowerShell(script,input,timeoutMs=20000) {
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
  constructor(settings) { this.settings=settings; }
  async workerRunning(exact=false) {
    const config=await readJson(this.settings.workerConfig);
    if(!config?.dataDirectory)return false;
    const record=await readJson(path.join(config.dataDirectory,'process.json'));
    if(!Number.isInteger(record?.pid) || record.pid<1)return false;
    try { process.kill(record.pid,0); } catch { return false; }
    if(!exact)return true;
    const script=String.raw`$ErrorActionPreference='Stop'; $r=[Console]::In.ReadToEnd() | ConvertFrom-Json; $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$r.pid); $ok=$p -and $p.Name -eq 'node.exe' -and $p.CommandLine.Replace('\','/').Contains(([string]$r.config).Replace('\','/')) -and $p.CommandLine.Replace('\','/').Contains(([string]$r.main).Replace('\','/')); [Console]::Out.Write([bool]$ok)`;
    return (await runPowerShell(script,{pid:record.pid,config:this.settings.workerConfig,main:path.join(this.settings.controllerRoot,'src','main.ts')})).trim()==='True';
  }
  async modelAvailable() {
    const response=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(2000)});
    if(!response.ok)throw Error('port_in_use');
    const value=await response.json();
    const config=await readJson(this.settings.workerConfig);
    if(!value.models?.some(m=>m.name===config.model))throw Error('model_unavailable');
  }
  async assertLoopbackListener() {
    const script=String.raw`$ErrorActionPreference='Stop'; $listeners=@(Get-NetTCPConnection -State Listen -LocalPort 11434 -ErrorAction Stop); if(!$listeners.Count -or @($listeners | Where-Object {$_.LocalAddress -notin @('127.0.0.1','::1')}).Count){exit 1}; [Console]::Out.Write('loopback')`;
    try { await runPowerShell(script,{}); } catch { throw Error('port_in_use'); }
  }
  async start() {
    const s=this.settings;
    // Existing dispatcher is accepted only when it serves the configured model.
    try { await this.modelAvailable(); }
    catch(error) {
      if(['model_unavailable','port_in_use'].includes(error.message))throw error;
      await access(s.ollamaExecutable);await access(s.modelDirectory);
      await mkdir(s.stateDirectory,{recursive:true});
      const out=await open(path.join(s.stateDirectory,'ollama.stdout.log'),'a');
      const err=await open(path.join(s.stateDirectory,'ollama.stderr.log'),'a');
      try {
        const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|PROGRAMDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|SYSTEMDRIVE|HOMEDRIVE|HOMEPATH)$/i.test(name)));
        Object.assign(env,{OLLAMA_MODELS:s.modelDirectory,OLLAMA_HOST:'127.0.0.1:11434',OLLAMA_NUM_PARALLEL:'1',OLLAMA_MAX_LOADED_MODELS:'1',OLLAMA_NO_CLOUD:'1'});
        const child=spawn(s.ollamaExecutable,['serve'],{windowsHide:true,detached:true,shell:false,stdio:['ignore',out.fd,err.fd],env});
        await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',()=>reject(Error('start_failed')));});child.unref();
      } finally {await out.close();await err.close();}
      let available=false;
      for(let attempt=0;attempt<15;attempt++){await pause(500);try{await this.modelAvailable();available=true;break;}catch(error){if(['model_unavailable','port_in_use'].includes(error.message))throw error;}}
      if(!available)throw Error('model_unavailable');
    }
    await this.assertLoopbackListener();
    if(await this.workerRunning(true))return;
    const script=String.raw`$ErrorActionPreference='Stop'; $r=[Console]::In.ReadToEnd() | ConvertFrom-Json; & (Join-Path ([string]$r.root) 'start-worker.ps1') -Config ([string]$r.config); if(!$?){exit 1}`;
    await runPowerShell(script,{root:s.controllerRoot,config:s.workerConfig},25000);
    if(!await this.workerRunning(true))throw Error('worker_start_timeout');
  }
}
