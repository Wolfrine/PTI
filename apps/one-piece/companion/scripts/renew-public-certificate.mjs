import {loadRenewalConfig,renewPublicCertificate} from '../src/runtime/public-certificate.mjs';
try{
  if(process.argv.slice(2).some(value=>value!=='--check'))throw new Error('public-certificate-arguments');
  const result=await renewPublicCertificate(await loadRenewalConfig(),{checkOnly:process.argv.includes('--check')});
  console.log(JSON.stringify({event:'one-piece-public-certificate',...result}));
}catch(error){
  const code=typeof error.code==='string'&&/^public-certificate-[a-z-]+$/.test(error.code)?error.code:'public-certificate-renewal-failed';
  console.error(JSON.stringify({event:'one-piece-public-certificate',ok:false,code}));process.exitCode=1;
}
