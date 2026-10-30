// Independent, fixed-purpose recovery poller. Never accepts commands or paths from Firestore.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {DeviceStore,restoreDevice,OWNER_UID} from './session.mjs';
import {Queue} from './worker.mjs';
import {decode} from './core.mjs';
import {PC_DEVICE_UID} from '../../velum-gallery/device-config.mjs';
import {attemptRecovery} from './recovery-control.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=`users/${OWNER_UID}/velumStudio/workspace`;
const TASK='PTI Velum Studio Worker';
const powershell=command=>execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,timeout:15000}).trim();
function taskState(){
 // The only process target is the fixed, locally registered Velum Scheduled Task.
 return powershell(`$t=Get-ScheduledTask -TaskName '${TASK}' -ErrorAction SilentlyContinue; if (!$t) {'missing'} elseif ($t.State -eq 'Running') {'running'} elseif ($t.State -eq 'Disabled') {'disabled'} else {'ready'}`);
}
function startWorker(){
 powershell(`Start-ScheduledTask -TaskName '${TASK}' -ErrorAction Stop`);
}
async function main(){
 if(process.platform!=='win32')throw new Error('windows-required');
 if(taskState()!=='ready')return; // Do not contend with a healthy worker or a missing/disabled task.
 const store=new DeviceStore(path.join(HERE,'.runtime','device.dpapi'));
 if(!(await store.load()))return; // Enrollment belongs to the installed worker, never this helper.
 const session=await restoreDevice(store);
 if(session.uid!==PC_DEVICE_UID)throw new Error('device-identity-mismatch');
 const queue=new Queue(session,{store});
 if((await queue.binding())?.status!=='approved')return;
 const relative='controls/worker-start';
 await attemptRecovery({
  read:async()=>{const response=await queue.request(`${ROOT}/${relative}`,{allow:[404]});return response.status===404?null:decode({mapValue:{fields:response.value.fields}});},
  start:async()=>{if(taskState()!=='ready')throw new Error('worker-task-not-ready');startWorker();},
  ack:async attemptedAt=>queue.write(relative,{status:'attempted',attemptedAt})
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{process.exitCode=1;}); // Do not expose tokens or filesystem details to scheduled logs.
}
