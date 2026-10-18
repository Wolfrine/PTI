import {loadRuntimeConfig} from '../src/runtime/config.mjs';
import {localSetupChallenge,requestLocalSetup} from '../src/runtime/local-setup.mjs';
try{
  const config=await loadRuntimeConfig('H:/PTI-OnePiece/runtime/private/config.json');
  if(process.argv.includes('--renew')){console.log(JSON.stringify(await requestLocalSetup(config)));process.exit(0);}
  if(!process.stdin.isTTY||!process.stdout.isTTY)throw new Error();
  const challenge=await localSetupChallenge(config);
  console.log('One Piece: enter this one-time code into the signed-in owner setup screen.');
  console.log(challenge.code);console.log('Expires: '+new Date(challenge.expiresAt).toLocaleTimeString());
  console.log('This code stays on this PC. Close this window when paired.');
  process.stdin.resume();setTimeout(()=>process.exit(0),Math.min(challenge.expiresAt-Date.now(),60000));
}catch{console.error('Local setup code unavailable. Check that the companion is running and unpaired.');process.exitCode=1;}
