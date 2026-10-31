import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const built=await build({entryPoints:['src/server.mjs','src/worker.mjs','src/relay.mjs','src/setup.mjs','src/pair-existing.mjs','src/review-usage.mjs'],outdir:'dist',bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},target:'node20',metafile:true,banner:{js:"import {createRequire as __createRequire} from 'node:module'; const require=__createRequire(import.meta.url);"}});
const packages=new Set(Object.keys(built.metafile.inputs).map(f=>f.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1]).filter(Boolean));
const notices=[];for(const name of [...packages].sort()){const directory=path.join('node_modules',name),metadata=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8')),license=fs.readdirSync(directory).find(f=>/^licen[sc]e(\.|$)/i.test(f));if(!license)throw Error(`Missing license: ${name}`);notices.push(`${name} ${metadata.version} (${metadata.license})\n\n${fs.readFileSync(path.join(directory,license),'utf8')}`);}
fs.writeFileSync('dist/THIRD-PARTY-NOTICES.txt',notices.join('\n\n---\n\n'));
console.log('Built local Codex runtime.');
