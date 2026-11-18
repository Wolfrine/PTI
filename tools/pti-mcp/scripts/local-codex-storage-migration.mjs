// Explicit owner-only drive cutover. No migration is initiated by the worker.
// Stage/detach/execute/recover use one sealed Firestore maintenance fence.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync,spawn,spawnSync} from 'node:child_process';

if(process.platform!=='win32')throw Error('This migration requires the owner Windows PC.');
const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1],has=name=>args.includes(name);
const action=arg('--action'),F='F:\\Workspace\\Support\\LocalCodexBridge',H='H:\\LocalCodexBridge';
const repo='F:\\Workspace\\Programs\\Independent-Products\\PTI',owner='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2';
const taskName='PTI Local Codex Relay',targetVersion='0.4.15',targetModel='gpt-6.2-sol',targetEffort='xhigh';
const retainedScratchRepo=path.join(F,'scratch');
const seven=['pair-existing.mjs','relay.mjs','review-usage.mjs','server.mjs','setup.mjs','THIRD-PARTY-NOTICES.txt','worker.mjs'];
const psQuote=value=>"'"+String(value).replaceAll("'","''")+"'";
const ps=code=>execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-Command',"$ErrorActionPreference='Stop';"+code],{windowsHide:true,encoding:'utf8',timeout:45000,maxBuffer:2097152}).trim();
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const hash=file=>{const h=createHash('sha256'),fd=fs.openSync(file,'r'),buffer=Buffer.allocUnsafe(1048576);try{for(let n;(n=fs.readSync(fd,buffer,0,buffer.length,null))>0;)h.update(buffer.subarray(0,n));}finally{fs.closeSync(fd);}return h.digest('hex');};
const sha=value=>createHash('sha256').update(value).digest('hex');
const meta=file=>{const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Expected a regular immutable file: '+file);return {name:path.basename(file),bytes:stat.size,sha256:hash(file)};};
function compileFreshMaintenanceController(){
  // Build this owner gate directly from current reviewed TS source in memory.
  // A stale F: dist bundle must never silently omit native-writer protection.
  const packageRoot=path.join(repo,'tools','pti-mcp'),sourceFile=path.join(packageRoot,'src','local-codex-maintenance.ts');
  const ts=createRequire(path.join(packageRoot,'package.json'))('typescript');
  const parsedFile=ts.readConfigFile(path.join(packageRoot,'tsconfig.json'),ts.sys.readFile);
  if(parsedFile.error)throw Error('PTI TypeScript config could not be loaded for migration.');
  const parsed=ts.parseJsonConfigFileContent(parsedFile.config,ts.sys,packageRoot);
  if(parsed.errors.length)throw Error('PTI TypeScript config has errors; migration stage refused.');
  const options={...parsed.options,noEmit:false,noEmitOnError:true};
  const program=ts.createProgram([sourceFile],options);
  const diagnostics=ts.getPreEmitDiagnostics(program);
  if(diagnostics.some(item=>item.category===ts.DiagnosticCategory.Error))throw Error('Fresh maintenance controller TypeScript typecheck failed; rebuild/repair the host source before staging.');
  let compiled;
  const emitted=program.emit(undefined,(file,data)=>{
    if(path.basename(file)==='local-codex-maintenance.js')compiled=data;
  });
  if(emitted.emitSkipped||emitted.diagnostics.some(item=>item.category===ts.DiagnosticCategory.Error)||!compiled||
     !compiled.includes('requireNativeWritersResolved')||!compiled.includes('unresolvedNativeWriters'))
    throw Error('Fresh maintenance controller lacks the reviewed native-writer seal/finish gates.');
  return {output:compiled,sourcePath:sourceFile,sourceSHA256:hash(sourceFile),
    compilerVersion:ts.version,compiledSHA256:sha(compiled)};
}
const equal=(a,b)=>a.toLowerCase()===b.toLowerCase();
function physical(value){
  const absolute=path.resolve(value);let ancestor=absolute;
  while(!fs.existsSync(ancestor)){const parent=path.dirname(ancestor);if(parent===ancestor)throw Error('Missing physical drive: '+absolute);ancestor=parent;}
  return path.resolve(fs.realpathSync.native(ancestor),path.relative(ancestor,absolute));
}
function inside(root,value){const base=physical(root),item=physical(value);if(!item.toLowerCase().startsWith((base+path.sep).toLowerCase()))throw Error('Path escaped its approved root.');return item;}
function assertRoot(value,expected){if(!equal(path.resolve(value),expected)||!equal(physical(value),expected))throw Error('Drive root is redirected or not the exact approved installation.');}
function stagePath(value){const actual=physical(value);if(!actual.toLowerCase().startsWith((path.join(H,'maintenance')+path.sep).toLowerCase()))throw Error('Storage-cutover stages must reside inside H: bridge maintenance.');return actual;}
function atomic(file,value){const temporary=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx'});fs.renameSync(temporary,file);}
const stage=has('--manifest')?path.dirname(stagePath(arg('--manifest'))):null;
const manifestPath=stage?path.join(stage,'manifest.json'):null;
const manifest=stage?read(manifestPath):null;
if(stage&&(!equal(manifest.stage,stage)||manifest.kind!=='f-to-h-bridge-cutover'||manifest.sourceRoot!==F||manifest.targetRoot!==H))throw Error('Unknown migration manifest or stage.');
const pin=stage?hash(manifestPath):null,reportFile=stage?path.join(stage,'result.json'):null;
const req=manifest?{id:manifest.id,targetVersion:manifest.targetVersion,artifactSetHash:manifest.artifactSetHash,deadline:manifest.deadline}:null;
function identity(){return ps('[Security.Principal.WindowsIdentity]::GetCurrent().User.Value');}
function externalOnly(){
  const result=ps('$p='+process.pid+';$attached=$false;for($n=0;$n -lt 20 -and $p -gt 0;$n++){$v=Get-CimInstance Win32_Process -Filter ("ProcessId = "+$p);if(-not $v){break};if($v.Name -match "^codex(\\.exe)?$" -or $v.CommandLine -match "LocalCodexBridge.+worker\\.mjs"){$attached=$true};$p=[int]$v.ParentProcessId};if($attached){"attached"}else{"external"}');
  if(result!=='external')throw Error('Cutover executor must be outside every Codex/native-worker process tree.');
}
function secureH(){
  // Exact H: NTFS root; explicit owner + SYSTEM-only ACL before writing data.
  const code='$d=Get-Volume -DriveLetter H -ErrorAction Stop;if($d.FileSystem -ne "NTFS"){throw "H: must be NTFS"};'+
    '$root='+psQuote(H)+';if(Test-Path -LiteralPath $root){throw "H bridge appeared while preparing its new owner-private directory"}else{New-Item -ItemType Directory -Path $root -ErrorAction Stop|Out-Null};'+
    '$owner=[Security.Principal.WindowsIdentity]::GetCurrent().User;'+
    '$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetOwner($owner);$acl.SetAccessRuleProtection($true,$false);'+
    'foreach($sid in @($owner,[Security.Principal.SecurityIdentifier]::new("S-1-5-18"))){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,"FullControl","ContainerInherit,ObjectInherit","None","Allow"))};'+
    '[IO.Directory]::SetAccessControl($root,$acl);'+
    '$actual=Get-Acl -LiteralPath $root;if($actual.Owner -notin @($owner.Value,$owner.Translate([Security.Principal.NTAccount]).Value) -or -not $actual.AreAccessRulesProtected){throw "Private H ACL verification failed"};'+
    'foreach($r in $actual.Access){if($r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($owner.Value,"S-1-5-18") -or $r.AccessControlType -ne "Allow"){throw "Unexpected H ACL entry"}}';
  ps(code);assertRoot(H,H);
}
function verifyPrivateH(){
  assertRoot(H,H);
  const code='$p='+psQuote(H)+';$a=Get-Acl -LiteralPath $p;$u=[Security.Principal.WindowsIdentity]::GetCurrent().User;'+
    'if(-not $a.AreAccessRulesProtected){throw "H bridge ACL is inherited"};'+
    'if($a.Owner -notin @($u.Value,$u.Translate([Security.Principal.NTAccount]).Value)){throw "H bridge owner changed"};'+
    'foreach($r in $a.Access){if($r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($u.Value,"S-1-5-18") -or $r.AccessControlType -ne "Allow"){throw "Unsafe H bridge ACL"}}';
  ps(code);
}
function taskState(){
  const code='$t=Get-ScheduledTask -TaskName '+psQuote(taskName)+' -ErrorAction Stop;'+
    'if(@($t.Actions).Count -ne 1){throw "Relay task has multiple actions"};'+
    '$sid=if($t.Principal.UserId -match "^S-1-"){$t.Principal.UserId}else{([Security.Principal.NTAccount]::new($t.Principal.UserId)).Translate([Security.Principal.SecurityIdentifier]).Value};'+
    '[pscustomobject]@{sid=$sid;state=[string]$t.State;execute=[string]$t.Actions[0].Execute;arguments=[string]$t.Actions[0].Arguments;workingDirectory=[string]$t.Actions[0].WorkingDirectory;logonType=[string]$t.Principal.LogonType;runLevel=[string]$t.Principal.RunLevel}|ConvertTo-Json -Compress';
  const state=JSON.parse(ps(code));
  if(state.sid!==identity()||!equal(path.resolve(state.execute),path.join(process.env.SystemRoot,'System32','wscript.exe'))||
     state.logonType!=='Interactive'||state.runLevel!=='Limited')throw Error('Scheduled relay task owner, principal or executable differs.');
  return state;
}
function expectTask(root,state=taskState()){
  const expected='//B //NoLogo "'+path.join(root,'run-hidden.vbs')+'"';
  if(!equal(state.workingDirectory,root)||state.arguments!==expected)throw Error('Relay task action no longer targets the expected root.');
  return state;
}
function retainedScratchProof(){
  const info=fs.lstatSync(retainedScratchRepo);
  if(!info.isDirectory()||info.isSymbolicLink()||!equal(physical(retainedScratchRepo),retainedScratchRepo))throw Error('Retained F scratch path is redirected or not a directory.');
  // Legacy installs allowlisted a container with the active Git checkout below it.
  const candidate=fs.existsSync(path.join(retainedScratchRepo,'.git'))?retainedScratchRepo:path.join(retainedScratchRepo,'AndroidAutoDiagnostics');
  const child=fs.lstatSync(candidate);
  if(!child.isDirectory()||child.isSymbolicLink()||!equal(physical(candidate),candidate))throw Error('Retained F source checkout is redirected.');
  const top=execFileSync('git',['-C',candidate,'rev-parse','--show-toplevel'],{windowsHide:true,encoding:'utf8',timeout:15000,stdio:['ignore','pipe','ignore']}).trim();
  if(!equal(fs.realpathSync.native(top),candidate))throw Error('Retained F source is not its exact Git root.');
  return {physicalPath:retainedScratchRepo,gitRoot:candidate,kind:equal(candidate,retainedScratchRepo)?'repository':'legacy-container'};
}
function guardScratch(){
  const config=read(path.join(F,'config.json'));
  for(const [key,project] of Object.entries(config.projects||{})){
    if(typeof project.path!=='string'||!/^F:[\\/]/i.test(project.path))throw Error('Project '+key+' is not a verified F: code path.');
    const literal=path.win32.resolve(project.path),actual=fs.realpathSync.native(literal);
    const exactRetainedRepo=key==='scratch'&&equal(literal,retainedScratchRepo)&&equal(actual,retainedScratchRepo);
    if(!/^F:\\/i.test(actual)||
       actual.toLowerCase().startsWith((F+'\\').toLowerCase())&&!exactRetainedRepo)
      throw Error('Legacy bridge-hosted or redirected project '+key+' requires explicit inventory/retirement before cutover.');
    if(exactRetainedRepo){retainedScratchProof();continue;}
    let gitRoot;
    try{gitRoot=execFileSync('git',['-C',actual,'rev-parse','--show-toplevel'],{windowsHide:true,encoding:'utf8',timeout:15000,stdio:['ignore','pipe','ignore']}).trim();}
    catch{throw Error('Configured F project '+key+' is not demonstrably inside a Git code checkout.');}
    const resolvedRepo=fs.realpathSync.native(gitRoot);
    if(!/^F:\\/i.test(resolvedRepo)||!actual.toLowerCase().startsWith((resolvedRepo+path.sep).toLowerCase())&&!equal(actual,resolvedRepo))
      throw Error('Configured project '+key+' does not resolve to its physical F: repository.');
  }
  if(config.model==='gpt-6.1-sol'&&config.reasoningEffort==='xhigh')return {...config,model:targetModel,reasoningEffort:targetEffort};
  if(config.model===targetModel&&config.reasoningEffort===targetEffort)return config;
  throw Error('Installed model/effort differs from the exact owner-approved 6.1-sol/xhigh or 6.2-sol/xhigh pair.');
}
function configNonModelHash(config){
  const rest=structuredClone(config);delete rest.model;delete rest.reasoningEffort;
  return sha(JSON.stringify(rest));
}
function originalReleaseFiles(pointer){
  if(typeof pointer.release!=='string'||path.win32.isAbsolute(pointer.release))throw Error('Original F release pointer must be relative.');
  const dir=path.win32.resolve(F,pointer.release),releases=path.join(F,'releases')+path.sep;
  if(!dir.toLowerCase().startsWith(releases.toLowerCase())||!equal(physical(dir),dir))throw Error('Original release escapes the physical F releases root.');
  if(JSON.stringify(fs.readdirSync(dir).sort())!==JSON.stringify([...seven].sort()))throw Error('Original F release is not the exact seven-file artifact set.');
  return seven.map(name=>{
    const file=path.join(dir,name);
    if(!equal(physical(file),file))throw Error('Original release contains a redirected file.');
    return meta(file);
  });
}
function verifyOriginalRelease(){
  const current=originalReleaseFiles(manifest.previous);
  if(JSON.stringify(current)!==JSON.stringify(manifest.previousReleaseFiles))throw Error('Original seven-file F release has changed; rollback cannot be trusted.');
}
function guardChrome(){
  if(fs.existsSync(path.join(F,'chrome','active.json')))throw Error('Optional Owner Chrome is still enabled; release it and perform its separately verified disable/registry migration before bridge cutover.');
  const code='$key="Software\\Google\\Chrome\\NativeMessagingHosts\\com.pti.local_codex.chrome";'+
    'foreach($view in @([Microsoft.Win32.RegistryView]::Registry32,[Microsoft.Win32.RegistryView]::Registry64)){$b=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser,$view);$k=$b.OpenSubKey($key);if($k){$k.Dispose();$b.Dispose();throw "Optional Owner Chrome registration still exists"};$b.Dispose()};"disabled"';
  if(ps(code)!=='disabled')throw Error('Chrome registration could not be verified disabled.');
}
function reserveFRollback(){
  const state=['data/status.json','data/relay-state.json','data/credential.json','active.json']
    .map(name=>path.join(F,name)).filter(file=>fs.existsSync(file))
    .reduce((sum,file)=>sum+fs.statSync(file).size,0);
  const required=Math.max(4*1048576,3*state+1048576);
  const disk=fs.statfsSync(F),available=BigInt(disk.bavail)*BigInt(disk.bsize);
  if(available<BigInt(required))throw Error('F lacks rollback headroom for prior relay state/credential/status writes; free only individually verified transient files before starting a drain.');
  return {availableBytes:String(available),requiredBytes:required};
}
function verifyStage(){
  assertRoot(F,F);verifyPrivateH();
  if(!stage||!equal(physical(stage),stage)||hash(manifestPath)!==pin||
     fs.readFileSync(path.join(stage,'manifest.sha256'),'utf8').trim().toLowerCase()!==pin||
     manifest.manifestSHA256)throw Error('Pinned stage changed.');
  if(identity()!==manifest.ownerSid||manifest.targetVersion!==targetVersion||manifest.nodePath!==process.execPath)throw Error('Owner, runtime or target changed.');
  for(const item of [...manifest.runtimeFiles,...manifest.payloadFiles,...manifest.launcherFiles]){
    const file=inside(stage,path.join(stage,item.location));const actual=meta(file);
    if(actual.sha256!==item.sha256||actual.bytes!==item.bytes)throw Error('Frozen cutover file changed: '+item.location);
  }
  if(read(path.join(F,'active.json')).version!==manifest.previous.version||hash(path.join(F,'active.json'))!==manifest.previousPointerHash)throw Error('Original F release pointer changed since staging.');
  if(hash(path.join(F,'config.json'))!==manifest.sourceConfigHash||
     configNonModelHash(read(path.join(F,'config.json')))!==manifest.nonModelConfigHash)throw Error('Installed F project/credential/model configuration changed since staging.');
  verifyOriginalRelease();
  if(['detach','execute'].includes(action)){
    const current=execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8',windowsHide:true,timeout:15000}).trim();
    if(current!==manifest.sourceCommit)throw Error('Source commit moved after staging; use a new immutable migration stage.');
  }
  if(sha(JSON.stringify(manifest.payloadFiles))!==manifest.artifactSetHash)throw Error('Payload seal changed.');
  if(['detach','execute'].includes(action)&&
     hash(path.join(repo,'tools','pti-mcp','src','local-codex-maintenance.ts'))!==manifest.maintenanceControllerSource?.sourceSHA256)
    throw Error('Maintenance native-writer source changed after the frozen H stage; stage again.');
  guardScratch();guardChrome();
}
function modelRuntime(){
  const config=read(path.join(F,'config.json'));
  if(config.codexPath){
    if(!fs.existsSync(config.codexPath))throw Error('Configured desktop Codex executable is missing.');
    return config.codexPath;
  }
  const base=path.join(process.env.LOCALAPPDATA||'','OpenAI','Codex','bin');
  const candidates=fs.existsSync(base)?fs.readdirSync(base).map(name=>path.join(base,name,'codex.exe')).filter(file=>fs.existsSync(file)):[];
  candidates.sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);
  if(!candidates.length)throw Error('Desktop Codex binary unavailable for model catalog preflight.');
  return candidates[0];
}
async function verifyCatalog(executable){
  // One isolated read-only app-server, no native thread or turn creation.
  const config=read(path.join(F,'config.json')),env={...process.env};
  for(const name of Object.keys(env))if(['OPENAI_API_KEY','CODEX_API_KEY','CODEX_ACCESS_TOKEN','OPENAI_BASE_URL','OPENAI_API_BASE'].includes(name.toUpperCase()))delete env[name];
  const processHandle=spawn(executable,[...(config.codexArgs||[]),'app-server','--stdio'],{cwd:repo,windowsHide:true,stdio:['pipe','pipe','pipe'],env});
  const pending=new Map(),lines=readline.createInterface({input:processHandle.stdout});let sequence=0,closed=false;
  const rejectAll=error=>{for(const item of pending.values()){clearTimeout(item.timer);item.reject(error);}pending.clear();};
  processHandle.on('error',rejectAll);processHandle.on('exit',()=>rejectAll(Error('Codex catalog app-server exited.')));processHandle.stderr.resume();
  const send=value=>processHandle.stdin.write(JSON.stringify(value)+'\n');
  lines.on('line',line=>{try{const response=JSON.parse(line);if(response.method&&response.id!==undefined){send({id:response.id,error:{code:-32601,message:'Catalog probe cannot approve actions.'}});return;}const waiter=pending.get(response.id);if(!waiter)return;clearTimeout(waiter.timer);pending.delete(response.id);response.error?waiter.reject(Error(response.error.message)):waiter.resolve(response.result);}catch(error){rejectAll(error);}});
  const rpc=(method,params)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Catalog probe timed out: '+method));},20000);pending.set(id,{resolve,reject,timer});send({id,method,params});});
  try{
    await rpc('initialize',{clientInfo:{name:'local_codex_storage_migration',version:'0.4.15'},capabilities:{experimentalApi:true}});
    send({method:'initialized'});
    const account=await rpc('account/read',{refreshToken:false});if(account.account?.type!=='chatgpt')throw Error('Owner desktop Codex is not signed in via ChatGPT.');
    let cursor=null;const visited=new Set();
    for(let i=0;i<20;i++){
      const models=await rpc('model/list',{limit:100,includeHidden:false,cursor});
      const match=models.data?.find(item=>item.model===targetModel);
      if(match){if(!match.supportedReasoningEfforts?.some(item=>item.reasoningEffort===targetEffort))throw Error('6.2 Sol xhigh is not available to this signed-in owner.');return;}
      cursor=models.nextCursor;if(!cursor||visited.has(cursor))break;visited.add(cursor);
    }
    throw Error('Signed-in Codex model catalog does not include 6.2 Sol.');
  }finally{
    if(!closed){closed=true;rejectAll(Error('Catalog probe complete.'));lines.close();processHandle.stdin.end();}
    if(processHandle.pid){if(process.platform==='win32')spawnSync('taskkill.exe',['/PID',String(processHandle.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:10000});else processHandle.kill();}
  }
}
function HIsEmptyExceptStages(){
  const occupied=fs.readdirSync(H).filter(name=>name.toLowerCase()!=='maintenance');
  if(occupied.length)throw Error('H bridge destination has existing operational content: inspect it without overwriting.');
}
if(action==='prepare-h'){
  if(has('--manifest'))throw Error('H preparation is separate from a staged owner migration.');
  assertRoot(F,F);
  if(!fs.existsSync(H))secureH();else verifyPrivateH();
  HIsEmptyExceptStages();
  console.log(JSON.stringify({prepared:true,root:H,ownerSid:identity(),secureOwnerDirectory:true,
    migrationStarted:false,fFilesChanged:0}));
  process.exit(0);
}
function payloadDirectory(value){
  const actual=physical(value);
  const repoBuild=path.join(repo,'tools','local-codex','dist');
  const hBuild=path.join(H,'maintenance')+path.sep;
  if(!equal(actual,repoBuild)&&!actual.toLowerCase().startsWith(hBuild.toLowerCase()))throw Error('Payload must be the F: PTI source build or an H: private maintenance build.');
  if(JSON.stringify(fs.readdirSync(actual).sort())!==JSON.stringify([...seven].sort()))throw Error('Exactly seven built Local Codex release files are required.');
  return actual;
}
if(action==='stage'){
  if(has('--manifest'))throw Error('Stage requires a new directory, not an existing manifest.');
  assertRoot(F,F);
  if(!fs.existsSync(H))secureH();else verifyPrivateH();
  HIsEmptyExceptStages();guardScratch();guardChrome();reserveFRollback();
  const existing=expectTask(F);
  if(!['Ready','Running'].includes(existing.state))throw Error('Original owner task is not enabled.');
  const old=read(path.join(F,'active.json'));
  if(!/^\d+\.\d+\.\d+$/.test(old.version))throw Error('Unknown installed F worker version.');
  if(!equal(path.resolve(old.nodePath),process.execPath))throw Error('Staging Node runtime differs from the installed relay; use its exact supported executable.');
  if(read(path.join(repo,'tools/local-codex/package.json')).version!==targetVersion)throw Error('Cutover worker target build/version is not 0.4.15.');
  const payloadSource=payloadDirectory(arg('--payload'));
  const relayBytes=fs.readFileSync(path.join(payloadSource,'relay.mjs'),'utf8');
  if(!relayBytes.includes(targetVersion)||!relayBytes.includes('H:/LocalCodexBridge'))throw Error('Payload does not visibly embed the 0.4.15 dual-drive worker; rebuild from current reviewed sources.');
  const selected=guardScratch();if(selected.model!==targetModel||selected.reasoningEffort!==targetEffort)throw Error('Model selection was not reconciled.');
  await verifyCatalog(modelRuntime());
  const deadline=Date.parse(arg('--deadline'));
  if(!Number.isFinite(deadline)||deadline<=Date.now()+90000)throw Error('Supply a future deadline allowing protected native work to finish.');
  const directory=stagePath(arg('--directory'));
  if(fs.existsSync(directory))throw Error('Use a new, unused private H staging directory.');
  fs.mkdirSync(directory,{recursive:true});
  const runtime=[
    [fileURLToPath(import.meta.url),'runner.mjs'],
    [path.join(repo,'tools/local-codex/maintenance-once.ps1'),'maintenance-once.ps1'],
    [path.join(repo,'tools/local-codex/maintenance-detach.ps1'),'maintenance-detach.ps1'],
    [path.join(repo,'tools/local-codex/maintenance-hidden.vbs'),'maintenance-hidden.vbs']
  ];
  const freezeTo=(from,to)=>{const dest=path.join(directory,to);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(from,dest,fs.constants.COPYFILE_EXCL);return {...meta(dest),location:to};};
  const runtimeFiles=runtime.map(([from,to])=>freezeTo(from,to));
  const freshController=compileFreshMaintenanceController();
  fs.writeFileSync(path.join(directory,'controller.mjs'),freshController.output,{flag:'wx'});
  runtimeFiles.push({...meta(path.join(directory,'controller.mjs')),location:'controller.mjs'});
  const payloadFiles=seven.map(name=>freezeTo(path.join(payloadSource,name),'payload'+path.sep+name));
  const launcherFiles=['run.ps1','stop.ps1','run-hidden.vbs'].map(name=>freezeTo(path.join(repo,'tools','local-codex',name),'launchers'+path.sep+name));
  const id=randomUUID(),identitySid=identity(),nodePath=process.execPath;
  const sourceCommit=execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8',timeout:15000}).trim();
  const installedHash=hash(path.join(F,'active.json'));
  const previousReleaseFiles=originalReleaseFiles(old),sourceConfigHash=hash(path.join(F,'config.json'));
  const frozen={schemaVersion:1,kind:'f-to-h-bridge-cutover',id,sourceRoot:F,targetRoot:H,stage:directory,repo,
    ownerSid:identitySid,nodePath,gitPath:ps('(Get-Command git.exe -ErrorAction Stop).Source'),sourceCommit,
    previous:old,previousPointerHash:installedHash,previousReleaseFiles,sourceConfigHash,
    nonModelConfigHash:configNonModelHash(read(path.join(F,'config.json'))),
    targetVersion,model:targetModel,reasoningEffort:targetEffort,deadline,
    artifactSetHash:sha(JSON.stringify(payloadFiles)),payloadFiles,runtimeFiles,launcherFiles,
    maintenanceControllerSource:{path:'tools/pti-mcp/src/local-codex-maintenance.ts',
      sourceSHA256:freshController.sourceSHA256,compiledSHA256:freshController.compiledSHA256,
      compilerVersion:freshController.compilerVersion,build:'typechecked in-memory TypeScript emit; frozen directly on H'},
    originalTask:existing,createdAt:Date.now(),healthTimeoutMs:120000,launchMethod:'detached',
    nodeModulesPackage:path.join(repo,'tools/pti-mcp/package.json')};
  atomic(path.join(directory,'manifest.json'),frozen);
  fs.writeFileSync(path.join(directory,'manifest.sha256'),hash(path.join(directory,'manifest.json'))+'\n',{flag:'wx'});
  console.log(JSON.stringify({staged:true,manifest:path.join(directory,'manifest.json'),manifestSHA256:hash(path.join(directory,'manifest.json')),id,sourceVersion:old.version,targetVersion,drive:'H:',activationAttempted:false}));
  process.exit(0);
}
if(!manifest)throw Error('Provide --action prepare-h/stage, or supply a pinned --manifest for other actions.');
verifyStage();
const require=createRequire(manifest.nodeModulesPackage);
const {initializeApp,applicationDefault,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
process.env.GOOGLE_CLOUD_QUOTA_PROJECT='worldline-intel';
const {FirestoreMaintenance}=await import(pathToFileURL(path.join(stage,'controller.mjs')).href);
const app=initializeApp({projectId:'pti-app-2ab59',credential:applicationDefault()},'local-codex-storage-'+manifest.id);
const db=getFirestore(app),control=new FirestoreMaintenance(db,owner);
if(action==='status'){
  try{console.log(JSON.stringify(await control.status(owner)));}
  finally{await db.terminate();await deleteApp(app);}
  process.exit(0);
}
if(action==='detach'){
  try{
    expectTask(F);
    await control.begin(owner,req);
    try{
      const launch=JSON.parse(execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',path.join(stage,'maintenance-detach.ps1'),'-Manifest',manifestPath,'-ManifestSHA256',pin],{windowsHide:true,encoding:'utf8',timeout:30000}));
      const acknowledgment=await new Promise((resolve,reject)=>{
        const check=()=>{if(!fs.existsSync(reportFile))return;try{const report=read(reportFile);if(report.externalProcessVerified===true&&report.ownerSid===manifest.ownerSid&&report.manifestSHA256===pin&&report.id===manifest.id){clearTimeout(timeout);watch.close();resolve(report);}}catch{}};
        const watch=fs.watch(stage,check),timeout=setTimeout(()=>{watch.close();reject(Error('Detached owner executor did not acknowledge its pinned stage.'));},20000);check();
      });
      console.log(JSON.stringify({detached:true,launch,acknowledgment,manifest:manifestPath,manifestSHA256:pin,activationAttempted:false}));
    }catch(error){
      try{await control.abort(owner,req);}catch{throw Error(error.message+' Inspect the sealed maintenance gate; do not clear it manually.');}
      throw error;
    }
  }finally{await db.terminate();await deleteApp(app);}
  process.exit(0);
}
let observedHost,observedJobs,observationError,stopHost,stopJobs,dataWatch,taskWatch,targetWatch;
const observers=new Set();
const wake=()=>{for(const item of [...observers])item();};
function subscribe(){
  const doc=db.doc('_ptiLocalServices/local-codex/owners/'+owner);
  const failed=error=>{observationError=Error('Owner observation failed: '+error.message);wake();};
  stopHost=doc.onSnapshot(snapshot=>{observedHost=snapshot.data();wake();},failed);
  stopJobs=doc.collection('jobs').where('status','in',['queued','running','waiting_for_user']).onSnapshot(snapshot=>{observedJobs=snapshot.size;wake();},failed);
  dataWatch=fs.watch(path.join(F,'data'),wake);
  taskWatch=fs.watch(path.join(F,'tasks'),{recursive:true},wake);
}
function observeUntil(predicate,deadline,message){
  return new Promise((resolve,reject)=>{
    const done=(error,value)=>{clearTimeout(timer);observers.delete(check);error?reject(error):resolve(value);};
    const check=()=>{try{if(observationError)throw observationError;const result=predicate();if(result)done(null,result);}catch(error){done(error);}};
    const timer=setTimeout(()=>done(Error(message)),Math.max(1,deadline-Date.now()));
    observers.add(check);check();
  });
}
const alive=pid=>{
  if(!Number.isInteger(pid)||pid<=0)return false;
  try{process.kill(pid,0);return true;}
  catch(error){if(error.code==='ESRCH')return false;throw Error('Cannot verify Windows process PID '+pid+' without access; preserve owner state.');}
};
function fRelay(){
  const lock=path.join(F,'data','relay.lock');
  if(!fs.existsSync(lock))return {alive:false};
  const pid=read(lock).pid;
  if(!Number.isInteger(pid)||pid<=0)throw Error('F relay lock has an invalid PID.');
  if(!alive(pid))return {alive:false,pid};
  const code='$p=Get-CimInstance Win32_Process -Filter ("ProcessId = '+pid+'") -ErrorAction Stop;'+
    'if(-not $p){throw "Owner relay PID disappeared during verification"};'+
    '[pscustomobject]@{exe=[string]$p.ExecutablePath;command=[string]$p.CommandLine}|ConvertTo-Json -Compress';
  const info=JSON.parse(ps(code));
  if(!equal(path.resolve(info.exe),path.resolve(manifest.previous.nodePath))||
     !info.command.toLowerCase().includes((F+'\\releases\\').toLowerCase())||
     !/relay\.mjs"?\s*$/i.test(info.command))throw Error('F relay lock points at an unknown live process; never stop it.');
  return {alive:true,pid};
}
function ensureFRelayStopped(){
  if(fRelay().alive)throw Error('Unexpected F relay resumed during H cutover. Preserve the sealed fence and roll back H.');
}
function localIdle(){
  fRelay(); // An expected pre-seal F relay is allowed, but its PID must be owned.
  const state=read(path.join(F,'data','relay-state.json'));
  const status=read(path.join(F,'data','status.json'));
  if(!Array.isArray(state.active)||state.active.length||!Array.isArray(status.activeTasks)||status.activeTasks.length)return false;
  for(const child of fs.readdirSync(path.join(F,'tasks'),{withFileTypes:true})){
    if(!child.isDirectory())throw Error('Unexpected item in protected task collection.');
    const directory=inside(F,path.join(F,'tasks',child.name)),lock=path.join(directory,'worker.lock'),task=path.join(directory,'task.json');
    if(fs.existsSync(lock)&&alive(read(lock).pid))return false;
    if(fs.existsSync(task)){
      const job=read(task);
      if(['queued','running','waiting_for_user'].includes(job.status)||alive(job.workerPid))return false;
    }
  }
  return true;
}
function sourceInventory(){
  const directories=[],files=[],seenDirectories=new Set();
  let excludedRepository=null;
  function visit(relative=''){
    const absolute=relative?path.join(F,relative):F;
    // lstat first: resolving a junction before checking its type can follow
    // a cycle or escape this source tree. Realpath must equal the literal
    // directory even for an internal junction, and no physical directory
    // may appear twice.
    const stat=fs.lstatSync(absolute);
    if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Source contains a redirected/non-directory entry.');
    const actual=physical(absolute);
    if(!equal(actual,absolute)||seenDirectories.has(actual.toLowerCase()))throw Error('Source directory is reparse-redirected or cyclic: '+relative);
    seenDirectories.add(actual.toLowerCase());
    directories.push(relative);
    for(const entry of fs.readdirSync(absolute,{withFileTypes:true})){
      const rel=relative?path.join(relative,entry.name):entry.name,source=path.join(F,rel);
      const info=fs.lstatSync(source);
      if(info.isSymbolicLink()||(!info.isDirectory()&&!info.isFile()))throw Error('Source contains unsupported link/device: '+rel);
      if(!equal(physical(source),source))throw Error('Source path is a reparse point: '+rel);
      if(!relative&&entry.name.toLowerCase()==='scratch'){
        if(!info.isDirectory()||!equal(source,retainedScratchRepo))throw Error('Exact F scratch exclusion is not a physical directory.');
        const proof=retainedScratchProof();
        excludedRepository={relative:rel,...proof,
          reason:'owner F-drive source working area; excluded from H operational copy',copied:false,deleted:false};
        continue;
      }
      if(info.isDirectory())visit(rel);
      else files.push({relative:rel,bytes:info.size,sha256:hash(source),skip:rel.toLowerCase()==='data\\relay.lock'||/^tasks\\[^\\]+\\worker\.lock$/i.test(rel)});
    }
  }
  visit();
  directories.sort();files.sort((a,b)=>a.relative.localeCompare(b.relative));
  return {schemaVersion:1,id:manifest.id,generatedAt:new Date().toISOString(),source:F,target:H,directories,files,excludedRepository,
    totalBytes:files.filter(f=>!f.skip).reduce((sum,item)=>sum+item.bytes,0),ignoredLiveLocks:files.filter(f=>f.skip).map(f=>({relative:f.relative,bytes:f.bytes,sha256:f.sha256}))};
}
function verifyInventoryStable(original){
  const now=sourceInventory();
  if(JSON.stringify(now.directories)!==JSON.stringify(original.directories)||
     JSON.stringify(now.files)!==JSON.stringify(original.files))throw Error('The stopped F installation changed during H copy. Preserve the sealed gate.');
}
function copyToH(inventory){
  HIsEmptyExceptStages();verifyPrivateH();
  const available=fs.statfsSync(H),bytes=BigInt(available.bavail)*BigInt(available.bsize);
  if(bytes<BigInt(inventory.totalBytes)+67108864n)throw Error('H lacks source bytes plus 64 MiB safety reserve.');
  for(const rel of inventory.directories){
    if(!rel)continue;
    const dir=path.join(H,rel),real=physical(dir);
    if(!equal(real,dir))throw Error('H directory is a junction or redirected: '+rel);
    if(fs.existsSync(dir)){
      if(rel.toLowerCase()!=='maintenance')throw Error('H destination collision: '+rel);
    }else fs.mkdirSync(dir);
  }
  for(const entry of inventory.files){
    if(entry.skip)continue;
    const source=inside(F,path.join(F,entry.relative));
    const target=inside(H,path.join(H,entry.relative));
    if(fs.existsSync(target))throw Error('H file already exists; never overwrite operational state: '+entry.relative);
    fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
    if(fs.lstatSync(target).size!==entry.bytes||hash(target)!==entry.sha256)throw Error('Copied file failed SHA-256 verification: '+entry.relative);
  }
  verifyInventoryStable(inventory);
}
function verifyCopiedCredential(){
  const credential=path.join(H,'data','credential.json');
  if(!fs.existsSync(credential))throw Error('Encrypted owner credential was not copied.');
  // Do not return, persist, print, or pass any decrypted token across a pipe.
  const code='Add-Type -AssemblyName System.Security;'+
    '$e=Get-Content -LiteralPath '+psQuote(credential)+' -Raw|ConvertFrom-Json;'+
    'if($e.version -ne 1){throw "Encrypted credential schema changed"};'+
    '$entropy=[Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes("local-codex-v1:'+owner+'"));'+
    '$plain=$null;try{$plain=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($e.ciphertext),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser);'+
    '$v=[Text.Encoding]::UTF8.GetString($plain)|ConvertFrom-Json;if($v.uid -ne '+psQuote(owner)+' -or -not $v.refreshToken){throw "Owner credential cannot be decrypted on H"};'+
    '"credential-ok"}finally{if($plain){[Array]::Clear($plain,0,$plain.Length)};[Array]::Clear($entropy,0,$entropy.Length)}';
  try{if(ps(code)!=='credential-ok')throw Error('Credential probe did not complete.');}
  catch{throw Error('Owner DPAPI credential validation failed; inspect authorization locally without exposing credential or PowerShell diagnostics.');}
}
function preserveOriginalCredential(inventory){
  const item=inventory.files.find(file=>file.relative.toLowerCase()==='data\\credential.json');
  if(!item||item.skip)throw Error('Original DPAPI envelope missing from stopped F inventory.');
  const backup=path.join(stage,'original-f-credential.encrypted.json');
  fs.copyFileSync(path.join(F,'data','credential.json'),backup,fs.constants.COPYFILE_EXCL);
  if(hash(backup)!==item.sha256||fs.statSync(backup).size!==item.bytes)throw Error('Encrypted F rollback credential backup does not match the sealed copy inventory.');
}
function reconcileRotatedCredential(){
  const f=path.join(F,'data','credential.json'),h=path.join(H,'data','credential.json');
  if(!fs.existsSync(h))return; // Copy failed before credentials were installed on H.
  const inventoryFile=path.join(stage,'copy-inventory.json'),backup=path.join(stage,'original-f-credential.encrypted.json');
  if(!fs.existsSync(inventoryFile)||!fs.existsSync(backup))throw Error('No sealed original-credential inventory/backup exists; leave admission fenced.');
  const inventory=read(inventoryFile),original=inventory.files.find(file=>file.relative.toLowerCase()==='data\\credential.json');
  if(!original||hash(backup)!==original.sha256||hash(f)!==original.sha256)throw Error('Original F encrypted credential changed while H was active; refuse overwrite.');
  verifyCopiedCredential(); // Same current-user DPAPI identity; plaintext never leaves this PowerShell probe.
  const latest=hash(h);
  if(latest===original.sha256)return;
  const temporary=f+'.storage-cutover-'+manifest.id+'.tmp';
  fs.copyFileSync(h,temporary,fs.constants.COPYFILE_EXCL);
  try{
    if(hash(temporary)!==latest||hash(f)!==original.sha256)throw Error('Credential changed during the pinned rollback copy.');
    fs.renameSync(temporary,f);
    if(hash(f)!==latest)throw Error('Latest owner credential was not preserved on F after rollback.');
  }finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
function installNewHRelease(inventory){
  const release='releases\\'+targetVersion+'-storage-'+manifest.id,dir=path.join(H,release);
  if(fs.existsSync(dir))throw Error('Target release already exists.');
  fs.mkdirSync(dir);
  for(const item of manifest.payloadFiles){
    const name=path.basename(item.location),source=path.join(stage,item.location),target=path.join(dir,name);
    fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
    if(hash(target)!==item.sha256||fs.statSync(target).size!==item.bytes)throw Error('New H release artifact differs: '+name);
  }
  if(JSON.stringify(fs.readdirSync(dir).sort())!==JSON.stringify([...seven].sort()))throw Error('Unexpected files in 0.4.15 H release.');
  for(const item of manifest.launcherFiles){
    const name=path.basename(item.location),target=path.join(H,name);
    fs.copyFileSync(path.join(stage,item.location),target);
    if(hash(target)!==item.sha256)throw Error('H launcher copy differs: '+name);
  }
  const newConfig=guardScratch();
  atomic(path.join(H,'config.json'),newConfig);
  if(read(path.join(H,'config.json')).model!==targetModel||read(path.join(H,'config.json')).reasoningEffort!==targetEffort)throw Error('H owner model configuration not verified.');
  if(configNonModelHash(read(path.join(H,'config.json')))!==manifest.nonModelConfigHash)throw Error('Non-model owner configuration drifted during H cutover.');
  atomic(path.join(H,'active.json'),{...manifest.previous,version:targetVersion,release,installedAt:new Date().toISOString()});
  if(!inside(path.join(H,'releases'),path.join(H,read(path.join(H,'active.json')).release)).toLowerCase().startsWith(path.join(H,'releases').toLowerCase()))throw Error('New release pointer escapes H.');
  verifyCopiedCredential();verifyPrivateH();
  return {release,bytesCopied:inventory.totalBytes,filesCopied:inventory.files.filter(f=>!f.skip).length,locksExcluded:inventory.ignoredLiveLocks.length};
}
function taskCommand(command){ps(command+'-ScheduledTask -TaskName '+psQuote(taskName)+' -ErrorAction Stop|Out-Null');}
function taskSwitch(root){
  const expected=root===F?manifest.originalTask: {workingDirectory:H,arguments:'//B //NoLogo "'+path.join(H,'run-hidden.vbs')+'"'};
  const action='New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot "System32\\wscript.exe") -Argument '+
    psQuote(expected.arguments)+' -WorkingDirectory '+psQuote(expected.workingDirectory);
  ps('$a='+action+';Set-ScheduledTask -TaskName '+psQuote(taskName)+' -Action $a -ErrorAction Stop|Out-Null');
  expectTask(root);
}
function stopOwned(root){
  const scriptPath=path.join(root,'stop.ps1');
  if(!fs.existsSync(scriptPath))throw Error('Guarded stop script missing from '+root);
  const parameters=root===H?['-InstallRoot',root]:[];
  execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',scriptPath,...parameters],{windowsHide:true,timeout:45000,stdio:'pipe'});
  const lock=path.join(root,'data','relay.lock');
  if(fs.existsSync(lock)&&alive(read(lock).pid))throw Error('Owned relay PID still alive; preserve the sealed fence.');
}
async function health(root,version,after){
  if(root===H&&!targetWatch&&fs.existsSync(path.join(H,'data')))targetWatch=fs.watch(path.join(H,'data'),wake);
  return observeUntil(()=>{
    if(root===H)ensureFRelayStopped();
    let status;
    try{status=read(path.join(root,'data','status.json'));}catch{return false;}
    const host=observedHost;
    if(!host||observedJobs===undefined)return false;
    return observedJobs===0&&host.version===version&&host.at>=after&&Date.now()-host.at<60000&&host.dispatchReady===true&&host.authMode==='chatgpt'&&
      status.version===version&&status.state==='online'&&status.listenerConnected===true&&Date.parse(status.at)>=after&&Date.now()-Date.parse(status.at)<60000&&
      (root===F||host.model===targetModel&&host.reasoning_effort===targetEffort);
  },Date.now()+manifest.healthTimeoutMs,'Fresh same-owner local/hosted listener and model heartbeat not observed.');
}
async function restoreF(){
  const current=taskState();
  if(equal(current.workingDirectory,H)){
    expectTask(H,current);
    taskCommand('Disable');
    stopOwned(H);
  }else if(equal(current.workingDirectory,F)){
    expectTask(F,current);taskCommand('Disable');
    const hLock=path.join(H,'data','relay.lock');
    if(fs.existsSync(hLock)&&alive(read(hLock).pid))throw Error('Unknown H relay is alive outside the owner task; preserve the sealed fence.');
  }
  else throw Error('Task points at an unrelated root; do not overwrite it.');
  taskSwitch(F);
  if(hash(path.join(F,'active.json'))!==manifest.previousPointerHash)throw Error('F original pointer changed; rollback requires owner inspection.');
  verifyOriginalRelease();
  reconcileRotatedCredential();
  const started=Date.now();
  taskCommand('Enable');taskCommand('Start');
  await health(F,manifest.previous.version,started);
  return started;
}
if(!['execute','recover'].includes(action))throw Error('Use --action stage/detach/status/execute/recover.');
if(arg('--manifest-sha256')!==pin)throw Error('External executor/recovery requires the exact pinned manifest SHA-256.');
externalOnly();
if(identity()!==manifest.ownerSid)throw Error('External Windows owner SID changed.');
function acquireAttempt(){
  if(action==='execute'){
    fs.closeSync(fs.openSync(path.join(stage,'execute.attempt'),'wx'));
    return randomUUID();
  }
  const file=path.join(stage,'recover.attempt'),nonce=randomUUID();
  const marker={schemaVersion:1,id:manifest.id,manifestSHA256:pin,ownerSid:manifest.ownerSid,
    action:'recover',pid:process.pid,nonce,at:Date.now()};
  try{fs.writeFileSync(file,JSON.stringify(marker)+'\n',{flag:'wx'});return nonce;}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    const prior=read(file);
    if(prior.id!==manifest.id||prior.manifestSHA256!==pin||prior.ownerSid!==manifest.ownerSid||
       prior.action!=='recover'||!Number.isInteger(prior.pid)||!/^[a-f0-9-]{36}$/.test(prior.nonce||''))
      throw Error('Prior recovery marker cannot be attributed to this owner/manifest; preserve it for inspection.');
    if(alive(prior.pid))throw Error('Prior owner recovery process is still alive or its PID has been reused. Do not run another executor.');
    const archives=fs.readdirSync(stage).filter(name=>name.startsWith('recover.attempt.archived-'));
    if(archives.length>=5)throw Error('Recovery retry limit reached. Inspect prior receipts and sealed gate before further attempts.');
    const archived=path.join(stage,'recover.attempt.archived-'+prior.nonce);
    // NTFS hard-link creation with EXCL destination serializes the stale-lock
    // takeover: competing recovery agents cannot both archive the same marker.
    fs.linkSync(file,archived);
    if(JSON.stringify(read(archived))!==JSON.stringify(prior))throw Error('Recovery marker changed during archival.');
    fs.unlinkSync(file); // Only the proven-dead prior owner's exact marker link.
    fs.writeFileSync(file,JSON.stringify(marker)+'\n',{flag:'wx'});
    return nonce;
  }
}
if(action==='recover'){
  if(fs.existsSync(path.join(stage,'execute.attempt'))&&!fs.existsSync(reportFile))
    throw Error('Executor attempt exists without owner receipt; inspect the process before recovery.');
  if(fs.existsSync(reportFile)){
    const previous=read(reportFile);
    if(previous.id!==manifest.id||previous.manifestSHA256!==pin)throw Error('Existing cutover receipt belongs to another manifest.');
    if(alive(previous.pid))throw Error('A previous owner cutover/recovery executor is still alive or its PID was reused.');
  }
}
const attemptNonce=acquireAttempt();
let sealed=action==='recover';
const report={kind:'f-to-h-bridge-cutover',id:manifest.id,sourceRoot:F,targetRoot:H,sourceVersion:manifest.previous.version,
  targetVersion,model:targetModel,reasoningEffort:targetEffort,manifestSHA256:pin,ownerSid:manifest.ownerSid,
  sourceCommit:manifest.sourceCommit,externalProcessVerified:true,pid:process.pid,startedAt:Date.now(),
  outcome:action==='execute'?'waiting-for-drain':'recovery-required',activated:false,scheduledTaskReused:true,
  fRetained:true,sourceFilesDeleted:0};
if(action==='recover'&&fs.existsSync(reportFile))
  fs.copyFileSync(reportFile,path.join(stage,'result-before-recover-'+attemptNonce+'.json'),fs.constants.COPYFILE_EXCL);
atomic(reportFile,report);
subscribe();
try{
  try{
    if(action==='execute'){
      await verifyCatalog(modelRuntime());
      await observeUntil(()=>{
        if(!observedHost||observedJobs===undefined)return false;
        if(observedHost.maintenance?.id!==manifest.id||observedHost.maintenance?.phase!=='draining')throw Error('Maintenance drain was lost or replaced.');
        const nativeFenced=Array.isArray(observedHost.reservations)&&observedHost.reservations.some(slot=>slot?.nativeWriterFence===true||slot?.status==='unresolved_native_writer');
        return observedJobs===0&&!nativeFenced&&localIdle();
      },manifest.deadline,'Native work did not drain before the deadline; no task was stopped.');
      reserveFRollback();
      await control.seal(owner,req);sealed=true;
      await control.guard(owner,req);
      if(!localIdle())throw Error('Protected writer/process reappeared at sealed cutover.');
      verifyStage();expectTask(F);
      // Scheduler triggers are disabled only while the hosted admission gate
      // is sealed, and only after the exact owned scheduled action is pinned.
      taskCommand('Disable');stopOwned(F);
      if(!localIdle())throw Error('Local claims or writers remain after guarded F stop.');
      verifyStage();guardChrome();
      const inventory=sourceInventory();
      atomic(path.join(stage,'copy-inventory.json'),inventory);
      preserveOriginalCredential(inventory);
      report.sourceFiles=inventory.files.length;report.sourceBytes=inventory.totalBytes;
      report.excludedRepository=inventory.excludedRepository;
      report.phase='copying';atomic(reportFile,report);
      copyToH(inventory);
      const installed=installNewHRelease(inventory);
      report.installed=installed;report.phase='switching';atomic(reportFile,report);
      await control.guard(owner,req);
      expectTask(F);taskSwitch(H);
      const switchedAt=Date.now();report.switchedAt=switchedAt;
      taskCommand('Enable');taskCommand('Start');
      await health(H,targetVersion,switchedAt);
      ensureFRelayStopped();
      guardScratch();
      if(!localIdle())throw Error('The preserved F task state changed during H verification.');
      const outcome=await control.finish(owner,req,targetVersion,switchedAt,reportFile);
      Object.assign(report,outcome,{activated:true,modelVerified:targetModel,reasoningEffortVerified:targetEffort,
        phase:'completed',sourceFilesDeleted:0,fRetained:true,hostListenerVerified:true});
      atomic(reportFile,report);
    }else{
      const state=await control.status(owner);
      if(!state.maintenance){
        if(state.lastMaintenance?.id!==manifest.id)throw Error('Cutover fence is absent or belongs to another operation.');
        Object.assign(report,state.lastMaintenance,{phase:'previously-finished',activated:state.lastMaintenance.outcome==='activated-verified'});
      }else if(state.maintenance.id!==manifest.id)throw Error('Another owner maintenance operation owns the gate.');
      else if(state.maintenance.phase==='draining'){
        Object.assign(report,await control.abort(owner,req),{phase:'aborted-before-stop'});
      }else{
        await control.recovery(owner,req);
        await control.guard(owner,req);
        const restarted=await restoreF();
        Object.assign(report,await control.finish(owner,req,manifest.previous.version,restarted,reportFile),
          {phase:'rolled-back',rollbackVerified:true,activated:false,fRetained:true,sourceFilesDeleted:0});
      }
      atomic(reportFile,report);
    }
  }catch(error){
    report.error=error.message;report.activated=false;
    const state=await control.status(owner);
    if(!state.maintenance){
      if(state.lastMaintenance?.id!==manifest.id)throw Error('Maintenance fence changed unexpectedly: '+error.message);
      Object.assign(report,state.lastMaintenance,{phase:'previously-finished'});
    }else if(state.maintenance.id!==manifest.id)throw Error('Foreign maintenance owns the fence: '+error.message);
    else if(state.maintenance.phase==='draining'&&!sealed){
      Object.assign(report,await control.abort(owner,req),{phase:'aborted-before-stop'});
    }else{
      try{
        await control.recovery(owner,req);
        await control.guard(owner,req);
        const restarted=await restoreF();
        Object.assign(report,await control.finish(owner,req,manifest.previous.version,restarted,reportFile),
          {phase:'rolled-back',rollbackVerified:true,activated:false,fRetained:true,sourceFilesDeleted:0});
      }catch(recoveryError){
        report.outcome='recovery-required';report.phase='sealed-owner-recovery';report.recoveryError=recoveryError.message;
        // Preserve both roots, all hashes/receipts and the sealed admission
        // fence. Never clear it, delete an active lock or restart another relay.
      }
    }
    atomic(reportFile,report);
  }
  report.finishedAt=Date.now();
  atomic(reportFile,report);
  console.log(JSON.stringify(report));
  if(!['activated-verified','rolled-back-verified','aborted-before-install'].includes(report.outcome))process.exitCode=1;
}finally{
  stopHost?.();stopJobs?.();dataWatch?.close();taskWatch?.close();targetWatch?.close();
  await db.terminate();await deleteApp(app);
}
