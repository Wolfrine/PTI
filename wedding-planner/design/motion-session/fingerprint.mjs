import {createHash} from 'node:crypto';
import {readdir,readFile,writeFile} from 'node:fs/promises';
const files=[];
async function walk(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const path=directory+'/'+entry.name;if(entry.isDirectory())await walk(path);else files.push(path);}}
for(const directory of ['src','public','dist','tests'])await walk(directory);
files.push('index.html','family/index.html','offline.html','vite.config.ts','package.json','package-lock.json','scripts/pwa-build.mjs','scripts/pwa-build.d.mts','scripts/seed-record.mjs','WEDDING_RECORD.md','design/motion-session/capture-final.mjs','design/motion-session/fingerprint.mjs','../firebase.wedding.json','../.github/workflows/wedding.yml');
const entries=[];for(const path of files.sort())entries.push({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});
const fingerprint=createHash('sha256').update(JSON.stringify(entries)).digest('hex');
await writeFile('design/motion-session/build-fingerprint.json',JSON.stringify({fingerprint,description:'Exact deployable bytes, runtime/content/source, fixture and verification inputs. Separate from prior illustrated-PWA acceptance; no aesthetic or deployment inference.',entries},null,2)+'\n');
console.log(fingerprint);
