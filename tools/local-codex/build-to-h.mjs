// Build the seven-file worker to owner-private H: storage with zero F: output.
// Run only after local-codex-storage-migration.mjs --action prepare-h.
import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

if(process.platform!=='win32')throw Error('Owner Windows PC required.');
const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
const source=path.dirname(fileURLToPath(import.meta.url)),H='H:\\LocalCodexBridge';
const desired=path.resolve(arg('--directory'));
const allowed=(path.join(H,'maintenance')+path.sep).toLowerCase();
if(!desired.toLowerCase().startsWith(allowed)||fs.existsSync(desired))throw Error('Use a new, unused output directory under the H: bridge maintenance root.');
let parent=path.dirname(desired);
while(!fs.existsSync(parent)){const next=path.dirname(parent);if(next===parent)throw Error('H build has no existing physical parent.');parent=next;}
const physical=path.resolve(fs.realpathSync.native(parent),path.relative(parent,desired));
if(physical.toLowerCase()!==desired.toLowerCase())throw Error('H build path is reparse-point redirected.');
if(!fs.realpathSync.native(source).toLowerCase().startsWith('f:\\'))throw Error('Worker source must remain a physical F: code checkout.');
if(fs.realpathSync.native(H).toLowerCase()!==H.toLowerCase())throw Error('H bridge storage is redirected.');
const ps=code=>execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',"$ErrorActionPreference='Stop';"+code],{encoding:'utf8',windowsHide:true,timeout:30000}).trim();
const checked=ps('$a=Get-Acl -LiteralPath "H:\\LocalCodexBridge";$u=[Security.Principal.WindowsIdentity]::GetCurrent().User;'+
  'if(-not $a.AreAccessRulesProtected -or $a.Owner -notin @($u.Value,$u.Translate([Security.Principal.NTAccount]).Value)){throw "H storage ACL not owned/private"};'+
  'foreach($r in $a.Access){if($r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($u.Value,"S-1-5-18") -or $r.AccessControlType -ne "Allow"){throw "Unexpected H storage ACL"}};"private"');
if(checked!=='private')throw Error('H storage directory was not verified private.');
const version=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8')).version;
if(version!=='0.4.15')throw Error('The approved dual-drive 0.4.15 source must be built for H.');
fs.mkdirSync(desired,{recursive:true});
const built=await build({absWorkingDir:source,
  entryPoints:['src/server.mjs','src/worker.mjs','src/relay.mjs','src/setup.mjs','src/pair-existing.mjs','src/review-usage.mjs'],
  outdir:desired,bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},
  target:'node20',metafile:true,
  banner:{js:"import {createRequire as __createRequire} from 'node:module'; const require=__createRequire(import.meta.url);"}});
const packages=new Set(Object.keys(built.metafile.inputs).map(file=>file.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1]).filter(Boolean));
const notices=[];
for(const name of [...packages].sort()){
  const directory=path.join(source,'node_modules',name);
  const metadata=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));
  const license=fs.readdirSync(directory).find(file=>/^licen[sc]e(\.|$)/i.test(file));
  const licenseFile=license?path.join(directory,license):
    (name==='firebase'||name.startsWith('@firebase/'))&&metadata.license==='Apache-2.0'
      ?path.join(source,'licenses/firebase-Apache-2.0.txt'):null;
  if(!licenseFile)throw Error('Missing third-party license for '+name);
  notices.push(name+' '+metadata.version+' ('+metadata.license+')\n\n'+fs.readFileSync(licenseFile,'utf8'));
}
fs.writeFileSync(path.join(desired,'THIRD-PARTY-NOTICES.txt'),notices.join('\n\n---\n\n'),{flag:'wx'});
const seven=['pair-existing.mjs','relay.mjs','review-usage.mjs','server.mjs','setup.mjs','THIRD-PARTY-NOTICES.txt','worker.mjs'];
if(JSON.stringify(fs.readdirSync(desired).sort())!==JSON.stringify([...seven].sort()))throw Error('Unexpected H release payload files.');
const files=seven.map(name=>({name,bytes:fs.statSync(path.join(desired,name)).size,
  sha256:createHash('sha256').update(fs.readFileSync(path.join(desired,name))).digest('hex')}));
console.log(JSON.stringify({built:true,version,output:desired,files,fSourceChanged:false,chromeProviderBuilt:false}));
