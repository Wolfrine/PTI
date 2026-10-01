import {test,expect} from 'vitest';
import {z} from 'zod';
import {registerVentureTools} from './venture.js';

function fixture(){
 const data=new Map<string,any>(),handlers=new Map<string,any>();
 const makeRef=(path:string):any=>({path,collection:(name:string)=>({doc:(id:string)=>makeRef(path+'/'+name+'/'+id)}),get:async()=>({exists:data.has(path),data:()=>data.get(path)})});
 const db:any={doc:makeRef,runTransaction:async(fn:any)=>{const writes:any[]=[];await fn({get:async(r:any)=>({exists:data.has(r.path),data:()=>data.get(r.path)}),update:(r:any,v:any)=>writes.push(()=>data.set(r.path,{...data.get(r.path),...v})),create:(r:any,v:any)=>writes.push(()=>{if(data.has(r.path))throw Error('exists');data.set(r.path,v);})});writes.forEach(f=>f());}};
 const server:any={registerTool:(name:string,def:any,fn:any)=>handlers.set(name,async(input:any)=>fn(z.object(def.inputSchema).parse(input)))};
 registerVentureTools(server,db,'owner');
 const r='users/owner/ventureData/workspace';data.set(r+'/threads/t',{title:'Original'});data.set(r+'/branches/b',{threadId:'t',status:'rejected'});data.set(r+'/researchTasks/q',{threadId:'t',branchId:'b',question:'What would change this rejection?',status:'queued'});
 const call=async(name:string,input:any)=>JSON.parse((await handlers.get(name)(input)).content[0].text);
 return {data,r,call};
}
test('research claim and publication keep human states and prevent stale/duplicate writes',async()=>{
 const {data,r,call}=fixture();const claim=await call('venture_claim_research',{taskId:'q'});await expect(call('venture_claim_research',{taskId:'q'})).rejects.toThrow('already claimed');
 const payload={taskId:'q',claimToken:claim.claimToken,status:'completed',summary:'Still no verified willingness to pay.',findings:[{title:'Demand remains unproven',summary:'A smaller test is needed.',stance:'challenges',evidenceType:'inference'}]};
 const published=await call('venture_publish_research',payload),again=await call('venture_publish_research',payload);expect(again.findingIds).toEqual(published.findingIds);expect([...data.keys()].filter(k=>k.includes('/findings/'))).toHaveLength(1);expect(data.get(r+'/branches/b').status).toBe('rejected');expect(data.get(r+'/threads/t').title).toBe('Original');
 await expect(call('venture_publish_research',{...payload,claimToken:'00000000-0000-4000-8000-000000000000'})).rejects.toThrow('claim changed');
});
test('account boundary and source evidence requirements are enforced',async()=>{
 const {call}=fixture();await expect(call('venture_claim_research',{uid:'someone-else',taskId:'q'})).rejects.toThrow('outside');const c=await call('venture_claim_research',{taskId:'q'});
 await expect(call('venture_publish_research',{taskId:'q',claimToken:c.claimToken,status:'completed',summary:'Unsupported',findings:[{title:'Claim',summary:'Supposed fact',stance:'supports',evidenceType:'fact'}]})).rejects.toThrow();
});
