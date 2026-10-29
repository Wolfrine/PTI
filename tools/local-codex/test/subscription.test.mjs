import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {subscriptionEnvironment,write} from '../src/common.mjs';
test('subscription workers strip model API credential and endpoint overrides',()=>{
  const names=['OPENAI_API_KEY','CODEX_API_KEY','CODEX_ACCESS_TOKEN','OPENAI_BASE_URL','OPENAI_API_BASE'];
  const prior=Object.fromEntries(names.map(n=>[n,process.env[n]]));
  try{for(const name of names)process.env[name]='synthetic-test-override';const actual=subscriptionEnvironment();for(const name of names)assert.equal(actual[name],undefined);assert.equal(actual[Object.keys(actual).find(k=>k.toUpperCase()==='PATH')],process.env.PATH);}
  finally{for(const name of names){if(prior[name]===undefined)delete process.env[name];else process.env[name]=prior[name];}}
});
test('atomic state replacement survives transient Windows sharing locks and preserves old state on failure',()=>{
 const directory=fileURLToPath(new URL('../test-data/atomic/',import.meta.url));fs.mkdirSync(directory,{recursive:true});const file=directory+'state.json';write(file,{value:'old'});
 const rename=fs.renameSync;let attempts=0;
 try{fs.renameSync=(...args)=>{if(attempts++<2)throw Object.assign(Error('sharing lock'),{code:'EPERM'});return rename(...args);};write(file,{value:'new'});assert.equal(attempts,3);assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).value,'new');
 fs.renameSync=()=>{throw Object.assign(Error('sharing lock'),{code:'EPERM'});};assert.throws(()=>write(file,{value:'lost'}),/sharing lock/);assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).value,'new');assert.deepEqual(fs.readdirSync(directory),['state.json']);}
 finally{fs.renameSync=rename;}
});
