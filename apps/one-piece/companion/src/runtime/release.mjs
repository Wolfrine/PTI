import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,lstat,readdir,copyFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {WindowsProtection} from '../dpapi.mjs';
import {atomicJson} from '../progress.mjs';
import {loadRuntimeConfig,validateRuntimeConfig} from './config.mjs';
import {PINNED_NODE_PATH,PINNED_NODE_SHA256} from './node-runtime.mjs';
const execute=promisify(execFile),PREFIX='apps/one-piece/companion',CATALOG='docs/one-piece/evidence/sources/catalog.json';
const selected=relative=>relative===`${PREFIX}/package.json`||relative===CATALOG||relative.startsWith(`${PREFIX}/src/`)||relative.startsWith(`${PREFIX}/scripts/`);
export const gitBlobHash=bytes=>createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
export function parseReleaseTree(text){return text.split('\0').filter(Boolean).map(record=>{
 const match=/^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(record);if(!match||!selected(match[3])||match[3].split('/').includes('..')||match[3].includes('\\'))throw new Error('release-tree');
 return{blob:match[2],relative:match[3]};
});}
export function releasePath(commit){if(!/^[a-f0-9]{40}$/.test(commit??''))throw new Error('release-commit');return path.win32.join('H:/PTI-OnePiece/releases',commit);}
const STOP_INSPECTION=String.raw`
$ErrorActionPreference='Stop'
try{
 $config=Get-Content -LiteralPath 'H:\PTI-OnePiece\runtime\private\config.json' -Raw|ConvertFrom-Json
 $state=if(Test-Path -LiteralPath $config.statePath){Get-Content -LiteralPath $config.statePath -Raw|ConvertFrom-Json}else{$null}
 $all=@(Get-CimInstance Win32_Process)
 $launcher=(Join-Path $config.runtimeRoot 'launch-current.mjs').Replace('/','\')
 $supervisor=(Join-Path $config.repositoryRoot 'apps\one-piece\companion\src\runtime\supervisor.mjs').Replace('/','\')
 $recorded=@();if($state){$recorded+=([int]$state.supervisorPid);foreach($entry in $state.processes.PSObject.Properties){if([int]$entry.Value.pid -gt 0){$recorded+=([int]$entry.Value.pid)}}}
 $tasks=@(Get-ScheduledTask -TaskPath '\' -ErrorAction Stop|Where-Object {$_.TaskName -eq 'PTI-OnePiece-Companion'});if($tasks.Count -gt 1){throw 'task-identity'};$task=if($tasks.Count){$tasks[0]}else{$null}
 $listeners=@(Get-NetTCPConnection -State Listen -ErrorAction Stop|Where-Object {($_.LocalAddress -in @('127.0.0.1','0.0.0.0','::') -and $_.LocalPort -in @(18097,18098)) -or ($_.LocalAddress -in @('192.168.68.105','0.0.0.0','::') -and $_.LocalPort -in @(8443,18099))})
 [ordered]@{launcherCount=@($all|Where-Object {([string]$_.CommandLine).Replace('/','\').IndexOf($launcher,[StringComparison]::OrdinalIgnoreCase) -ge 0}).Count;supervisorCount=@($all|Where-Object {([string]$_.CommandLine).Replace('/','\').IndexOf($supervisor,[StringComparison]::OrdinalIgnoreCase) -ge 0}).Count;recordedProcessCount=@($all|Where-Object {[int]$_.ProcessId -in $recorded}).Count;listeningPortCount=$listeners.Count;taskState=if($task){[string]$task.State}else{'Absent'}}|ConvertTo-Json -Compress
}catch{[Console]::Error.Write('runtime-stop-inspection-failed');exit 1}
`;
export function assertStoppedInspection({proof,configSha256,inspection,now=Date.now()}={}){
 const when=Date.parse(proof?.recordedAt);
 if(proof?.stopped!==true||proof.launcherAbsent!==true||proof.supervisorAbsent!==true||proof.recordedChildrenAbsent!==true||proof.portsClosed!==true
  ||!Number.isFinite(when)||when>now||now-when>300000||proof.configSha256!==configSha256
  ||!['Ready','Disabled','Absent'].includes(proof.taskState)||!['Ready','Disabled','Absent'].includes(inspection?.taskState)
  ||['launcherCount','supervisorCount','recordedProcessCount','listeningPortCount'].some(key=>inspection?.[key]!==0))throw new Error('stop-runtime-before-activation');
 return true;
}
async function stopped(config){
 if(process.platform!=='win32'||path.win32.normalize(config.configPath)!=='H:\\PTI-OnePiece\\runtime\\private\\config.json')throw new Error('stop-runtime-before-activation');
 try{
  const proofPath=path.join(config.privateRoot,'stop-proof.json'),info=await lstat(proofPath);
  if(!info.isFile()||info.isSymbolicLink()||info.size>8192)throw new Error();
  const proof=JSON.parse((await readFile(proofPath,'utf8')).replace(/^\uFEFF/,''));
  const configSha256=createHash('sha256').update(await readFile(config.configPath)).digest('hex');
  const inspected=await execute(path.win32.join(process.env.SystemRoot??'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(STOP_INSPECTION,'utf16le').toString('base64')],{windowsHide:true,timeout:15000,maxBuffer:16384});
  assertStoppedInspection({proof,configSha256,inspection:JSON.parse(inspected.stdout.replace(/^\uFEFF/,''))});
 }catch{throw new Error('stop-runtime-before-activation');}
}
async function digest(file){return createHash('sha256').update(await readFile(file)).digest('hex');}
export async function verifyRelease(commit){
 const destination=releasePath(commit),manifest=JSON.parse(await readFile(path.join(destination,'release-manifest.json'),'utf8'));
 if(manifest.version!==1||manifest.commit!==commit||path.win32.normalize(manifest.releaseRoot)!==destination||!Array.isArray(manifest.files)||manifest.files.length>10000)throw new Error('release-manifest');
 const unique=new Set();for(const file of manifest.files){
  const relative=file.path;if(typeof relative!=='string'||relative.includes('\\')||relative.split('/').includes('..')||path.win32.isAbsolute(relative)||(!selected(relative)&&!relative.startsWith(`${PREFIX}/node_modules/jose/`))||unique.has(relative.toLowerCase())||!Number.isSafeInteger(file.bytes)||file.bytes<0||file.bytes>50*1024*1024||!/^[a-f0-9]{64}$/.test(file.sha256))throw new Error('release-manifest-file');
  unique.add(relative.toLowerCase());const target=path.join(destination,relative),stat=await lstat(target);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==file.bytes||await digest(target)!==file.sha256)throw new Error('release-integrity');
 }
 if((await digest(PINNED_NODE_PATH)).toUpperCase()!==PINNED_NODE_SHA256)throw new Error('release-node-hash');return manifest;
}
export async function activateRelease({commit,configPath='H:/PTI-OnePiece/runtime/private/config.json'}={}){
 const manifest=await verifyRelease(commit),config=await loadRuntimeConfig(configPath);await stopped(config);
 const previous={...config};delete previous.configPath;await atomicJson(path.join(config.privateRoot,'previous-runtime-config.json'),previous);
 const destination=releasePath(commit),updated=validateRuntimeConfig({...previous,repositoryRoot:destination,serverEntry:path.join(destination,PREFIX,'src/server.mjs'),catalogPath:path.join(destination,CATALOG),activeRelease:commit});
 await copyFile(path.join(destination,PREFIX,'src/runtime/launcher.mjs'),path.join(config.runtimeRoot,'launch-current.mjs'));await atomicJson(configPath,updated);
 await atomicJson(path.join(config.privateRoot,'release-activation-proof.json'),{recordedAt:new Date().toISOString(),activeRelease:commit,previousRelease:config.activeRelease??null,verifiedFiles:manifest.files.length});return{activated:true,commit,releaseRoot:destination,verifiedFiles:manifest.files.length};
}
export async function packageRelease({repositoryRoot,commit,activate=false,configPath='H:/PTI-OnePiece/runtime/private/config.json'}={}){
 const destination=releasePath(commit),protection=new WindowsProtection();
 const git=async args=>(await execute('git',args,{cwd:repositoryRoot,windowsHide:true,maxBuffer:8*1024*1024})).stdout;
 if((await git(['rev-parse','HEAD'])).trim()!==commit)throw new Error('release-not-current-commit');
 const paths=[`${PREFIX}/src`,`${PREFIX}/scripts`,`${PREFIX}/package.json`,CATALOG];
 if((await git(['status','--porcelain','--',...paths])).trim())throw new Error('release-source-dirty');
 const tree=parseReleaseTree(await git(['ls-tree','-rz','--full-tree',commit,'--',...paths]));
 if(!tree.some(x=>x.relative===CATALOG)||!tree.some(x=>x.relative===`${PREFIX}/src/server.mjs`)||!tree.some(x=>x.relative===`${PREFIX}/src/runtime/launcher.mjs`))throw new Error('release-incomplete');
 const config=await loadRuntimeConfig(configPath);if(activate)await stopped(config);
 await protection.secureDirectory('H:/PTI-OnePiece/releases');
 let exists=false;try{await access(destination);exists=true;}catch{}
 if(exists)throw new Error('release-already-exists-verify-before-reuse');
 await mkdir(destination);await protection.secureDirectory(destination);
 const files=[];let total=0;
 const copy=async(relative,source,expectedBlob,committedBytes)=>{
  const stat=await lstat(source);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>50*1024*1024)throw new Error('release-source-file');
  const bytes=committedBytes??await readFile(source);if(expectedBlob&&gitBlobHash(bytes)!==expectedBlob)throw new Error('release-source-changed');total+=bytes.length;if(total>200*1024*1024||files.length>=10000)throw new Error('release-size');
  const target=path.join(destination,relative);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes,{mode:0o600});files.push({path:relative.replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 };
 for(const entry of tree){const bytes=(await execute('git',['cat-file','blob',entry.blob],{cwd:repositoryRoot,windowsHide:true,encoding:'buffer',maxBuffer:50*1024*1024})).stdout;await copy(entry.relative,path.join(repositoryRoot,entry.relative),entry.blob,bytes);}
 const packageJson=JSON.parse(await readFile(path.join(destination,PREFIX,'package.json'),'utf8'));
 if(Object.keys(packageJson.dependencies??{}).join(',')!=='jose')throw new Error('release-unexpected-dependencies');
 const dependencies='H:/PTI-OnePiece/companion-dependencies/node_modules';
 const jose=JSON.parse(await readFile(path.join(dependencies,'jose/package.json'),'utf8'));if(jose.name!=='jose'||jose.version!==packageJson.dependencies.jose)throw new Error('release-dependency-version');
 async function copyDependency(relative){
  const source=path.join(dependencies,relative),stat=await lstat(source);if(stat.isSymbolicLink())throw new Error('release-dependency-link');
  if(stat.isDirectory())for(const child of await readdir(source))await copyDependency(path.join(relative,child));
  else await copy(path.join(PREFIX,'node_modules',relative),source);
 }
 await copyDependency('jose');
 if((await digest(PINNED_NODE_PATH)).toUpperCase()!==PINNED_NODE_SHA256)throw new Error('release-node-hash');
 const manifest={version:1,commit,createdAt:new Date().toISOString(),releaseRoot:destination,files,totalBytes:total,node:{path:PINNED_NODE_PATH,sha256:PINNED_NODE_SHA256},dependencies:{jose:jose.version},includesPrivateConfiguration:false,includesMedia:false,activated:false};
 await atomicJson(path.join(destination,'release-manifest.json'),manifest);
 if(activate)await activateRelease({commit,configPath});
 return{commit,releaseRoot:destination,fileCount:files.length,totalBytes:total,activated:activate,privateConfigurationCopied:false,mediaCopied:false};
}
