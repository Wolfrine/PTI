// Design evidence helper; this is not application or deployment code.
// Usage: node docs/one-piece/design/fingerprint.mjs <built-one-piece-directory>
// The JSON `binding` is canonical compact UTF-8 with sorted POSIX asset paths.
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const artifact=path.resolve(process.argv[2]??'');
if(!process.argv[2])throw new Error('Pass the exact built one-piece directory');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function files(directory,prefix=''){
 const result=[];
 for(const item of await readdir(directory,{withFileTypes:true})){
  const relative=prefix+item.name;
  if(item.isDirectory())result.push(...await files(path.join(directory,item.name),relative+'/'));
  else if(item.isFile())result.push({path:relative,sha256:sha(await readFile(path.join(directory,item.name)))});
  else throw new Error('Candidate may not contain links or special files');
 }
 return result.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
const fixturePath=fileURLToPath(new URL('../../../apps/one-piece/web/src/fixture.mjs',import.meta.url));
const reviewObserverPath=fileURLToPath(new URL('../../../apps/one-piece/web/src/review-frames.mjs',import.meta.url));
const binding={schema:1,productionAssets:await files(artifact),fixture:{path:'apps/one-piece/web/src/fixture.mjs',sha256:sha(await readFile(fixturePath))},reviewObserver:{path:'apps/one-piece/web/src/review-frames.mjs',sha256:sha(await readFile(reviewObserverPath))}};
console.log(JSON.stringify({candidate:sha(JSON.stringify(binding)),binding},null,2));
