import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
function offline(match){
 const handlers={};
 runInNewContext(source,{self:{location:{origin:'https://velum.test'},addEventListener:(name,fn)=>{handlers[name]=fn;}},
  caches:{match},fetch:async()=>{throw new Error('offline');},Response,URL});
 return async request=>{let response;handlers.fetch({request,respondWith:value=>{response=value;}});return response;};
}
test('offline release-versioned scripts resolve to the installed canonical shell',async()=>{
 const handle=offline(async(request,options)=>{
  assert.equal(request.url,'https://velum.test/bootstrap.js?v=release-2');assert.equal(options.ignoreSearch,true);
  return new Response('installed bootstrap source');
 });
 const result=await handle({url:'https://velum.test/bootstrap.js?v=release-2',method:'GET',mode:'cors'});
 assert.equal(await result.text(),'installed bootstrap source');
});
test('missing offline scripts fail instead of receiving HTML as executable source',async()=>{
 const handle=offline(async()=>undefined);
 const result=await handle({url:'https://velum.test/absent.mjs?v=release-2',method:'GET',mode:'cors'});
 assert.equal(result.type,'error');
});
test('offline navigations retain the installed index fallback',async()=>{
 const handle=offline(async request=>request==='./index.html'?new Response('<main>installed shell</main>'):undefined);
 const result=await handle({url:'https://velum.test/phone?v=release-2',method:'GET',mode:'navigate'});
 assert.match(await result.text(),/installed shell/);
});
