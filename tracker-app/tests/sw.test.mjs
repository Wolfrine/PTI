import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const script=await readFile(new URL('../sw.js',import.meta.url),'utf8');
function worker({offline=false}={}){
 const handlers={},calls=[],saved=[];
 class Request{
  constructor(input,options={}){Object.assign(this,typeof input==='string'?{url:new URL(input,'https://tracker.test/').href}:input,options)}
 }
 const fresh={ok:true,body:'current shell',clone(){return this}};
 const stale={body:'old cached shell'};
 const context={
  Request,URL,
  self:{location:{origin:'https://tracker.test'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}},
  location:{origin:'https://tracker.test'},
  caches:{
   open:async()=>({addAll:async requests=>calls.push(...requests),put:async(request,response)=>saved.push({request,response})}),
   match:async input=>typeof input==='string'?stale:stale,
   keys:async()=>[],delete:async()=>true
  },
  fetch:async request=>{calls.push(request);if(offline)throw new Error('offline');return fresh}
 };
 vm.runInNewContext(script,context);
 return {handlers,calls,saved,fresh,stale};
}
test('shell install bypasses stale HTTP cache for every precached asset',async()=>{
 const w=worker();let task;w.handlers.install({waitUntil:p=>task=p});await task;
 assert.ok(w.calls.length>=8);assert.ok(w.calls.every(r=>r.cache==='reload'));
});
test('navigation refreshes the shell instead of serving an older cached index',async()=>{
 const w=worker(),pending=[];let response;
 w.handlers.fetch({request:{url:'https://tracker.test/',method:'GET',mode:'navigate'},respondWith:p=>response=p,waitUntil:p=>pending.push(p)});
 assert.equal(await response,w.fresh);await Promise.all(pending);
 assert.equal(w.calls[0].cache,'no-cache');assert.equal(w.saved[0].response,w.fresh);
});
test('navigation retains an offline shell when network refresh fails',async()=>{
 const w=worker({offline:true});let response;
 w.handlers.fetch({request:{url:'https://tracker.test/',method:'GET',mode:'navigate'},respondWith:p=>response=p,waitUntil:()=>{}});
 assert.equal(await response,w.stale);
});
