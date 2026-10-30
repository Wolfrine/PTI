import { test, expect } from 'vitest';
import { z } from 'zod';
import { registerChatCaptureTools } from './chat-capture.js';

function fixture(uid: string | undefined = 'owner') {
  const data = new Map<string,any>(), handlers = new Map<string,(arg:any)=>Promise<any>>();
  const doc = (path:string):any => ({path,id:path.split('/').at(-1),
    get:async()=>snap(path)});
  const snap=(path:string):any=>({exists:data.has(path),id:path.split('/').at(-1),
    data:()=>data.get(path)});
  const collection=(path:string):any=>({
    where:(field:string,op:string,value:string)=>({limit:(max:number)=>({get:async()=>({
      docs:[...data.entries()].filter(([key,v])=>key.startsWith(path+'/')&&!key.slice(path.length+1).includes('/')&&v[field]===value).slice(0,max)
        .map(([key,v])=>({id:key.split('/').at(-1),data:()=>v}))
    })})})
  });
  const db:any={doc,collection,runTransaction:async(fn:any)=>{
    const pending:(()=>void)[]=[];
    const tx={
      get:async(ref:any)=>snap(ref.path),
      create:(ref:any,val:any)=>pending.push(()=>{if(data.has(ref.path))throw Error('already exists');data.set(ref.path,val);}),
      update:(ref:any,val:any)=>pending.push(()=>{if(!data.has(ref.path))throw Error('not found');data.set(ref.path,{...data.get(ref.path),...val});}),
    };
    const out=await fn(tx);
    pending.forEach(f=>f());
    return out;
  }};
  const server:any={registerTool:(name:string,def:any,fn:any)=>{
    handlers.set(name,async(arg:any)=>fn(z.object(def.inputSchema).parse(arg)));
  }};
  registerChatCaptureTools(server,db,uid);
  const call=async(name:string,args:any)=>JSON.parse((await handlers.get(name)!(args)).content[0].text);
  return {data,call,uid};
}
const payload={recordingPolicy:'on',newConversation:true,turnId:'turn_alpha_001',
  title:'Harness capture',userText:'A prompt exactly.\nSecond line.',assistantText:'A prepared reply.\nNo rewrite.'};
const root='users/owner/trackerData/workspace';

test('one atomic call creates the first conversation and exact immutable turn',async()=>{
  const {data,call}=fixture();
  const first=await call('chat_capture_turn',payload);
  expect(first.ok).toBe(true);expect(first.duplicate).toBe(false);expect(first.turnCount).toBe(1);
  expect(first.harnessConversationId).toMatch(/^hc_[a-f0-9]{32}$/);
  const saved=data.get(root+'/chatTurns/turn_alpha_001');
  expect(saved.messages[0].content).toBe(payload.userText);
  expect(saved.messages[1].content).toBe(payload.assistantText);
  expect(saved.coverage.final_rendered_response_verified).toBe(false);
  expect(data.get(root+'/chatConversations/'+first.harnessConversationId).turnCount).toBe(1);
  expect([...data.keys()].filter(k=>k.includes('mcpAuditLog'))).toHaveLength(0);
  const context=await call('chat_get_context',{harnessConversationId:first.harnessConversationId});
  expect(context.recent[0].turnId).toBe(payload.turnId);
});

test('retried first save is idempotent, a later turn appends without replacing original',async()=>{
  const {data,call}=fixture();
  const first=await call('chat_capture_turn',payload);
  const retry=await call('chat_capture_turn',payload);
  expect(retry.duplicate).toBe(true);
  expect(retry.harnessConversationId).toBe(first.harnessConversationId);
  const next=await call('chat_capture_turn',{recordingPolicy:'on',harnessConversationId:first.harnessConversationId,
    turnId:'turn_alpha_002',title:'Harness capture',userText:'Next question',assistantText:'Next response'});
  expect(next.turnCount).toBe(2);
  expect(data.get(root+'/chatTurns/turn_alpha_001').messages[0].content).toBe(payload.userText);
  expect(data.get(root+'/chatConversations/'+first.harnessConversationId).turnCount).toBe(2);
  await expect(call('chat_capture_turn',{...payload,assistantText:'Tampered'})).rejects.toThrow('conflict');
  expect(data.get(root+'/chatConversations/'+first.harnessConversationId).turnCount).toBe(2);
});

test('unconsented, identity-ambiguous, oversized and unauthenticated calls cannot write',async()=>{
  const f=fixture();
  await expect(f.call('chat_capture_turn',{...payload,recordingPolicy:'off'})).rejects.toThrow();
  await expect(f.call('chat_capture_turn',{...payload,newConversation:false})).rejects.toThrow('Missing known chat ID');
  await expect(f.call('chat_capture_turn',{...payload,assistantText:'x'.repeat(700001)})).rejects.toThrow();
  expect(f.data.size).toBe(0);
  const other=fixture(undefined);
  await expect(other.call('chat_capture_turn',payload)).rejects.toThrow('authenticated owner');
});
