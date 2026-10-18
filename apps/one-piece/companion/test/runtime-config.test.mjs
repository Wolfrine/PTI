import test from 'node:test';
import assert from 'node:assert/strict';
import {rootCertificates} from 'node:tls';
import {managedPath,validateRuntimeConfig,validatePublicTlsMaterial,HOUSEHOLD_CA_SHA256,CADDY_SHA256} from '../src/runtime/config.mjs';
import {renderCaddyConfig,createNewRuntimeConfig,installRuntimeTrust} from '../src/runtime/setup.mjs';
function fixture(){const root='H:/PTI-OnePiece/runtime',privateRoot=root+'/private';return{version:1,repositoryRoot:'F:/Workspace/Worktrees/PTI/one-piece-family',runtimeRoot:root,privateRoot,dataRoot:root+'/data',cacheRoot:root+'/media',cacheAccountingRoots:['H:/PTI-OnePiece/production-media','H:/PTI-OnePiece/pilot/jellyfin/cache'],progressRoot:root+'/data/progress',viewerCredentialsRoot:privateRoot+'/viewers',ownerBindingPath:privateRoot+'/family-binding.json',proxySecretPath:privateRoot+'/proxy.dpapi',jellyfinTokenPath:privateRoot+'/token.dpapi',jellyfinCredentialsPath:privateRoot+'/admin.dpapi',setupChallengePath:privateRoot+'/setup.dpapi',statePath:privateRoot+'/state.json',catalogPath:'F:/repo/catalog.json',serverEntry:'F:/repo/server.mjs',nodeExecutable:'C:/Program Files/nodejs/node.exe',pythonExecutable:'C:/Python/python.exe',firebaseProjectId:'pti-app-2ab59',firebaseApiKey:'public-test-api-key-marker',allowedOrigins:['https://pti-app-2ab59.web.app'],controlsOrigin:'https://onepiece.local:8443',mediaOrigin:'https://onepiece.local:8443',fallbackControlsOrigin:'https://192.168.68.105:8443',castMediaOrigin:'http://onepiece.local:18099',backendHost:'127.0.0.1',backendPort:18098,httpMediaHost:'192.168.68.105',httpMediaPort:18099,allowHttpMedia:true,consent:{hybridMediaAccepted:true,householdCaAccepted:true,recordedAt:'2026-10-18T08:30:00Z'},mdns:{hostname:'onepiece.local',address:'192.168.68.105',subnet:'192.168.68.0/24',toolsPath:'H:/PTI-OnePiece/pilot/tools/python'},jellyfin:{origin:'http://127.0.0.1:18097',runtimeRoot:root+'/jellyfin',binaryDir:'H:/PTI-OnePiece/pilot/jellyfin/runtime/jellyfin'},caddy:{binarySha256:CADDY_SHA256,caSha256:HOUSEHOLD_CA_SHA256,executable:'H:/PTI-OnePiece/pilot/network/runtime/caddy.exe',storageRoot:'H:/PTI-OnePiece/pilot/network/private-ca-pilot/storage',rootCertificatePath:'H:/PTI-OnePiece/pilot/network/private-ca-pilot/storage/pki/authorities/local/root.crt',configurationPath:privateRoot+'/Caddyfile',publicCertificatePath:root+'/public/root.crt'}};}
function publicFixture(){const value=fixture(),hostname='test-only-onepiece.duckdns.org';value.tls={mode:'public-certificate',hostname,certificatePath:`${value.privateRoot}/public-tls/${hostname}.crt`,privateKeyPath:`${value.privateRoot}/public-tls/${hostname}.key`};value.controlsOrigin=`https://${hostname}:8443`;value.mediaOrigin=value.controlsOrigin;value.allowedOrigins.push(value.controlsOrigin,'https://onepiece.local:8443');return value;}
test('managed runtime refuses traversal, drive roots, UNC and relative paths',()=>{
  for(const value of ['H:/PTI-OnePiece','H:/PTI-OnePiece/../other/file','C:/private','file.txt','\\\\server\\share\\secret'])assert.throws(()=>managedPath(value));
  assert.equal(managedPath('H:/PTI-OnePiece/runtime/private'),'H:\\PTI-OnePiece\\runtime\\private');
});
test('runtime enforces approved HTTPS control, explicit LAN HTTP consent and private secret paths',()=>{
  assert.equal(validateRuntimeConfig(fixture()).backendHost,'127.0.0.1');
  for(const mutate of [x=>x.backendHost='0.0.0.0',x=>x.controlsOrigin='http://onepiece.local',x=>x.allowHttpMedia=false,x=>x.consent.hybridMediaAccepted=false,x=>x.caddy.caSha256='unapproved',x=>x.setupChallengePath='H:/PTI-OnePiece/public/setup.dpapi',x=>x.cacheAccountingRoots=['C:/outside'],x=>x.allowedOrigins.push('https://unknown.example')]){const sample=fixture();mutate(sample);assert.throws(()=>validateRuntimeConfig(sample));}
});
test('Caddy config overwrites private proxy headers, uses strict LAN bind and omits administrative/access logging endpoints',()=>{
  const text=renderCaddyConfig(validateRuntimeConfig(fixture()),'A'.repeat(43));
  assert.match(text,/bind 192\.168\.68\.105/);assert.match(text,/admin off/);assert.match(text,/skip_install_trust/);
  assert.match(text,/header_up X-OnePiece-Proxy A{43}/);assert.match(text,/header_up X-Forwarded-Proto https/);
  assert.match(text,/tls internal/);assert.equal(text.includes('log {'),false);assert.equal(text.includes('auto_https off'),false);
  assert.throws(()=>renderCaddyConfig(fixture(),'injected\nvalue'));
});

test('prepared playback needs an explicit mode and derives its roots from the existing bounded cache',()=>{
 const value=fixture();assert.deepEqual(validateRuntimeConfig(value).playback,{mode:'compatible-h264'});
 value.playback={mode:'prepared-mp4'};assert.equal(validateRuntimeConfig(value).playback.mode,'prepared-mp4');
 for(const playback of [{mode:'automatic'},{mode:'prepared-mp4',preparedRoot:'H:/PTI-OnePiece/outside'},null,[],true]){
  value.playback=playback;assert.throws(()=>validateRuntimeConfig(value),error=>error.code==='runtime-playback');
 }
});

test('new setup explicitly selects prepared MP4 while an existing omitted mode stays legacy and input is preserved',()=>{
 const input=fixture(),before=structuredClone(input),created=createNewRuntimeConfig(input);
 assert.deepEqual(created.playback,{mode:'prepared-mp4'});assert.deepEqual(input,before);
 assert.deepEqual(validateRuntimeConfig(input).playback,{mode:'compatible-h264'});
 assert.equal(created.cacheRoot,'H:\\PTI-OnePiece\\runtime\\media');
 assert.deepEqual(created.cacheAccountingRoots,before.cacheAccountingRoots.map(managedPath));
 assert.equal(created.jellyfin.origin,'http://127.0.0.1:18097');assert.equal(created.jellyfin.binaryDir,managedPath(input.jellyfin.binaryDir));
 const invalid=fixture();invalid.controlsOrigin='http://onepiece.local';assert.throws(()=>createNewRuntimeConfig(invalid));
});

test('public TLS requires an explicit exact DuckDNS hostname, matching HTTPS media/control origin and private managed paths',()=>{
 const input=publicFixture(),before=structuredClone(input),value=validateRuntimeConfig(input);
 assert.equal(value.controlsOrigin,'https://test-only-onepiece.duckdns.org:8443');
 assert.equal(value.tls.privateKeyPath,'H:\\PTI-OnePiece\\runtime\\private\\public-tls\\test-only-onepiece.duckdns.org.key');assert.deepEqual(input,before);
 for(const mutate of [
  x=>x.tls.hostname='unapproved.example',x=>x.tls.hostname='*.duckdns.org',x=>x.tls.hostname='sub.test.duckdns.org',
  x=>x.tls.hostname='Test.duckdns.org',x=>x.tls.hostname='test.duckdns.org.',x=>x.tls.mode='automatic',
  x=>x.tls.extra='unapproved',x=>x.controlsOrigin='http://test-only-onepiece.duckdns.org:8443',
  x=>x.controlsOrigin='https://other.duckdns.org:8443',x=>x.controlsOrigin='https://test-only-onepiece.duckdns.org',
  x=>x.mediaOrigin='http://onepiece.local:18099',x=>x.tls.privateKeyPath='H:/PTI-OnePiece/runtime/public/test-only-onepiece.duckdns.org.key',
  x=>x.tls.privateKeyPath='H:/PTI-OnePiece/runtime/private/public-tls/test-only-onepiece.duckdns.org.key:stream',
  x=>x.tls.certificatePath='H:/PTI-OnePiece/runtime/private/public-tls/other.duckdns.org.crt',
  x=>x.tls.certificatePath='H:/PTI-OnePiece/runtime/private/quote"/test-only-onepiece.duckdns.org.crt',
  x=>x.tls.privateKeyPath='H:/PTI-OnePiece/runtime/private/different/test-only-onepiece.duckdns.org.key',
  x=>x.allowedOrigins.push('https://other.duckdns.org:8443')
 ]){const sample=publicFixture();mutate(sample);assert.throws(()=>validateRuntimeConfig(sample));}
});

test('public Caddy SNI listener retains legacy routes without weakening TLS or exposing admin/logs',()=>{
 const text=renderCaddyConfig(publicFixture(),'B'.repeat(43));
 assert.match(text,/https:\/\/onepiece\.local:8443, https:\/\/192\.168\.68\.105:8443 \{/);
 assert.match(text,/https:\/\/test-only-onepiece\.duckdns\.org:8443 \{/);
 assert.match(text,/tls "H:\/PTI-OnePiece\/runtime\/private\/public-tls\/test-only-onepiece\.duckdns\.org.crt" "H:\/PTI-OnePiece\/runtime\/private\/public-tls\/test-only-onepiece\.duckdns\.org.key"/);
 assert.equal((text.match(/bind 192\.168\.68\.105/g)??[]).length,2);
 assert.equal((text.match(/header_up X-OnePiece-Proxy B{43}/g)??[]).length,2);
 assert.match(text,/admin off/);assert.match(text,/skip_install_trust/);assert.equal(text.includes('log {'),false);assert.equal(text.includes('http://'),false);
});

test('rerunning setup in public mode never installs the household CA; legacy opt-out and install still work',async()=>{
 const calls=[],runPowerShellImpl=async(...args)=>{calls.push(args);return{installed:true};};
 assert.deepEqual(await installRuntimeTrust(validateRuntimeConfig(publicFixture()),{runPowerShellImpl}),{installed:false,reason:'public-certificate'});assert.equal(calls.length,0);
 assert.deepEqual(await installRuntimeTrust(validateRuntimeConfig(fixture()),{installTrust:false,runPowerShellImpl}),{installed:false,reason:'not-requested'});assert.equal(calls.length,0);
 assert.deepEqual(await installRuntimeTrust(validateRuntimeConfig(fixture()),{runPowerShellImpl}),{installed:true});assert.equal(calls.length,1);assert.equal(calls[0][1][0],'-CertificatePath');
});

test('public certificate material rejects malformed and wrong-subject certificates before startup',()=>{
 const tls=validateRuntimeConfig(publicFixture()).tls;
 for(const certificate of ['not a certificate',rootCertificates[0]])assert.throws(()=>validatePublicTlsMaterial(tls,certificate,'not a private key'),{code:'runtime-tls-certificate'});
});
