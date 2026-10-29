import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subscriptionEnvironment} from '../src/common.mjs';
test('subscription workers strip model API credential and endpoint overrides',()=>{
  const names=['OPENAI_API_KEY','CODEX_API_KEY','CODEX_ACCESS_TOKEN','OPENAI_BASE_URL','OPENAI_API_BASE'];
  const prior=Object.fromEntries(names.map(n=>[n,process.env[n]]));
  try{for(const name of names)process.env[name]='synthetic-test-override';const actual=subscriptionEnvironment();for(const name of names)assert.equal(actual[name],undefined);assert.equal(actual[Object.keys(actual).find(k=>k.toUpperCase()==='PATH')],process.env.PATH);}
  finally{for(const name of names){if(prior[name]===undefined)delete process.env[name];else process.env[name]=prior[name];}}
});
