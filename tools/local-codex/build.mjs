import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import {artifactDirectory,ensureArtifactLink,storageEnvironment} from './src/storage.mjs';
Object.assign(process.env,storageEnvironment());
if(process.platform==='win32'){
  ensureArtifactLink(path.resolve('dist'),artifactDirectory('Builds','PTI','local-codex',process.env.LOCAL_CODEX_BUILD_SLOT || 'dist'));
}
const built=await build({entryPoints:['src/server.mjs','src/worker.mjs','src/relay.mjs','src/setup.mjs','src/pair-existing.mjs','src/review-usage.mjs'],outdir:'dist',bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},target:'node20',metafile:true,banner:{js:"import {createRequire as __createRequire} from 'node:module'; const require=__createRequire(import.meta.url);"}});
const directories=new Set(Object.keys(built.metafile.inputs).map(file=>file.replaceAll('\\','/').match(/^((?:.*\/)?node_modules\/(?:@[^/]+\/)?[^/]+)(?:\/|$)/)?.[1]).filter(Boolean));
const packages=new Map();
for(const directory of directories){
  const metadata=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));
  packages.set(`${metadata.name}@${metadata.version}`,{directory,metadata});
}
if(!packages.size)throw Error('Bundled dependency attribution was empty; release notices cannot be omitted.');
const notices=[];for(const [, {directory,metadata}] of [...packages].sort(([a],[b])=>a.localeCompare(b))){
  const name=metadata.name;
  const license=fs.readdirSync(directory).find(f=>/^licen[sc]e(\.|$)/i.test(f));
  // Firebase npm subpackages omit LICENSE. Retain the exact upstream 11.10.0
  // Apache license alongside their bundled copyright/NOTICE comments.
  const file=license?path.join(directory,license):(name==='firebase'||name.startsWith('@firebase/'))&&metadata.license==='Apache-2.0'?'licenses/firebase-Apache-2.0.txt':null;
  if(!file)throw Error(`Missing license: ${name}`);
  notices.push(`${name} ${metadata.version} (${metadata.license})\n\n${fs.readFileSync(file,'utf8')}`);
}
fs.writeFileSync('dist/THIRD-PARTY-NOTICES.txt',notices.join('\n\n---\n\n'));
console.log(`Built local Codex runtime with ${packages.size} bundled dependency notices.`);
