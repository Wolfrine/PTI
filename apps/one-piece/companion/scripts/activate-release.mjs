import {activateRelease} from '../src/runtime/release.mjs';
try{const index=process.argv.indexOf('--commit');if(index<0)throw new Error();console.log(JSON.stringify(await activateRelease({commit:process.argv[index+1]})));}catch(error){console.error(error.message==='stop-runtime-before-activation'?'stop-runtime-before-activation':'runtime-release-activation-failed');process.exitCode=1;}
