import {readFile,writeFile} from 'node:fs/promises';
const url='https://pti-app-2ab59-personal.web.app/runtime-status.json';
const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});
let publish=false;
if(response.status===404)publish=true;
else if(response.ok){const status=await response.json();publish=status.cloudReady===false;}
else throw new Error(`Cannot safely determine existing site status (${response.status}); preview was not published.`);
if(!publish){console.log('Existing cloud-enabled site retained.');process.exit(0);}
const config=JSON.parse(await readFile('firebase.personal.json','utf8'));
config.hosting.rewrites=[{source:'**',destination:'/index.html'}];
await writeFile('firebase.personal-preview.json',JSON.stringify({hosting:config.hosting},null,2));
await writeFile('.personal-dist/runtime-status.json',JSON.stringify({cloudReady:false,reason:'Isolated Firestore database activation is pending.'}));
console.log('Prepared static-only preview; no API rewrites, sign-in or private storage enabled.');
