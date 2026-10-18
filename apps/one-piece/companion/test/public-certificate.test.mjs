import test from 'node:test';
import assert from 'node:assert/strict';
import {X509Certificate,generateKeyPairSync} from 'node:crypto';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import {certificatePaths,renewalDue,validateCertificatePair,legoArguments,ownsCaddy,deployPair,runLego,restartManagedCaddy,renewPublicCertificate} from '../src/runtime/public-certificate.mjs';

// Generated test identity. This CA and its published leaf key are never trusted by production.
const ROOT=`-----BEGIN CERTIFICATE-----
MIIBljCCATygAwIBAgIUcZNjkB9UHdmcUnEvNGVS+RnCOX8wCgYIKoZIzj0EAwIw
KTEnMCUGA1UEAwweT25lUGllY2UgUFVCTElDIFRFU1QgT05MWSBSb290MB4XDTI2
MTAxODE5NDQzOFoXDTM2MTAxNTE5NDQzOFowKTEnMCUGA1UEAwweT25lUGllY2Ug
UFVCTElDIFRFU1QgT05MWSBSb290MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE
xzNNF7LeMpV0dqAE16xRSLpFaJ+/GnAj5fVED8UmYm4595txkggCiYAUJTKbRiI5
4Ta3VI3Mm5XUnfDx8Qdu4KNCMEAwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8E
BAMCAQYwHQYDVR0OBBYEFBpg58ccWtFCGF6VXxBiLRy7AiBkMAoGCCqGSM49BAMC
A0gAMEUCID8a1UV64JpfwlI6JxRy5rJg5xyCdbebqEL/4eiy/vZgAiEA0TycYjFz
uUoX4Y2B1GRG4f59Kxy0ggqLMktVCkfop68=
-----END CERTIFICATE-----`;
const CERTIFICATE=`-----BEGIN CERTIFICATE-----
MIIBsjCCAVigAwIBAgIUX8XYZujvCMKhIdApxF1pqz+l7qowCgYIKoZIzj0EAwIw
KTEnMCUGA1UEAwweT25lUGllY2UgUFVCTElDIFRFU1QgT05MWSBSb290MB4XDTI2
MTAxODE5NDQzOVoXDTI3MTAxODE5NDQzOVowKDEmMCQGA1UEAwwdcHRpLW9uZXBp
ZWNlLWhvbWUuZHVja2Rucy5vcmcwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAASY
xbUjl2YlOho/gND26GC1vaRk8qJcTLkBJY3Yo1QlBjm1sPwZShgG6beNGPm53pFj
IAlA0dVFlrvFC6dk6oYJo18wXTAMBgNVHRMBAf8EAjAAMA4GA1UdDwEB/wQEAwIH
gDATBgNVHSUEDDAKBggrBgEFBQcDATAoBgNVHREEITAfgh1wdGktb25lcGllY2Ut
aG9tZS5kdWNrZG5zLm9yZzAKBggqhkjOPQQDAgNIADBFAiEA0RTScaF8jAZX0Mk2
eKHx8J+CRvCrewl2j+O/8tszYnsCIEHtRI8mLK4tglqaXyVFF0xB8+hOqSexIZkT
9XBJPecf
-----END CERTIFICATE-----`;
const KEY=`-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgp/h/svuG9oYcgX9w
8OWVN9wWlGLIp0DplwbjxKgrsQChRANCAASYxbUjl2YlOho/gND26GC1vaRk8qJc
TLkBJY3Yo1QlBjm1sPwZShgG6beNGPm53pFjIAlA0dVFlrvFC6dk6oYJ
-----END PRIVATE KEY-----`;
const HOST='pti-onepiece-home.duckdns.org',leaf=new X509Certificate(CERTIFICATE),NOW=Date.parse(leaf.validFrom)+86400000;
const validate=(certificate,key,host)=>validateCertificatePair(certificate,key,host,{now:NOW,trustRoots:[ROOT]});
const configuration=()=>({privateRoot:'H:/PTI-OnePiece/runtime/private',configPath:'H:/PTI-OnePiece/runtime/private/config.json',nodeExecutable:'H:/PTI-OnePiece/tools/node/node.exe',serverEntry:'H:/PTI-OnePiece/releases/'+ 'a'.repeat(40)+'/apps/one-piece/companion/src/server.mjs',tls:{mode:'public-certificate',hostname:HOST,certificatePath:`H:/PTI-OnePiece/runtime/private/public-tls/${HOST}.crt`,privateKeyPath:`H:/PTI-OnePiece/runtime/private/public-tls/${HOST}.key`},caddy:{executable:'H:/PTI-OnePiece/pilot/network/runtime/caddy.exe',configurationPath:'H:/PTI-OnePiece/runtime/private/Caddyfile'}});
test('renewal paths are limited to the configured DuckDNS identity and protected directory',()=>{
 const config=configuration();assert.equal(certificatePaths(config).root,'H:\\PTI-OnePiece\\runtime\\private\\public-tls');
 for(const mutate of [x=>x.tls.hostname='someone-else.duckdns.org',x=>x.tls.certificatePath='H:/PTI-OnePiece/runtime/public/example.crt',x=>x.tls.privateKeyPath='C:/outside.key',x=>x.tls.mode='household-ca']){const sample=configuration();mutate(sample);assert.throws(()=>certificatePaths(sample));}
});
test('renewal becomes due thirty days before expiration, including an expired certificate',()=>{
 const expires=Date.parse(leaf.validTo);assert.equal(renewalDue(CERTIFICATE,{now:expires-31*86400000}),false);assert.equal(renewalDue(CERTIFICATE,{now:expires-30*86400000}),true);assert.equal(renewalDue(CERTIFICATE,{now:expires+1}),true);assert.throws(()=>renewalDue(CERTIFICATE,{days:0}));
});
test('candidate validation proves SAN, private-key match, validity and a signature chain to a trusted public root',()=>{
 assert.equal(validate(CERTIFICATE,KEY,HOST).fingerprint,leaf.fingerprint256);
 const wrong=generateKeyPairSync('ec',{namedCurve:'P-256'}).privateKey.export({format:'pem',type:'pkcs8'});
 for(const [certificate,key,host,options]of [[CERTIFICATE,wrong,HOST,{now:NOW,trustRoots:[ROOT]}],[CERTIFICATE,KEY,'wrong.duckdns.org',{now:NOW,trustRoots:[ROOT]}],[CERTIFICATE,KEY,HOST,{now:Date.parse(leaf.validTo)+1,trustRoots:[ROOT]}],[CERTIFICATE,KEY,HOST,{now:NOW,trustRoots:[]}],[ROOT,KEY,HOST,{now:NOW,trustRoots:[ROOT]}]])assert.throws(()=>validateCertificatePair(certificate,key,host,options),{code:'public-certificate-validation'});
 assert.throws(()=>validateCertificatePair(CERTIFICATE,KEY,HOST,{now:NOW}),{code:'public-certificate-validation'});
});
test('lego uses the pinned v5 run syntax and token stays exclusively in the child environment',async()=>{
 assert.deepEqual(legoArguments('private-acme').slice(0,4),['--log.level','error','run','--path']);assert.equal(legoArguments('x').includes('--renew-days'),true);assert.equal(legoArguments('x').includes('renew'),false);
 const previous=process.env.LEGO_PRE_HOOK;process.env.LEGO_PRE_HOOK='must-not-inherit';let invocation;
 try{await runLego('private-acme','PUBLIC-TEST-TOKEN',{spawnImpl:(executable,args,options)=>{
  invocation={executable,args,options:{...options,env:{...options.env}}};const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};queueMicrotask(()=>{child.stderr.write('provider errors must be discarded');child.emit('close',0);});return child;
 }});}finally{if(previous===undefined)delete process.env.LEGO_PRE_HOOK;else process.env.LEGO_PRE_HOOK=previous;}
 assert.equal(invocation.options.windowsHide,true);assert.equal(invocation.options.shell,false);assert.equal(invocation.options.env.DUCKDNS_TOKEN,'PUBLIC-TEST-TOKEN');assert.equal(invocation.options.env.LEGO_PRE_HOOK,undefined);assert.equal(JSON.stringify(invocation.args).includes('PUBLIC-TEST-TOKEN'),false);
});
test('Caddy ownership requires the exact parent, executable and both full argument lists',()=>{
 const config=configuration(),state={supervisorPid:101,processes:{caddy:{pid:102}}};
 const records=[{pid:101,parentPid:100,executable:config.nodeExecutable,arguments:[config.nodeExecutable,path.win32.join(path.win32.dirname(config.serverEntry),'runtime','supervisor.mjs'),'--config',config.configPath]},{pid:102,parentPid:101,executable:config.caddy.executable,arguments:[config.caddy.executable,'run','--config',config.caddy.configurationPath,'--adapter','caddyfile']}];
 assert.equal(ownsCaddy(config,state,records),true);assert.equal(ownsCaddy(config,{...state,stoppedAt:'now'},records),false);
 for(const mutate of [x=>x[1].parentPid=999,x=>x[0].executable='C:/unrelated.exe',x=>x[1].arguments.push('extra'),x=>x[0].arguments[3]='H:/unrelated.json',x=>x[1].arguments[3]='H:/other/Caddyfile']){const sample=structuredClone(records);mutate(sample);assert.equal(ownsCaddy(config,state,sample),false);}
});
async function fixture(t){const root=await mkdtemp(path.join(os.tmpdir(),'one-piece-public-cert-'));t.after(()=>rm(root,{recursive:true,force:true}));const paths={root,certificatePath:path.join(root,'deployed.crt'),privateKeyPath:path.join(root,'deployed.key'),journalPath:path.join(root,'deployment.json')};await writeFile(paths.certificatePath,CERTIFICATE);await writeFile(paths.privateKeyPath,KEY);return paths;}
test('unchanged deployment performs no restart and writes no staging, backup or journal files',async t=>{
 const paths=await fixture(t);let restarts=0;const result=await deployPair(paths,{certificate:Buffer.from(CERTIFICATE),key:Buffer.from(KEY)},{validateImpl:validate,restartImpl:async()=>{restarts++;}});
 assert.equal(result.changed,false);assert.equal(restarts,0);assert.deepEqual((await readdir(paths.root)).sort(),['deployed.crt','deployed.key']);
});
test('a fresh certificate never decrypts provider secrets, calls DNS or writes a renewal lock',async t=>{
 const paths=await fixture(t);let binaryChecks=0;
 const forbidden=async()=>assert.fail('fresh certificate must not mutate or prepare renewal');
 const result=await renewPublicCertificate({}, {pathsImpl:()=>paths,clock:()=>NOW,validateImpl:validate,verifyLegoImpl:async()=>{binaryChecks++;},runLegoImpl:forbidden,restartImpl:forbidden,protection:{secureDirectory:forbidden,unprotect:forbidden}});
 assert.equal(result.changed,false);assert.equal(result.due,false);assert.equal(binaryChecks,1);assert.deepEqual((await readdir(paths.root)).sort(),['deployed.crt','deployed.key']);
});
test('a rejected candidate cannot modify the deployed pair',async t=>{
 const paths=await fixture(t);await assert.rejects(deployPair(paths,{certificate:Buffer.from('bad'),key:Buffer.from(KEY)}));assert.equal(await readFile(paths.certificatePath,'utf8'),CERTIFICATE);assert.deepEqual((await readdir(paths.root)).sort(),['deployed.crt','deployed.key']);
});
test('failed reload restores the previous pair and retains a verified rollback copy',async t=>{
 const paths=await fixture(t);let restarts=0;
 await assert.rejects(deployPair(paths,{certificate:Buffer.from(CERTIFICATE+'\n'),key:Buffer.from(KEY)},{validateImpl:validate,restartImpl:async()=>{if(++restarts===1)throw new Error('reload-test-failure');return{restarted:true};}}),/reload-test-failure/);
 assert.equal(restarts,2);assert.equal(await readFile(paths.certificatePath,'utf8'),CERTIFICATE);assert.equal(await readFile(paths.privateKeyPath,'utf8'),KEY);assert.equal(await readFile(paths.certificatePath+'.previous','utf8'),CERTIFICATE);assert.equal((await readdir(paths.root)).includes('deployment.json'),false);
});
test('stopped runtime never triggers a process query or application start',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'one-piece-stopped-cert-'));t.after(()=>rm(root,{recursive:true,force:true}));await writeFile(path.join(root,'supervisor-state.json'),JSON.stringify({stoppedAt:'now'}));
 const config={privateRoot:root,statePath:path.join(root,'supervisor-state.json')};let calls=0;
 assert.deepEqual(await restartManagedCaddy(config,{processRequestImpl:async()=>{calls++;}}),{restarted:false,reason:'runtime-stopped'});assert.equal(calls,0);
});
