import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {moduleParent} from '../src/chat-routing.mjs';
const cwd=fileURLToPath(new URL('../',import.meta.url)),threadId='01900000-0000-7000-8000-000000000071';
const job={threadId,chatRouting:{module_key:'local-codex'},affinityFallback:true};
const thread={id:threadId,cwd,modelProvider:'openai',status:{type:'notLoaded'}};
test('stored notLoaded parents are suitable, and archive lookup compares exact IDs through every metadata page',async()=>{
  const calls=[];
  const rpc=async(method,args)=>{calls.push({method,args});return method==='thread/read'?{thread}:{data:[],nextCursor:null};};
  assert.equal((await moduleParent(rpc,job,{path:cwd})).threadId,threadId);
  assert.equal(calls[0].args.includeTurns,false);assert.equal(calls[1].args.archived,true);assert.equal(calls[1].args.cwd,cwd);
  let page=0;
  const archived=await moduleParent(async method=>method==='thread/read'?{thread}:++page===1?{data:[{id:'other'}],nextCursor:'second'}:{data:[{id:threadId}],nextCursor:null},job,{path:cwd});
  assert.equal(archived.threadId,null);assert.equal(archived.reason,'archived');assert.equal(page,2);
});
test('only confirmed missing threads can fall back; transient/protocol errors and explicit sources stop',async()=>{
  const missing=Object.assign(Error('no rollout found for thread id'),{code:-32602});
  assert.deepEqual(await moduleParent(async()=>{throw missing;},job,{path:cwd}),{threadId:null,reason:'missing'});
  await assert.rejects(moduleParent(async()=>{throw missing;},{...job,affinityFallback:false},{path:cwd}),/no rollout/);
  for(const error of [Error('Codex thread/read timed out.'),Object.assign(Error('permission denied'),{code:-32602})])await assert.rejects(moduleParent(async()=>{throw error;},job,{path:cwd}),error);
});
test('cross-project, ephemeral, foreign-provider and child threads rotate only automatic affinity selections',async()=>{
  for(const change of [{cwd:fileURLToPath(new URL('../../',import.meta.url))},{ephemeral:true},{modelProvider:'foreign'},{parentThreadId:'a-parent'}]){
    const rpc=async()=>({thread:{...thread,...change}});
    assert.equal((await moduleParent(rpc,job,{path:cwd})).threadId,null);
    await assert.rejects(moduleParent(rpc,{...job,affinityFallback:false},{path:cwd}),/explicitly rotate/);
  }
});
test('archive lookup failure and nonadvancing cursors never silently create another parent',async()=>{
  await assert.rejects(moduleParent(async method=>{if(method==='thread/read')return {thread};throw Error('metadata unavailable');},job,{path:cwd}),/metadata unavailable/);
  await assert.rejects(moduleParent(async method=>method==='thread/read'?{thread}:{data:[],nextCursor:'same'},job,{path:cwd}),/did not advance/);
});
