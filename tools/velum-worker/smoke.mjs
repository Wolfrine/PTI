// Explicit local engine acceptance check. Never publishes to Firebase or the gallery.
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {infer} from './worker.mjs';
import {imagePayload} from './core.mjs';
import {makeJob} from '../../velum-gallery/studio-contract.mjs';
const id=`smoke-${randomUUID()}`;
const job=makeJob({model:'flux2-klein-fp8',prompt:'A blue ceramic vase on a wooden table, morning light.',seed:30102026,consent:true});
await infer(id,job,progress=>console.log(JSON.stringify({kind:'actual-engine-smoke',...progress})));
const directory=`H:\\AI-ImageGen\\portrait-pilot\\velum-studio\\${id}`;
const bytes=await readFile(`${directory}\\image.png`);
const result=JSON.parse(await readFile(`${directory}\\result.json`,'utf8'));
const payload=imagePayload(bytes);
if(payload.result.sha256!==result.sha256)throw new Error('invalid-output');
console.log(JSON.stringify({kind:'actual-engine-smoke',directory,result:{...payload.result,...result},firebase:false,gallery:false}));
