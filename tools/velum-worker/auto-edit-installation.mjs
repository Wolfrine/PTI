// Explicit, owner-provisioned local readiness gate. Never create or change ACLs
// automatically. The existing worker stays manual-only when this file is absent.
import path from 'node:path';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstat,readFile,readdir,realpath} from 'node:fs/promises';
import {engineProfile} from './engine-profile.mjs';
import {SOURCE_FOLDERS,isHash} from './auto-edit-contract.mjs';
import {AutoEditFault} from './auto-edit-runner.mjs';

const ROOT='H:\\Workspace\\Generated\\Velum\\auto-edit-v1';
const INSTALL=path.join(ROOT,'installation.json');
const VISION='H:\\Workspace\\Runtimes\\PTI\\velum-review-vision';
const LOCK='H:\\AI-ImageGen\\portrait-pilot\\velum-studio\\inference.lock';
const PIN_FILES=['bin/llama-mtmd-cli.exe','models/Qwen3VL-2B-Instruct-Q4_K_M.gguf','models/mmproj-Qwen3VL-2B-Instruct-F16.gguf','models/Qwen3VL-4B-Instruct-Q4_K_M.gguf','models/mmproj-Qwen3VL-4B-Instruct-F16.gguf'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const need=(ok,code)=>{if(!ok)throw new AutoEditFault(code)};
const same=(a,b)=>a.toLowerCase()===b.toLowerCase();
async function exact(file,kind){
 const info=await lstat(file);
 need((kind==='dir'?info.isDirectory():info.isFile())&&!info.isSymbolicLink()&&same(path.resolve(file),await realpath(file)),'auto-edit-installation-path-unsafe');
 return info;
}
async function readConfig(){
 const info=await exact(INSTALL,'file');need(info.size>0&&info.size<=32768,'auto-edit-installation-invalid');
 return readFile(INSTALL);
}
async function acl(checks,signal){
 const encoded=Buffer.from(JSON.stringify(checks),'utf8').toString('base64');
 // Values are encoded JSON, never interpolated as executable PowerShell.
 const script=[
 '$ErrorActionPreference="Stop"',
 '$data=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("'+encoded+'"))|ConvertFrom-Json',
 '$identity=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value',
 '$trusted=@($identity,"S-1-5-18","S-1-5-32-544")',
 '$sidType=[Security.Principal.SecurityIdentifier]',
 '$integrity=2+4+16+64+256+65536+262144+524288',
 '$parent=64+65536+262144+524288',
 'foreach($c in $data){',
 '  $a=Get-Acl -LiteralPath $c.path',
 '  if($trusted -notcontains $a.GetOwner($sidType).Value){throw "owner"}',
 '  foreach($ace in $a.GetAccessRules($true,$true,$sidType)){',
 '    if($ace.AccessControlType -ne "Allow" -or $trusted -contains $ace.IdentityReference.Value){continue}',
 '    $rights=[int64]$ace.FileSystemRights',
 '    if($c.mode -eq "private" -or ($c.mode -eq "integrity" -and ($rights -band $integrity)) -or ($c.mode -eq "parent" -and ($rights -band $parent))){throw "access"}',
 '  }',
 '}',
 'Write-Output "OK"'
 ].join('\n');
 const arg=Buffer.from(script,'utf16le').toString('base64');
 const stdout=await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',arg],{windowsHide:true,shell:false,encoding:'utf8',timeout:20000,maxBuffer:8192,signal},(error,out)=>error?reject(new AutoEditFault(signal?.aborted?'execution-interrupted':'auto-edit-runtime-permissions-unverified')):resolve(out)));
 need(stdout.trim()==='OK','auto-edit-runtime-permissions-unverified');
}
function validatedFolder(value){
 need(typeof value==='string'&&path.isAbsolute(value)&&path.parse(value).root.toLowerCase()==='j:\\'&&path.resolve(value)===value,'drive-folder-mapping-required');
 return value;
}
async function visionChecks(){
 const result=[{path:path.dirname(VISION),mode:'parent'},{path:VISION,mode:'integrity'},{path:path.join(VISION,'bin'),mode:'integrity'},{path:path.join(VISION,'models'),mode:'integrity'}];
 for(const item of result)await exact(item.path,'dir');
 for(const name of PIN_FILES){
  const file=path.join(VISION,name);await exact(file,'file');result.push({path:file,mode:'integrity'});
 }
 const bin=path.join(VISION,'bin');
 for(const file of await readdir(bin)){
  if(!file.toLowerCase().endsWith('.dll'))continue;
  const resolved=path.join(bin,file);await exact(resolved,'file');result.push({path:resolved,mode:'integrity'});
 }
 await exact(LOCK,'file');result.push({path:LOCK,mode:'integrity'},{path:path.dirname(LOCK),mode:'parent'});
 return result;
}
export async function loadAutoEditInstallation(){
 need(process.platform==='win32','windows-required');
 try{await lstat(INSTALL);}catch(error){if(error.code==='ENOENT')return null;throw error;}
 await exact(ROOT,'dir');await exact(INSTALL,'file');
 const baseChecks=[{path:path.dirname(ROOT),mode:'parent'},{path:ROOT,mode:'private'},{path:INSTALL,mode:'private'}];
 await acl(baseChecks);
 const bytes=await readConfig(),fingerprint=hash(bytes);
 let config;
 try{config=JSON.parse(bytes.toString('utf8'));}catch{throw new AutoEditFault('auto-edit-installation-invalid');}
 need(config?.version===1&&typeof config.enabled==='boolean','auto-edit-installation-invalid');
 if(!config.enabled)return null;
 need(config.visionPins&&PIN_FILES.every(name=>isHash(config.visionPins[name])),'vision-pins-required');
 const pins=Object.fromEntries(PIN_FILES.map(name=>[name,config.visionPins[name]]));
 const folders={
  [SOURCE_FOLDERS.private]:validatedFolder(config.folders?.[SOURCE_FOLDERS.private]),
  [SOURCE_FOLDERS.references]:validatedFolder(config.folders?.[SOURCE_FOLDERS.references])
 };
 const stagingRoot=validatedFolder(config.stagingRoot);
 const privateRoot=folders[SOURCE_FOLDERS.private],referenceRoot=folders[SOURCE_FOLDERS.references];
 need(path.basename(privateRoot)==='Private'&&path.basename(referenceRoot)==='References'&&path.basename(stagingRoot)==='Review staging'&&same(path.dirname(referenceRoot),privateRoot)&&same(path.dirname(stagingRoot),privateRoot),'drive-folder-mapping-mismatch');
 for(const dir of [privateRoot,referenceRoot,stagingRoot])await exact(dir,'dir');
 await acl([...baseChecks,...await visionChecks()]);
 async function assertWorkspaceReady({signal}={}){
  need(!signal?.aborted,'execution-interrupted');
  await exact(ROOT,'dir');await acl(baseChecks,signal);
  need(hash(await readConfig())===fingerprint,'auto-edit-installation-changed');
 }
 async function assertRuntimeReady({stage,model,signal}){
  await assertWorkspaceReady({signal});
  if(stage==='vision1'||stage==='vision2')await acl(await visionChecks(),signal);
  else if(stage==='edit'){
   const output=engineProfile(model).outputRoot;
   await exact(output,'dir');
   // Existing engine path is reused only if private; never alter its ACL.
   await acl([{path:path.dirname(output),mode:'parent'},{path:output,mode:'private'}],signal);
  }else throw new AutoEditFault('invalid-runtime-stage');
 }
 return {pins,folders,stagingRoot,assertWorkspaceReady,assertRuntimeReady};
}
