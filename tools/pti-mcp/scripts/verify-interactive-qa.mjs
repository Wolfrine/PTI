// Practical broker operation against real owner storage. No model, browser or QA run.
// Uses normal administrator ADC through the SDK; never reads/prints credential files.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {initializeApp,applicationDefault,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {CodexRelay,FirestoreRelayStore,createCodexServer,OWNER} from '../dist/local-codex.js';

const args=process.argv.slice(2),argument=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
const output=argument('--output'),requestFile=argument('--request-file');
if(!output||!path.win32.isAbsolute(output)||!/^F:[\\/]/i.test(output))throw Error('Supply a physical F-drive --output path.');
if(requestFile&&!args.includes('--persist-handoff'))throw Error('Explicit --persist-handoff is required before creating a real request.');
const app=initializeApp({projectId:'pti-app-2ab59',credential:applicationDefault()},'interactive-qa-practical');
const db=getFirestore(app),server=createCodexServer(new CodexRelay(new FirestoreRelayStore(db)),OWNER);
const client=new Client({name:'interactive-qa-practical-local',version:'1'}),[serverTransport,clientTransport]=InMemoryTransport.createLinkedPair();
async function call(name,arguments_={}){const result=await client.callTool({name,arguments:arguments_});assert(!result.isError,result.content?.[0]?.text);return JSON.parse(result.content.find(c=>c.type==='text').text);}
try{
  await server.connect(serverTransport);await client.connect(clientTransport);
  const tools=(await client.listTools()).tools.map(t=>t.name),capabilities=await call('get_capabilities');
  assert.equal(capabilities.canPlayWithAudio,false);assert.equal(capabilities.browser.authorized,false);assert.equal(capabilities.audio.capture.state,'unsupported');
  let request;
  if(requestFile){
    assert(/^F:[\\/]/i.test(requestFile));const input=JSON.parse(fs.readFileSync(requestFile,'utf8'));
    request=await call('request_interactive_qa',input);
    assert.equal(request.status,'requires_handoff');assert.equal(request.run,null);assert.equal(request.receipt,null);
    assert.equal((await call('request_interactive_qa',input)).request_id,request.request_id);
    assert.deepEqual(await call('get_interactive_qa',{request_id:request.request_id}),request);
  }
  const evidence={observedAt:new Date().toISOString(),mock:false,surface:'local-built-hosted-MCP-with-production-Firestore',
    authBoundary:'Administrator ADC via SDK. This local operation does not verify the deployed OAuth/tool schema; the existing hosted deployment verifier does that separately.',
    tools,capabilities,request:request||null,desktopActivated:false,gameSeen:false,gameHeard:false,qaAccepted:false};
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({output,toolCount:tools.length,workerVersion:capabilities.workerVersion,canPlayWithAudio:false,requestId:request?.request_id,status:request?.status}));
}finally{await client.close().catch(()=>{});await server.close().catch(()=>{});await db.terminate();await deleteApp(app);}
