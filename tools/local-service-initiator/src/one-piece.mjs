import {readJson,runPowerShell,pause} from './windows.mjs';

export const ONE_PIECE_GATEWAY='https://us-central1-pti-app-2ab59.cloudfunctions.net/onePieceHost';
const CONFIG='H:/PTI-OnePiece/runtime/private/config.json';
const STATE='H:/PTI-OnePiece/runtime/private/supervisor-state.json';
const HEALTH='https://pti-onepiece-home.duckdns.org:8443/api/health';

export function onePiecePollBody(body){
  const result={version:body.version,companionReady:body.workerRunning};
  if(body.lastStartResult){
    const value=body.lastStartResult;
    result.lastStartResult={requestId:value.requestId,state:value.state};
    if(value.state==='failed')result.lastStartResult.errorCode=['worker_start_timeout','companion_start_timeout'].includes(value.errorCode)
      ?'companion_start_timeout':value.errorCode==='configuration_invalid'?'configuration_invalid':'start_failed';
  }
  return result;
}

// Existing H: installation is an operational dependency, never copied or upgraded
// by this F: starter. Remote requests cannot supply any of these paths or commands.
export class OnePieceHost {
  constructor(host,{read=readJson,fetchImpl=fetch,run=runPowerShell,wait=pause,now=()=>Date.now(),alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}}}={}) {
    Object.assign(this,{host,read,fetchImpl,run,wait,now,alive});
  }
  async ready({timeoutMs=2000}={}) {
    try {
      const state=await this.read(STATE),health=state?.health;
      if(!Number.isSafeInteger(state?.supervisorPid)||!this.alive(state.supervisorPid)||!health
        ||!['jellyfin','backend','mdns','caddy'].every(name=>health[name]===true)
        ||!Number.isFinite(Date.parse(health.checkedAt))||Math.abs(this.now()-Date.parse(health.checkedAt))>45000)return false;
      const response=await this.fetchImpl(HEALTH,{headers:{Origin:'https://pti-app-2ab59-one-piece.web.app'},redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.floor(timeoutMs)))});
      if(!response.ok){await response.body?.cancel();return false;}
      const reader=response.body?.getReader();if(!reader)return false;
      let bytes=0;const parts=[];
      try{while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.length;if(bytes>4096)return false;parts.push(next.value);}}
      finally{await reader.cancel().catch(()=>{});}
      return JSON.parse(Buffer.concat(parts).toString('utf8')).status==='online';
    }catch{return false;}
  }
  async running() {
    const state=await this.read(STATE),pid=Number.isSafeInteger(state?.supervisorPid)&&state.supervisorPid>0?state.supervisorPid:0;
    // Explicit-start inspection also catches a launcher that has not yet written
    // its supervisor state, preventing a duplicate during ordinary logon startup.
    const script=String.raw`$ErrorActionPreference='Stop'; $r=[Console]::In.ReadToEnd()|ConvertFrom-Json; $c=Get-Content -LiteralPath 'H:\PTI-OnePiece\runtime\private\config.json' -Raw|ConvertFrom-Json; $expected=([IO.Path]::Combine([string]$c.repositoryRoot,'apps\one-piece\companion\src\runtime\supervisor.mjs')).Replace('/','\'); $ps=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'"); $p=$ps|Where-Object {$_.ProcessId -eq [int]$r.pid}; $ok=$p -and $p.ExecutablePath -ieq 'H:\PTI-OnePiece\tools\node\node.exe' -and $p.CommandLine.Replace('/','\').Contains($expected) -and $p.CommandLine.Replace('/','\').Contains('H:\PTI-OnePiece\runtime\private\config.json'); if($p -and !$ok){throw 'identity'}; $launchers=@($ps|Where-Object {$_.ExecutablePath -ieq 'H:\PTI-OnePiece\tools\node\node.exe' -and $_.CommandLine.Replace('/','\').Contains('H:\PTI-OnePiece\runtime\launch-current.mjs')}); if($launchers.Count -gt 1){throw 'identity'}; [Console]::Out.Write([bool]($ok -or $launchers.Count -eq 1))`;
    const result=(await this.run(script,{pid})).trim();
    if(!['True','False'].includes(result))throw Error('configuration_invalid');
    return result==='True';
  }
  async start() {
    // Count elapsed time, including TLS probes, process inspection and the fixed
    // task call. A slow/unreachable HTTPS endpoint must not turn 75 seconds into
    // 75 iterations of multi-second requests. Timing out never stops a viewer.
    const deadline=this.now()+75000;
    const remaining=()=>Math.max(0,deadline-this.now());
    const assertTime=()=>{if(remaining()<=0)throw Error('companion_start_timeout');};
    const ready=async()=>{
      assertTime();
      const healthy=await this.ready({timeoutMs:Math.min(2000,remaining())});
      if(this.now()>deadline)throw Error('companion_start_timeout');
      return healthy;
    };
    if(await ready())return;
    // A running but unhealthy companion is never restarted or duplicated here.
    // It may already be booting or carrying a viewer with a network problem.
    const running=await this.running();
    assertTime();
    if(!running){
      const config=await this.read(CONFIG);
      assertTime();
      if(!config||config.nodeExecutable.replaceAll('\\','/').toLowerCase()!=='h:/pti-onepiece/tools/node/node.exe'
        ||config.runtimeRoot.replaceAll('\\','/').toLowerCase()!=='h:/pti-onepiece/runtime')throw Error('configuration_invalid');
      // Every managed start uses the same IgnoreNew task, including logon.
      // Its action is the windowless native host, not a console executable.
      await this.host.startOnePieceTask();
      assertTime();
    }
    for(;;){
      if(await ready())return;
      assertTime();
      await this.wait(Math.min(1000,remaining()));
    }
  }
}
