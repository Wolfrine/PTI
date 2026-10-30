import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {serviceDisabled,waitForServiceOperation} from '../scripts/cloud-checks.mjs';

// Execute the setup entrypoint with synthetic auth and transport. No credential
// file is opened, no real Google request is possible, and no browser is used.
const source=readFileSync(new URL('../scripts/configure-firebase-auth.mjs',import.meta.url),'utf8');
const requiredRefs=['https://pti-app-2ab59-velum.web.app/*','https://pti-app-2ab59-velum.firebaseapp.com/*','https://docs.google.com/*'];
const original={
  apiTargets:[{service:'identitytoolkit.googleapis.com',methods:['accounts.signInWithIdp']}],
  browserKeyRestrictions:{allowedReferrers:['https://existing.example/*']}
};
function fixture(options={}){
  const calls=[],logs=[],warnings=[];
  let restrictions=structuredClone(options.restrictions||original),keyReads=0;
  const name='projects/185802494856/locations/global/keys/fixture-existing-key';
  const respond=(status,body)=>new Response(JSON.stringify(body),{status});
  const fetch=async(url,init={})=>{
    const parsed=new URL(url),method=init.method||'GET';
    calls.push({host:parsed.host,path:parsed.pathname,method,query:parsed.searchParams,body:init.body&&JSON.parse(init.body)});
    if(parsed.host==='identitytoolkit.googleapis.com')return respond(200,{
      authorizedDomains:['pti-app-2ab59-velum.web.app','pti-app-2ab59-velum.firebaseapp.com'],signIn:{anonymous:{enabled:true}},autodeleteAnonymousUsers:false
    });
    if(parsed.host==='serviceusage.googleapis.com'){
      if(options.pickerDenied&&parsed.pathname.includes('picker.googleapis.com'))return respond(403,{});
      return respond(200,{state:'ENABLED'});
    }
    if(parsed.host==='www.googleapis.com')return respond(401,{error:{message:'OAuth required'}});
    if(parsed.pathname==='/v2/keys:lookupKey')return respond(options.lookupStatus||200,{name:options.wrongProject?'projects/other/locations/global/keys/fixture':name});
    if(parsed.host==='apikeys.googleapis.com'&&method==='PATCH'){
      if(options.patchDenied)return respond(403,{});
      restrictions=JSON.parse(init.body).restrictions;
      return respond(200,{done:true,...(options.operationError?{error:{message:'fixture operation denied'}}:{})});
    }
    if(parsed.host==='apikeys.googleapis.com'&&parsed.pathname===`/v2/${name}`){
      keyReads++;
      if(options.readDenied)return respond(403,{});
      return respond(200,{name,etag:'fixture-etag',restrictions:options.verifyMissing&&keyReads>1?original:restrictions});
    }
    if(parsed.host==='firestore.googleapis.com'){
      if(options.indexReadDenied)return respond(403,{});
      return respond(method==='POST'&&options.indexCreateDenied?403:200,{indexes:[]});
    }
    throw new Error(`Unexpected fixture request: ${parsed.host}${parsed.pathname}`);
  };
  class GoogleAuth {
    async getClient(){return{email:'fixture-ci@example.invalid',getAccessToken:async()=>({token:'synthetic-token'})};}
  }
  const run=()=>runInNewContext(`(async()=>{\n${source.replace(/^import .*;\r?$/gm,'')}\n})()`,{
    fs:{existsSync:()=>true},GoogleAuth,process:{env:{GOOGLE_APPLICATION_CREDENTIALS:'synthetic-path-only'}},
    fetch,structuredClone,serviceDisabled,waitForServiceOperation,
    console:{log:message=>logs.push(message),warn:message=>warnings.push(message)}
  });
  return{run,calls,logs,warnings};
}
const keyPatches=f=>f.calls.filter(c=>c.host==='apikeys.googleapis.com'&&c.method==='PATCH');
const indexCalls=f=>f.calls.filter(c=>c.host==='firestore.googleapis.com');

test('key lookup 403 fails release, names the metadata principal, and stops before later cloud changes',async()=>{
  const f=fixture({lookupStatus:403});
  await assert.rejects(f.run(),/Picker restrictions \(403\).*logged setup principal.*release stopped/);
  assert.ok(f.logs.includes('Velum cloud setup principal: fixture-ci@example.invalid'));
  assert.equal(keyPatches(f).length,0);assert.equal(indexCalls(f).length,0);
  assert.equal(f.calls.at(-1).path,'/v2/keys:lookupKey');
  assert.ok(!f.logs.some(line=>line.includes('prerequisites verified')));
});

test('key read, update and operation failures each stop before optional indexes',async()=>{
  for(const [options,message] of [[{readDenied:true},/inspect public web key restrictions \(403\)/],[{patchDenied:true},/required Picker restrictions \(403\)/],[{operationError:true},/fixture operation denied/]]){
    const f=fixture(options);await assert.rejects(f.run(),message);assert.equal(indexCalls(f).length,0);
  }
});

test('Picker service authorization failure is release-critical before any key or index request',async()=>{
  const f=fixture({pickerDenied:true});await assert.rejects(f.run(),/picker.googleapis.com.*HTTP 403/);
  assert.equal(f.calls.filter(c=>c.host==='apikeys.googleapis.com').length,0);assert.equal(indexCalls(f).length,0);
});

test('updates only restrictions on the original public key and preserves existing APIs, methods and referrers',async()=>{
  const f=fixture();await f.run();const patches=keyPatches(f);assert.equal(patches.length,1);
  assert.equal(patches[0].query.get('updateMask'),'restrictions');
  assert.equal(patches[0].path,`/v2/${patches[0].body.name}`);assert.equal(patches[0].body.etag,'fixture-etag');
  assert.deepEqual(patches[0].body.restrictions,{
    apiTargets:[...original.apiTargets,{service:'picker.googleapis.com'},{service:'drive.googleapis.com'}],
    browserKeyRestrictions:{allowedReferrers:[...original.browserKeyRestrictions.allowedReferrers,...requiredRefs]}
  });
  const browser=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const browserKey=browser.match(/apiKey:\s*'([^']+)'/)[1];
  const lookup=f.calls.find(c=>c.path==='/v2/keys:lookupKey');assert.ok(lookup.query.get('keyString')===browserKey,'setup must reuse the shipped public key');
  assert.ok(f.logs.includes('Existing public web key Picker restrictions verified; original restrictions retained.'));
});

test('unchanged permitted restrictions need no key mutation',async()=>{
  const f=fixture({restrictions:{apiTargets:[...original.apiTargets,{service:'picker.googleapis.com'},{service:'drive.googleapis.com'}],browserKeyRestrictions:{allowedReferrers:requiredRefs}}});
  await f.run();assert.equal(keyPatches(f).length,0);assert.ok(f.logs.includes('Existing public web key permits the Picker configuration.'));
});

test('an unrestricted key remains unrestricted and a foreign project is rejected without key mutation',async()=>{
  const open=fixture({restrictions:{}});await open.run();assert.equal(keyPatches(open).length,0);
  const foreign=fixture({wrongProject:true});await assert.rejects(foreign.run(),/Unexpected public web key project/);assert.equal(keyPatches(foreign).length,0);assert.equal(indexCalls(foreign).length,0);
});

test('an update is not accepted until a fresh key read contains the required restrictions',async()=>{
  const f=fixture({verifyMissing:true});await assert.rejects(f.run(),/restrictions have not finished updating/);assert.equal(indexCalls(f).length,0);
});

test('archive index read or create 403 warns clearly after required Picker checks, without failing release',async()=>{
  for(const options of [{indexReadDenied:true},{indexCreateDenied:true}]){
    const f=fixture(options);await f.run();assert.equal(f.warnings.length,1);
    assert.match(f.warnings[0],/^::warning::Optional Studio archive indexes:.*\(403\).*required Drive\/Picker checks passed/);
    assert.ok(f.logs.includes('Required Studio Auth, Drive and Picker prerequisites verified.'));
  }
});

test('CI runs the required setup without continue-on-error before Velum Hosting publication',()=>{
  const workflow=readFileSync(new URL('../../.github/workflows/firebase-deploy.yml',import.meta.url),'utf8');
  const job=workflow.slice(workflow.indexOf('  deploy_velum:'),workflow.indexOf('  deploy_luminary:'));
  const setup=job.match(/      - name: Verify required Velum Auth, Drive and Picker setup\r?\n[\s\S]*?(?=      - name:)/)?.[0];
  assert.ok(setup);assert.doesNotMatch(setup,/continue-on-error/);
  assert.match(setup,/node velum-gallery\/scripts\/configure-firebase-auth.mjs/);
  assert.ok(job.indexOf(setup)<job.indexOf('      - name: Create and deploy Velum secondary Hosting site'));
});
