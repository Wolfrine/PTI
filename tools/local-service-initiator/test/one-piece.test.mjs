import test from 'node:test';
import assert from 'node:assert/strict';
import {OnePieceHost,ONE_PIECE_GATEWAY,onePiecePollBody} from '../src/one-piece.mjs';
import {Initiator} from '../src/core.mjs';

const now=()=>Date.parse('2026-10-27T01:00:00Z');
const state=()=>({supervisorPid:123,health:{jellyfin:true,backend:true,mdns:true,caddy:true,checkedAt:new Date(now()).toISOString()}});
const config={nodeExecutable:'H:\\PTI-OnePiece\\tools\\node\\node.exe',runtimeRoot:'H:\\PTI-OnePiece\\runtime'};
function fixture(overrides={}){
 const starts=[],requests=[],scripts=[];let at=now();
 const host=new OnePieceHost({startOnePieceTask:async()=>starts.push('one-piece')},{now:()=>at,alive:()=>true,read:async file=>file.endsWith('config.json')?config:state(),
  fetchImpl:async(url,options)=>{requests.push({url,options});return new Response('{"status":"online"}');},
  run:async(script,input)=>{scripts.push({script,input});return 'False';},wait:async ms=>{at+=ms;},...overrides});
 return {host,starts,requests,scripts,advance:ms=>{at+=ms;},get elapsed(){return at-now();}};
}
test('only fresh actual companion health is published ready, using a fixed trusted URL',async()=>{
 const f=fixture();assert.equal(await f.host.ready(),true);assert.equal(f.requests[0].url,'https://pti-onepiece-home.duckdns.org:8443/api/health');
 assert.equal(f.requests[0].options.headers.Origin,'https://pti-app-2ab59-one-piece.web.app');assert.equal(f.requests[0].options.redirect,'error');
 assert.equal(ONE_PIECE_GATEWAY,'https://us-central1-pti-app-2ab59.cloudfunctions.net/onePieceHost');
 for(const bad of [null,{...state(),health:{...state().health,backend:false}},{...state(),health:{...state().health,checkedAt:'2026-10-27T00:58:00Z'}},{...state(),supervisorPid:'123'}]){
  const f=fixture({read:async()=>bad});assert.equal(await f.host.ready(),false);assert.equal(f.requests.length,0);
 }
 assert.equal(await fixture({alive:()=>false}).host.ready(),false);
 assert.equal(await fixture({fetchImpl:async()=>new Response('invalid')}).host.ready(),false);
 assert.equal(await fixture({fetchImpl:async()=>new Response('{}',{status:503})}).host.ready(),false);
 assert.equal(await fixture({fetchImpl:async()=>new Response('x'.repeat(4097))}).host.ready(),false);
});
test('a healthy companion is never started or restarted',async()=>{
 const f=fixture();await f.host.start();assert.deepEqual(f.starts,[]);assert.equal(f.scripts.length,0);
});
test('only a stopped configured companion can select the fixed hidden one-piece capability',async()=>{
 const f=fixture();let checks=0;f.host.ready=async()=>++checks>1;await f.host.start();
 assert.deepEqual(f.starts,['one-piece']);assert.ok(f.scripts[0].script.includes('launch-current.mjs'));
 assert.deepEqual(f.scripts[0].input,{pid:123});
});
test('a running or booting service is awaited without duplicate launch',async()=>{
 const f=fixture({run:async()=> 'True'});let checks=0;f.host.ready=async()=>++checks>2;await f.host.start();assert.equal(f.starts.length,0);
});
test('unexpected process identity, unsafe paths and invalid local responses fail closed',async()=>{
 for(const overrides of [{run:async()=> 'unexpected'},{run:async()=>{throw Error('configuration_invalid');}},
  {read:async file=>file.endsWith('config.json')?{...config,nodeExecutable:'F:\\arbitrary.exe'}:state()}]){
  const f=fixture(overrides);f.host.ready=async()=>false;await assert.rejects(f.host.start());assert.equal(f.starts.length,0);
 }
});
test('timeout reports failure and never stops, retries or restarts a companion',async()=>{
 const f=fixture();f.host.ready=async()=>false;await assert.rejects(f.host.start(),{message:'companion_start_timeout'});assert.deepEqual(f.starts,['one-piece']);
 assert.equal(f.elapsed,75000);
});

test('slow health probes, process inspection and fixed task invocation share one 75-second deadline',async()=>{
 const f=fixture();const budgets=[];
 f.host.ready=async options=>{budgets.push(options.timeoutMs);f.advance(options.timeoutMs);return false;};
 f.host.running=async()=>{f.advance(20000);return false;};
 f.host.host.startOnePieceTask=async()=>{f.starts.push('one-piece');f.advance(13000);};
 await assert.rejects(f.host.start(),{message:'companion_start_timeout'});
 assert.equal(f.elapsed,75000);assert.deepEqual(f.starts,['one-piece']);
 assert.ok(budgets.length<20);assert.ok(budgets.every(value=>value>0&&value<=2000));
 assert.equal(budgets.at(-1),1000);
});

test('expired inspection cannot launch late, and a healthy result after the deadline is not accepted',async()=>{
 const f=fixture();f.host.ready=async()=>false;f.host.running=async()=>{f.advance(75000);return false;};
 await assert.rejects(f.host.start(),{message:'companion_start_timeout'});assert.deepEqual(f.starts,[]);
 const slow=fixture();slow.host.ready=async()=>{slow.advance(75001);return true;};
 await assert.rejects(slow.host.start(),{message:'companion_start_timeout'});assert.deepEqual(slow.starts,[]);
});
test('shared recovery and helper failures map to the One Piece protocol on all ACK sends',async()=>{
 const id='9d4785eb-390d-4a84-8726-d9f68b9716ee';
 for(const failure of ['worker_start_timeout','model_unavailable','configuration_invalid','arbitrary private text']){
  let saved=null;const sent=[];
  const subject=new Initiator({api:async body=>{const value=onePiecePollBody(body);sent.push(value);return {service:{},request:{id,action:'start',expiresAt:new Date(now()+60000).toISOString()}};},
   read:async()=>saved,write:async value=>{saved=value;},start:async()=>{throw Error(failure);},workerRunning:async()=>false,now});
  await subject.tick();await subject.tick();
  for(const body of sent.filter(body=>body.lastStartResult))assert.ok(['companion_start_timeout','configuration_invalid','start_failed'].includes(body.lastStartResult.errorCode));
 }
 let saved={requestId:id};const sent=[];
 const subject=new Initiator({api:async body=>{sent.push(onePiecePollBody(body));return {service:{},request:{id,action:'start',expiresAt:new Date(now()+60000).toISOString()}};},
  read:async()=>saved,write:async value=>{saved=value;},start:async()=>{throw Error('must-not-launch');},workerRunning:async()=>false,now});
 await subject.tick();await subject.tick();assert.equal(sent.at(-1).lastStartResult.errorCode,'companion_start_timeout');
});
