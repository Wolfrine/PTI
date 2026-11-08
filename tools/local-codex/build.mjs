import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const built=await build({entryPoints:['src/server.mjs','src/worker.mjs','src/relay.mjs','src/setup.mjs','src/pair-existing.mjs','src/review-usage.mjs'],outdir:'dist',bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},target:'node20',metafile:true,banner:{js:"import {createRequire as __createRequire} from 'node:module'; const require=__createRequire(import.meta.url);"}});
const packages=new Set(Object.keys(built.metafile.inputs).map(f=>f.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1]).filter(Boolean));
const notices=[];for(const name of [...packages].sort()){
  const directory=path.join('node_modules',name),metadata=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));
  const license=fs.readdirSync(directory).find(f=>/^licen[sc]e(\.|$)/i.test(f));
  // Firebase npm subpackages omit LICENSE. Retain the exact upstream 11.10.0
  // Apache license alongside their bundled copyright/NOTICE comments.
  const file=license?path.join(directory,license):(name==='firebase'||name.startsWith('@firebase/'))&&metadata.license==='Apache-2.0'?'licenses/firebase-Apache-2.0.txt':null;
  if(!file)throw Error(`Missing license: ${name}`);
  notices.push(`${name} ${metadata.version} (${metadata.license})\n\n${fs.readFileSync(file,'utf8')}`);
}
fs.writeFileSync('dist/THIRD-PARTY-NOTICES.txt',notices.join('\n\n---\n\n'));
await build({entryPoints:['chrome/native-host.mjs','chrome/mcp.mjs'],outdir:'chrome/dist',outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',target:'node20',banner:{js:"import {createRequire as __createRequire} from 'node:module'; const require=__createRequire(import.meta.url);"}});
console.log('Built local Codex runtime.');
