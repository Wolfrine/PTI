import {pinNodeRuntime} from '../src/runtime/node-runtime.mjs';
try{console.log(JSON.stringify(await pinNodeRuntime({replaceExisting:process.argv.includes('--replace')})));}catch{console.error('runtime-node-pin-failed');process.exitCode=1;}
