import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {packageRelease} from '../src/runtime/release.mjs';
const args=process.argv.slice(2),option=name=>{const index=args.indexOf(name);return index>=0?args[index+1]:undefined;};
try{
 const commit=option('--commit'),repositoryRoot=option('--repository')??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
 console.log(JSON.stringify(await packageRelease({commit,repositoryRoot,activate:args.includes('--activate')})));
}catch(error){console.error(['release-source-dirty','release-not-current-commit','stop-runtime-before-activation','release-already-exists-verify-before-reuse'].includes(error.message)?error.message:'runtime-release-packaging-failed');process.exitCode=1;}
