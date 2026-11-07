import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const releaseFiles=['pair-existing.mjs','relay.mjs','review-usage.mjs','server.mjs','setup.mjs','THIRD-PARTY-NOTICES.txt','worker.mjs'];
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifyRelease(directory,artifacts){
  if(JSON.stringify(artifacts.map(a=>a.name).sort())!==JSON.stringify([...releaseFiles].sort()))throw Error('Exactly the seven release files are required.');
  for(const item of artifacts){const file=path.join(directory,item.name),stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==item.bytes||sha256(fs.readFileSync(file))!==item.sha256)throw Error(`Release hash/size/type mismatch: ${item.name}`);}
  const names=fs.readdirSync(directory);if(names.length!==7||names.some(n=>!releaseFiles.includes(n)))throw Error('Unexpected release payload file.');
  return 7;
}
export function recoveryAction(state,id){
  if(!state.maintenance){if(state.lastMaintenance?.id===id)return 'already-released';throw Error('Maintenance gate disappeared; refuse to stop any process.');}
  if(state.maintenance.id!==id)throw Error('Another maintenance operation owns the gate.');
  return state.maintenance.phase==='draining'?'abort-without-install':'rollback-under-sealed-gate';
}
