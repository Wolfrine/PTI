import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,relative} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
const origin=process.argv[2];
if(!origin||new URL(origin).protocol!=='https:')throw Error('Pass the HTTPS wedding origin.');
const root='wedding-planner/dist',files=[];
async function walk(path){for(const e of await readdir(path,{withFileTypes:true})){const p=join(path,e.name);if(e.isDirectory())await walk(p);else files.push(p);}}
await walk(root);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const file of files){
  const name=relative(root,file).replaceAll('\\','/'),expected=digest(await readFile(file));let matched=false;
  for(let i=0;i<18;i++){
    const response=await fetch(`${origin}/${name}?release=${process.env.GITHUB_SHA||expected.slice(0,12)}&attempt=${i}`,{cache:'no-store',signal:AbortSignal.timeout(20000)});
    if(response.ok&&digest(new Uint8Array(await response.arrayBuffer()))===expected){matched=true;break;}
    await pause(3000);
  }
  if(!matched)throw Error(`Hosted asset does not match reviewed build: ${name}`);
}
for(const path of ['/WEDDING_RECORD.md','/research/DOMAIN_GUIDE.md','/src/demo.ts','/design/exploration.html','/scripts/seed-record.mjs']){
  const response=await fetch(origin+path,{signal:AbortSignal.timeout(20000)});
  if(response.status!==404)throw Error(`Private/development source unexpectedly served: ${path}`);
}
const report=JSON.parse(await readFile('wedding-activation-report.json','utf8'));report.hostingVerifiedAt=new Date().toISOString();report.commit=process.env.GITHUB_SHA||null;report.url=origin;report.verifiedAssetCount=files.length;
await writeFile('wedding-activation-report.json',JSON.stringify(report,null,2));
console.log(`PASS ${files.length} hosted assets match the reviewed build; source boundary returns 404.`);
