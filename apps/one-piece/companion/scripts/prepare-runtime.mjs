import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareRuntime } from '../src/runtime/setup.mjs';
try {
  const repositoryRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
  const nativeIndex=process.argv.indexOf('--native-auth');
  if(nativeIndex>=0&&!process.argv[nativeIndex+1])throw new Error('runtime-native-auth-required');
  const nativeAuthConfigPath=nativeIndex>=0?path.resolve(process.argv[nativeIndex+1]):undefined;
  const config=await prepareRuntime({repositoryRoot,nativeAuthConfigPath});
  console.log(JSON.stringify({prepared:true,configPath:config.privateRoot+'/config.json',controlsOrigin:config.controlsOrigin,publicCertificatePath:config.caddy.publicCertificatePath,windowsPasswordStored:false}));
} catch { console.error('runtime-prepare-failed'); process.exitCode=1; }
