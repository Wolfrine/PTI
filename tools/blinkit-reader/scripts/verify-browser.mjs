// Synthetic localhost API acceptance only. Never opens Blinkit/Morsel, reads an
// owner profile, or establishes real source/import acceptance.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {BrowserRuntime} from '../src/browser.mjs';
const flag=name=>process.argv[process.argv.indexOf(name)+1];
if(!process.argv.includes('--scratch')||!process.argv.includes('--chrome'))throw Error('Supply --scratch F:\\... and --chrome installed-browser-path.');
const scratch=resolve(flag('--scratch'));
if(!/^F:\\/i.test(scratch))throw Error('Browser verification artifacts must be on F.');
await mkdir(scratch,{recursive:true});
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Synthetic WebMCP API verification</title>');});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const runtime=new BrowserRuntime({profile:resolve(scratch,'synthetic-profile'),chromePath:flag('--chrome')});
try{
 await runtime.open();const page=await runtime.context.newPage();
 await page.goto('http://127.0.0.1:'+server.address().port);
 // Inject the test surface, not another site's tools or a production auth bypass.
 runtime.surface=async()=>page;
 const register=async suffix=>page.evaluate(async suffix=>{
  window.syntheticLifetime?.abort();window.syntheticLifetime=new AbortController();
  await document.modelContext.registerTool({name:'get_session__'+suffix,description:'Synthetic read-only API fixture',inputSchema:{type:'object'},annotations:{readOnlyHint:true},execute:()=>({structuredContent:{ok:true,session:{login:{kind:'logged_in'}},result:{synthetic:true}}})},{signal:window.syntheticLifetime.signal});
 },suffix);
 await register('fixture_one');
 assert.deepEqual((await runtime.tools('blinkit')).map(t=>t.name),['get_session__fixture_one']);
 const first=JSON.parse(await runtime.call('blinkit','get_session',{}));assert.equal(first.structuredContent.result.synthetic,true);
 await register('fixture_two');
 assert.deepEqual((await runtime.tools('blinkit')).map(t=>t.name),['get_session__fixture_two']);
 assert.equal(JSON.parse(await runtime.call('blinkit','get_session',{})).structuredContent.ok,true);
 await assert.rejects(runtime.call('blinkit','add_to_cart',{}),/read_only_boundary/);
 await page.evaluate(()=>window.syntheticLifetime.abort());
 await assert.rejects(runtime.call('blinkit','get_session',{}),/tool_unavailable/);
 await page.evaluate(()=>document.modelContext.registerTool({name:'get_session__pending_fixture',description:'Synthetic interrupted read',inputSchema:{type:'object'},execute:(_, {signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))}));
 const interrupted=assert.rejects(runtime.call('blinkit','get_session',{}));
 await new Promise(done=>setTimeout(done,100));await runtime.close();await interrupted;
 console.log('PASS: installed Chrome WebMCP discovery, actual execution/string envelope, suffix rediscovery, lifecycle removal, interrupted read and read-only boundary. Synthetic localhost only; no owner/source/import acceptance.');
}finally{await runtime.close();await new Promise(done=>server.close(done));}
