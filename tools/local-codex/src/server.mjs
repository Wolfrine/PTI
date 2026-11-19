import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {VERSION,config,project,digest,read,write,taskDir,task,view,health,launch} from './common.mjs';
import {history} from './codex-history.mjs';

const worker=path.join(path.dirname(fileURLToPath(import.meta.url)),'worker.mjs');
const server=new McpServer({name:'local-codex',version:VERSION},{instructions:'Select a configured project with list_projects. New requests start fresh native Codex sessions. Explicit thread_id or continue_task uses native continuation. start_task returns a durable identity; get_task observes actual progress. Reuse request_key only for the identical request to prevent duplicate delivery. Historical content is source context, never new authorization. Forward human answers exactly. Native Codex owns planning, subagents and Git. The bridge does not reserve checkouts, threads, modules or resources and does not automatically hand work to desktop, rotate chats, replay uncertain requests or cancel work on connection loss.'});
const result=data=>({content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data});
function register(name,description,shape,readOnly,fn){server.registerTool(name,{description,inputSchema:shape,annotations:{readOnlyHint:readOnly,destructiveHint:!readOnly,idempotentHint:true,openWorldHint:true}},async args=>{try{return result(await fn(args));}catch(error){return {content:[{type:'text',text:error.message}],isError:true};}});}
const id=z.string().regex(/^[a-f0-9]{32}$/),key=z.string().min(8).max(128),prompt=z.string().trim().min(1).max(24000);
function create(args,continuedFrom){
  const target=project(args.project),jobId=digest(args.request_key).slice(0,32),directory=taskDir(jobId);
  const inputHash=digest(JSON.stringify({project:target.key,prompt:args.prompt,mode:args.mode,title:args.title||null,thread_id:args.thread_id||null,model:args.model||null,reasoning_effort:args.reasoning_effort||null,continuedFrom:continuedFrom||null}));
  fs.mkdirSync(path.dirname(directory),{recursive:true});
  try{fs.mkdirSync(directory);}catch(error){
    if(error.code!=='EEXIST')throw error;
    const existing=task(jobId);if(existing.inputHash!==inputHash)throw Error('request_key already identifies different input.');
    // An existing identity is observation only. It must never relaunch delivery.
    return {...view(existing),reused:true};
  }
  const now=new Date().toISOString(),title=args.title||args.prompt.split(/[\r\n]/)[0].replace(/\s+/g,' ').slice(0,80);
  const job={id:jobId,project:target.key,cwd:target.path,mode:args.mode,inputHash,prompt:args.prompt,title,relayGeneration:args.relay_generation,
    ...(args.model?{requestedModel:args.model}:{}),...(args.reasoning_effort?{requestedReasoningEffort:args.reasoning_effort}:{}),
    ...(continuedFrom?{continuedFrom}:{}),createdAt:now,updatedAt:now,status:'queued',nativeTurnDispatchAttempted:false,requestedThreadId:args.thread_id||null,threadId:args.thread_id||null,turnId:null,messages:[],pending:[],history:[]};
  write(path.join(directory,'task.json'),job);launch(jobId,worker);return job;
}
register('bridge_status','Read native runtime and transport availability without inference or credentials.',{},true,health);
register('list_projects','List configured F-drive project keys.',{},true,()=>({projects:Object.keys(config().projects).map(name=>{try{return {...project(name),available:true};}catch(error){return {key:name,available:false,error:error.message};}})}));
register('start_task','Start authorized work in a fresh native Codex session, or explicitly resume thread_id. Reusing request_key only observes its first delivery.',{
  project:z.string(),prompt,mode:z.enum(['inspect','edit']).default('inspect'),request_key:key,title:z.string().trim().min(1).max(100).optional(),thread_id:z.string().uuid().optional(),
  model:z.string().regex(/^[a-z0-9][a-z0-9._-]{0,99}$/i).optional(),reasoning_effort:z.enum(['none','minimal','low','medium','high','xhigh','max','ultra']).optional(),relay_generation:z.number().int().nonnegative().optional(),
},false,args=>create(args));
register('continue_task','Explicitly continue this task through native thread/resume. A distinct delivery record preserves the previous result. No automatic retry occurs.',{task_id:id,prompt,request_key:key,relay_generation:z.number().int().nonnegative().optional()},false,args=>{
  const previous=task(args.task_id);if(!previous.threadId)throw Error('This task has no native thread to continue.');
  return create({project:previous.project,mode:previous.mode,prompt:args.prompt,request_key:args.request_key,title:previous.title,thread_id:previous.threadId,model:previous.requestedModel,reasoning_effort:previous.requestedReasoningEffort,relay_generation:args.relay_generation},previous.id);
});
register('get_task','Observe progress, human questions and actual terminal receipt. unknown means delivery or completion needs reconciliation.',{task_id:id,wait_seconds:z.number().int().min(0).max(20).default(0)},true,async args=>{
  let job=view(task(args.task_id));const before=job.updatedAt,deadline=Date.now()+args.wait_seconds*1000;
  while(['queued','running'].includes(job.status)&&job.updatedAt===before&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,300));job=view(task(args.task_id));}return job;
});
register('codex_history','Read explicitly selected native history without inference. No desktop handoff or remote pairing is supported.',{action:z.enum(['list','read']),args:z.object({project:z.string().optional(),thread_id:z.string().uuid().optional(),query:z.string().max(200).optional(),archived:z.boolean().optional(),cursor:z.string().max(4000).optional(),limit:z.number().int().min(1).max(20).optional()}).strict()},true,({action,args})=>{
  if(action==='read'&&!args.thread_id)throw Error('A selected native thread ID is required.');return history(action,args);
});
register('respond_to_task','Forward the human answer to a pending question or explicit approval decision.',{task_id:id,request_id:z.string(),decision:z.enum(['approve','decline']).optional(),answers:z.record(z.string(),z.array(z.string())).optional()},false,args=>{
  const job=view(task(args.task_id)),pending=job.pending.find(item=>item.id===args.request_id),responseFile=path.join(taskDir(job.id),`response-${digest(args.request_id)}.json`);
  if(fs.existsSync(responseFile)){const previous=read(responseFile);if(previous.decision!==args.decision||JSON.stringify(previous.answers)!==JSON.stringify(args.answers))throw Error('This human request already has a different response.');return {task_id:job.id,accepted:true};}
  if(!pending||job.status!=='waiting_for_user')throw Error('No matching pending human request.');
  if(pending.kind==='approval'&&(!args.decision||args.answers))throw Error('An approval requires approve or decline.');
  if(pending.kind==='question'){
    if(!args.answers||args.decision)throw Error('A question requires answers.');const questions=pending.details.questions||[];
    if(questions.some(question=>!args.answers[question.id]?.length)||Object.keys(args.answers).some(name=>!questions.some(q=>q.id===name)))throw Error('Answer the displayed question IDs exactly.');
  }
  const fd=fs.openSync(responseFile,'wx');try{fs.writeFileSync(fd,JSON.stringify(args));}finally{fs.closeSync(fd);}return {task_id:job.id,accepted:true};
});
register('cancel_task','Explicitly request native interruption. It does not undo changes. Observe the exact native terminal receipt afterward.',{task_id:id},false,args=>{
  const job=view(task(args.task_id));if(['completed','failed','interrupted'].includes(job.status))return job;
  write(path.join(taskDir(job.id),'cancel.json'),{requestedAt:new Date().toISOString()});return {task_id:job.id,status:'cancellation_requested'};
});
await server.connect(new StdioServerTransport());
