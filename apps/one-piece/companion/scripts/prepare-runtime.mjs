import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareRuntime } from '../src/runtime/setup.mjs';
try {
  const repositoryRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
  const config=await prepareRuntime({repositoryRoot});
  console.log(JSON.stringify({prepared:true,configPath:config.privateRoot+'/config.json',controlsOrigin:config.controlsOrigin,publicCertificatePath:config.caddy.publicCertificatePath,windowsPasswordStored:false}));
} catch { console.error('runtime-prepare-failed'); process.exitCode=1; }
