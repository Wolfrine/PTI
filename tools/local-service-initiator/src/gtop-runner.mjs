import {readdir,stat,access} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const GTOP_ENDPOINT = 'http://127.0.0.1:11435';
export const GTOP_MODELS = 'H:\\GTOP-Local-AI\\models\\ollama';
export function endpointPort(endpoint) {
  // Keep SEFPO's default port out of this capability, including URL aliases.
  if(typeof endpoint!=='string' || !/^http:\/\/127\.0\.0\.1:[1-9]\d{3,4}$/.test(endpoint))throw Error('configuration_invalid');
  const port=Number(endpoint.slice(endpoint.lastIndexOf(':')+1));
  if(port<1024 || port>65535 || port===11434)throw Error('configuration_invalid');
  return port;
}
export function samePath(a,b) {
  return typeof a==='string' && typeof b==='string' && path.win32.resolve(a).toLowerCase()===path.win32.resolve(b).toLowerCase();
}
export function validateRunner(settings,worker) {
  endpointPort(settings.ollamaEndpoint);
  if(!samePath(settings.modelDirectory,GTOP_MODELS) || worker?.workerId!=='sachit-windows' ||
    worker.ollama!==settings.ollamaEndpoint || worker.runnerContractVersion!==1 ||
    typeof worker.model!=='string' || !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,159}$/.test(worker.model))throw Error('configuration_invalid');
}

/** Public, credential-free helper. Resolve again for each start/job; never pin a desktop build folder. */
export async function resolveCodexExecutable({localAppData=process.env.LOCALAPPDATA,readDirectory=readdir,fileStat=stat}={}) {
  if(!localAppData || !path.win32.isAbsolute(localAppData))throw Error('configuration_invalid');
  const base=path.win32.join(localAppData,'OpenAI','Codex','bin');
  let entries;
  try { entries=await readDirectory(base,{withFileTypes:true}); } catch { throw Error('configuration_invalid'); }
  const candidates=[];
  for(const entry of entries) {
    if(!entry.isDirectory() || !/^[A-Za-z0-9._-]+$/.test(entry.name))continue;
    const executable=path.win32.join(base,entry.name,'codex.exe');
    try { const info=await fileStat(executable);if(info.isFile())candidates.push({executable,mtime:info.mtimeMs}); } catch { /* An update can remove an old folder during discovery. */ }
  }
  candidates.sort((a,b)=>b.mtime-a.mtime || a.executable.localeCompare(b.executable));
  if(!candidates.length)throw Error('configuration_invalid');
  return candidates[0].executable;
}

export async function runnerContract(settings,worker,{resolveCodex=resolveCodexExecutable,checkAccess=access}={}) {
  validateRunner(settings,worker);
  const codexExecutable=await resolveCodex();
  if(!path.win32.isAbsolute(codexExecutable) || path.win32.basename(codexExecutable).toLowerCase()!=='codex.exe' || /[\r\n\0]/.test(codexExecutable))throw Error('configuration_invalid');
  await checkAccess(codexExecutable);
  const contract={schemaVersion:1,workerId:settings.workerId,workerConfig:settings.workerConfig,ollamaEndpoint:settings.ollamaEndpoint,modelDirectory:settings.modelDirectory,model:worker.model,codexExecutable,codexResolverModule:fileURLToPath(import.meta.url)};
  return {...contract,id:createHash('sha256').update(JSON.stringify(contract)).digest('hex')};
}

export const STARTUP_ACTIONS = Object.freeze({
  configuration:'Align the GTOP worker runnerContractVersion=1 and ollama endpoint with initiator settings; keep protected pairing unchanged.',
  codex:'Check the installed desktop Codex bin directory and use resolveCodexExecutable(); do not restore a version-pinned path.',
  listener_conflict:'The dedicated GTOP port has an unowned listener. Leave it running; choose another explicit loopback port in both GTOP and initiator settings.',
  worker_conflict:'A GTOP worker or native host is already running with a different/unverified contract. Review it and arrange an idle owner-authorized cutover; no process was stopped.',
  model_missing:'The owned GTOP dispatcher does not list the configured model. Check the existing H-drive manifest/storage; no download or model deletion was attempted.',
  dispatcher_timeout:'GTOP dispatcher did not become healthy within the startup budget. Inspect private ollama host state/logs; do not retry by killing another app.',
  launch_timeout:'The native host/worker did not confirm launch within the startup budget. Inspect private host state/logs before a new authorized Start request.'
});
export function startupFailure(code,reason) { return Object.assign(Error(code),{reason,action:STARTUP_ACTIONS[reason]}); }
