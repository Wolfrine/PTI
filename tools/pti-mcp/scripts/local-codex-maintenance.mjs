// Owner operator CLI / bounded external one-shot. No model tasks or browser APIs.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1],action=arg('--action');
const repo='F:\\Workspace\\Programs\\Independent-Products\\PTI',root='F:\\Workspace\\Support\\LocalCodexBridge';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const psQuote=value=>"'"+String(value).replaceAll("'","''")+"'";
const ps=code=>execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-Command',code],{windowsHide:true,encoding:'utf8',maxBuffer:1048576}).trim();
const git=(...argv)=>execFileSync('git',['-C',repo,...argv],{encoding:'utf8',windowsHide:true}).trim();
const owner='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2',relayTask='PTI Local Codex Relay';
const absoluteF=value=>{const actual=path.resolve(value);let existing=actual;while(!fs.existsSync(existing))existing=path.dirname(existing);const physical=path.resolve(fs.realpathSync.native(existing),path.relative(existing,actual));if(!/^F:\\/i.test(physical))throw Error('Use a physical F-drive path.');return physical;};
const contained=(parent,value)=>{const actual=absoluteF(value);if(!actual.toLowerCase().startsWith(path.resolve(parent).toLowerCase()+path.sep))throw Error('Path escaped its owning directory.');return actual;};
const original=path.dirname(fileURLToPath(import.meta.url));
const manifestPath=args.includes('--manifest')?absoluteF(arg('--manifest')):null;
let manifest=manifestPath?read(manifestPath):null,stage=manifestPath?path.dirname(manifestPath):null;
const policy=await import(pathToFileURL(manifestPath?path.join(stage,'policy.mjs'):path.join(repo,'tools/local-codex/src/maintenance-policy.mjs')).href);
const {releaseFiles,sha256,verifyRelease,recoveryAction}=policy;
const hashFile=file=>sha256(fs.readFileSync(file));
const manifestHash=manifestPath?hashFile(manifestPath):null;
const taskArguments=()=>'//B //NoLogo "'+path.join(stage,'maintenance-hidden.vbs')+'" "'+manifestPath+'" "'+manifestHash+'"';
const metadata=file=>({name:path.basename(file),bytes:fs.statSync(file).size,sha256:hashFile(file)});
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
function validate(checkSource=true){
  if(hashFile(manifestPath)!==manifestHash)throw Error('Staged manifest changed after loading.');
  if(manifest.stage!==stage||manifest.root!==root||manifest.repo!==repo||!/^[a-f0-9-]{36}$/.test(manifest.id))throw Error('Invalid staged identity/path.');
  if(checkSource&&git('rev-parse','HEAD')!==manifest.sourceCommit)throw Error('Source commit changed after staging.');
  if(checkSource)git('diff','--quiet',manifest.sourceCommit,'--','tools/local-codex','tools/pti-mcp','AGENTS.md');
  if(sha256(Buffer.from(JSON.stringify(manifest.artifacts)))!==manifest.artifactSetHash)throw Error('Artifact manifest hash changed.');
  for(const f of manifest.runtimeFiles){if(hashFile(contained(stage,path.join(stage,f.name)))!==f.sha256)throw Error('Staged helper changed.');}
  for(const f of manifest.installerFiles){if(hashFile(contained(root,path.join(root,f.name)))!==f.sha256)throw Error('Installed launcher/stop script changed.');}
  verifyRelease(path.join(stage,'payload'),manifest.artifacts);
  verifyRelease(contained(path.join(root,'releases'),path.join(root,manifest.previous.release)),manifest.previousArtifacts);
}
function atomic(file,value){const tmp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n');fs.renameSync(tmp,file);}
if(action==='stage'){
  stage=absoluteF(arg('--directory'));if(fs.existsSync(stage))throw Error('Use a new staging directory.');fs.mkdirSync(stage,{recursive:true});
  if(git('branch','--show-current')!=='main')throw Error('Maintenance delivery must use main.');
  const active=read(path.join(root,'active.json')),previousDir=contained(path.join(root,'releases'),path.join(root,active.release));
  const payload=path.join(stage,'payload');fs.mkdirSync(payload);
  for(const name of releaseFiles)fs.copyFileSync(path.join(repo,'tools/local-codex/dist',name),path.join(payload,name),fs.constants.COPYFILE_EXCL);
  const artifacts=releaseFiles.map(name=>metadata(path.join(payload,name))),previousArtifacts=releaseFiles.map(name=>metadata(path.join(previousDir,name)));
  verifyRelease(payload,artifacts);verifyRelease(previousDir,previousArtifacts);
  for(const [from,to] of [[path.join(original,'local-codex-maintenance.mjs'),'runner.mjs'],[path.join(repo,'tools/pti-mcp/dist/local-codex-maintenance.js'),'controller.mjs'],[path.join(repo,'tools/local-codex/src/maintenance-policy.mjs'),'policy.mjs'],[path.join(repo,'tools/local-codex/maintenance-once.ps1'),'maintenance-once.ps1'],[path.join(repo,'tools/local-codex/maintenance-hidden.vbs'),'maintenance-hidden.vbs']])fs.copyFileSync(from,path.join(stage,to),fs.constants.COPYFILE_EXCL);
  const id=randomUUID(),deadline=Date.parse(arg('--deadline'));
  if(!Number.isFinite(deadline)||deadline<=Date.now())throw Error('Supply an explicit future --deadline for this maintenance operation, not model task duration.');
  const state=read(path.join(root,'data/relay-state.json'));
  const workers=(state.active||[]).flatMap(c=>c.localId?[read(path.join(root,'tasks',c.localId,'task.json'))]:[]).map(j=>({id:j.id,pid:j.workerPid}));
  const installerFiles=['run.ps1','run-hidden.vbs','stop.ps1'].map(name=>metadata(path.join(root,name)));
  manifest={schemaVersion:1,id,stage,root,repo,nodePath:active.nodePath,sourceCommit:git('rev-parse','HEAD'),targetVersion:read(path.join(repo,'tools/local-codex/package.json')).version,deadline,
    artifactSetHash:sha256(Buffer.from(JSON.stringify(artifacts))),artifacts,previous:active,previousArtifacts,installerFiles,workers,
    ownerSid:ps('[Security.Principal.WindowsIdentity]::GetCurrent().User.Value'),
    runtimeFiles:['runner.mjs','controller.mjs','policy.mjs','maintenance-once.ps1','maintenance-hidden.vbs'].map(name=>metadata(path.join(stage,name))),
    nodeModulesPackage:path.join(repo,'tools/pti-mcp/package.json'),taskName:'PTI Local Codex Maintenance '+id,createdAt:Date.now(),healthTimeoutMs:90000};
  manifestPath && (()=>{throw Error('Do not combine stage with --manifest.');})();
  fs.writeFileSync(path.join(stage,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');const stagedManifestHash=hashFile(path.join(stage,'manifest.json'));fs.writeFileSync(path.join(stage,'manifest.sha256'),stagedManifestHash+'\n');console.log(JSON.stringify({manifest:path.join(stage,'manifest.json'),manifestSHA256:stagedManifestHash,id,targetVersion:manifest.targetVersion,artifactSetHash:manifest.artifactSetHash}));process.exit(0);
}
if(!manifest)throw Error('Supply --manifest.');
if(['execute','recover'].includes(action)&&(!args.includes('--manifest-sha256')||arg('--manifest-sha256')!==manifestHash))throw Error('Execution requires the owner task action manifest hash.');
validate(false);
const require=createRequire(manifest.nodeModulesPackage),{initializeApp,applicationDefault,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
// Same process-only owner quota scope as firebase-owner.cmd; no persistent setting.
process.env.GOOGLE_CLOUD_QUOTA_PROJECT='worldline-intel';
const {FirestoreMaintenance}=await import(pathToFileURL(path.join(stage,'controller.mjs')).href);
const app=initializeApp({projectId:'pti-app-2ab59',credential:applicationDefault()},'local-codex-maintenance-'+manifest.id),db=getFirestore(app),control=new FirestoreMaintenance(db,owner);
const request={id:manifest.id,targetVersion:manifest.targetVersion,artifactSetHash:manifest.artifactSetHash,deadline:manifest.deadline};
const reportFile=path.join(stage,'result.json');
let stopWatch,watcher,signal,settle;
function wake(){signal?.();signal=null;}
function localIdle(){
  for(const item of fs.readdirSync(path.join(root,'tasks'),{withFileTypes:true})){
    if(!item.isDirectory())continue;const directory=path.join(root,'tasks',item.name);
    if(fs.existsSync(path.join(directory,'worker.lock'))){const job=read(path.join(directory,'task.json'));if(job.workerPid&&alive(job.workerPid))return false;}
  }
  const state=read(path.join(root,'data/relay-state.json')),status=read(path.join(root,'data/status.json'));return Array.isArray(state.active)&&state.active.length===0&&Array.isArray(status.activeTasks)&&status.activeTasks.length===0&&manifest.workers.every(w=>!w.pid||!alive(w.pid));}
async function changed(deadline){if(deadline<=Date.now())throw Error('Maintenance observation deadline elapsed; no active task is canceled.');await new Promise(resolve=>{signal=resolve;settle=setTimeout(resolve,Math.min(10000,deadline-Date.now()));});clearTimeout(settle);signal=null;}
async function health(version,notBefore){const until=Date.now()+manifest.healthTimeoutMs;while(Date.now()<until){const h=await control.status(owner),s=read(path.join(root,'data/status.json'));if(h.worker.version===version&&h.worker.at>=notBefore&&h.worker.dispatchReady===true&&Date.now()-h.worker.at<60000&&s.version===version&&s.state==='online'&&s.listenerConnected===true&&Date.parse(s.at)>=notBefore&&Date.now()-Date.parse(s.at)<60000)return h;await changed(until);}throw Error('Fresh local + hosted heartbeat/listener verification failed.');}
function relayCommand(command){ps(`${command}-ScheduledTask -TaskName ${psQuote(relayTask)} -ErrorAction Stop | Out-Null`);}
function stopRelay(){execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',path.join(root,'stop.ps1')],{windowsHide:true,stdio:'pipe'});}
function externalOnly(){const result=ps(`$currentPid=${process.pid}; $forbidden=$false; for($depth=0;$depth -lt 20 -and $currentPid -gt 0;$depth++){ $p=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$currentPid); if(-not $p){break}; if($p.Name -match '^codex(\\.exe)?$' -or $p.CommandLine -match 'LocalCodexBridge.+worker\\.mjs'){ $forbidden=$true }; $currentPid=[int]$p.ParentProcessId }; if($forbidden){'attached'}else{'external'}`);if(result!=='external')throw Error('Installation/recovery must run in an external owner process, never inside a live Codex worker.');}
async function cleanup(){
  // Delete only the exact one-shot task whose action still targets this manifest.
  ps(`$t=Get-ScheduledTask -TaskName ${psQuote(manifest.taskName)} -ErrorAction SilentlyContinue; if($t -and @($t.Actions).Count -eq 1 -and $t.Actions[0].Execute -eq (Join-Path $env:SystemRoot 'System32\\wscript.exe') -and $t.Actions[0].Arguments -eq ${psQuote(taskArguments())}){ Unregister-ScheduledTask -TaskName ${psQuote(manifest.taskName)} -Confirm:$false -ErrorAction Stop }`);
}
try{
  if(action==='check-external'){let external=true;try{externalOnly();}catch{external=false;}console.log(JSON.stringify({externalProcess:external,installationAttempted:false}));}
  else if(action==='status'){console.log(JSON.stringify(await control.status(owner)));}
  else if(action==='begin'){validate();console.log(JSON.stringify(await control.begin(owner,request)));}
  else if(action==='abort'){console.log(JSON.stringify(await control.abort(owner,request)));}
  else if(action==='schedule'){
    validate();await control.begin(owner,request);
    // Ordinary limited interactive owner; no credential-bearing task definition.
    const code=`$identity=[Security.Principal.WindowsIdentity]::GetCurrent(); $u=$identity.Name; $relay=Get-ScheduledTask -TaskName ${psQuote(relayTask)} -ErrorAction Stop; $relaySid=if($relay.Principal.UserId -match '^S-1-'){$relay.Principal.UserId}else{([Security.Principal.NTAccount]::new($relay.Principal.UserId)).Translate([Security.Principal.SecurityIdentifier]).Value}; if($relaySid -ne $identity.User.Value -or $identity.User.Value -ne ${psQuote(manifest.ownerSid)}){throw 'Relay/maintenance owner identity differs'}; if(Get-ScheduledTask -TaskName ${psQuote(manifest.taskName)} -ErrorAction SilentlyContinue){throw 'Task already exists'}; $a=New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\\wscript.exe') -Argument ${psQuote(taskArguments())} -WorkingDirectory ${psQuote(stage)}; $t=New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(20); $s=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries; $p=New-ScheduledTaskPrincipal -UserId $u -LogonType Interactive -RunLevel Limited; Register-ScheduledTask -TaskName ${psQuote(manifest.taskName)} -Action $a -Trigger $t -Settings $s -Principal $p -ErrorAction Stop | Out-Null; 'registered'`;
    try{if(ps(code)!=='registered')throw Error('One-shot registration was not confirmed.');}catch(error){await control.abort(owner,request);throw error;}
    console.log(JSON.stringify({scheduled:true,taskName:manifest.taskName,manifest:manifestPath,manifestSHA256:manifestHash}));
  }else if(['execute','recover'].includes(action)){
    externalOnly();if(ps('[Security.Principal.WindowsIdentity]::GetCurrent().User.Value')!==manifest.ownerSid)throw Error('External Windows owner identity changed.');
    const attempt=path.join(stage,action+'.attempt');fs.closeSync(fs.openSync(attempt,'wx'));
    let sealed=action==='recover',swapped=false;
    const report={id:manifest.id,targetVersion:manifest.targetVersion,startedAt:Date.now(),outcome:'waiting-for-drain',activated:false,externalProcessVerified:true,manifestSHA256:manifestHash,sourceCommit:manifest.sourceCommit,pid:process.pid,taskName:manifest.taskName};atomic(reportFile,report);
    stopWatch=db.doc(`_ptiLocalServices/local-codex/owners/${owner}`).onSnapshot(wake);watcher=fs.watch(path.join(root,'data'),wake);
    try{
      if(action==='execute'){
        validate();
        while(true){
          if(Date.now()>=manifest.deadline)throw Error('Maintenance wait deadline elapsed; existing tasks were left running.');
          const state=await control.status(owner);if(!state.maintenance||state.maintenance.id!==manifest.id)throw Error('Drain ownership changed.');
          if(!state.nonterminal.length&&localIdle()){await control.seal(owner,request);sealed=true;break;}
          await changed(manifest.deadline);
        }
        validate();await control.guard(owner,request);if(!localIdle())throw Error('Local claims or workers remain active.');
        const next=contained(path.join(root,'releases'),path.join(root,'releases',manifest.targetVersion+'-maintenance-'+manifest.id));fs.mkdirSync(next);
        for(const f of manifest.artifacts)fs.copyFileSync(path.join(stage,'payload',f.name),path.join(next,f.name),fs.constants.COPYFILE_EXCL);
        verifyRelease(next,manifest.artifacts);const disk=fs.statfsSync(root);if(disk.bavail*disk.bsize<1048576)throw Error('Insufficient free space for pointer/journal safety.');report.newRelease=next;report.outcome='installing';atomic(reportFile,report);
        relayCommand('Disable');stopRelay();
        const switchedAt=Date.now();atomic(path.join(root,'active.json'),{...manifest.previous,version:manifest.targetVersion,release:path.relative(root,next),installedAt:new Date().toISOString()});swapped=true;report.switchedAt=switchedAt;atomic(reportFile,report);
        relayCommand('Enable');relayCommand('Start');await health(manifest.targetVersion,switchedAt);verifyRelease(next,manifest.artifacts);
        const result=await control.finish(owner,request,manifest.targetVersion,switchedAt,reportFile);Object.assign(report,result,{activated:true,artifactsMatched:7,listenerConnected:true});atomic(reportFile,report);
      }else{throw Error('Explicit recovery requested.');}
    }catch(error){
      report.outcome='recovery-required';report.activated=false;report.error=error.message;const state=await control.status(owner),decision=recoveryAction(state,manifest.id);
      if(decision==='already-released'){Object.assign(report,state.lastMaintenance,{activated:state.lastMaintenance?.outcome==='activated-verified'});}
      else if(decision==='abort-without-install'){Object.assign(report,await control.abort(owner,request));}
      else{
        try{
          await control.recovery(owner,request);validate(false);await control.guard(owner,request);if(!localIdle())throw Error('Recovery refuses active local claims/workers.');
          relayCommand('Disable');stopRelay();verifyRelease(contained(path.join(root,'releases'),path.join(root,manifest.previous.release)),manifest.previousArtifacts);
          const restoredAt=Date.now();atomic(path.join(root,'active.json'),manifest.previous);relayCommand('Enable');relayCommand('Start');await health(manifest.previous.version,restoredAt);
          Object.assign(report,await control.finish(owner,request,manifest.previous.version,restoredAt,reportFile),{activated:false,rollbackVerified:true});
        }catch(recoveryError){await control.recovery(owner,request);report.outcome='recovery-required';report.recoveryError=recoveryError.message;report.activated=false;}
      }
      atomic(reportFile,report);
    }finally{report.finishedAt=Date.now();try{await cleanup();report.taskCleanup='exact one-shot cleanup checked';}catch(error){report.taskCleanup='cleanup requires inspection: '+error.message;}atomic(reportFile,report);}
    console.log(JSON.stringify(report));if(!['activated-verified','rolled-back-verified','aborted-before-install'].includes(report.outcome))process.exitCode=1;
  }else{throw Error('Use --action stage/status/begin/schedule/execute/recover/abort/check-external.');}
}finally{stopWatch?.();watcher?.close();clearTimeout(settle);await db.terminate();await deleteApp(app);}
