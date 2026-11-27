import fs from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import {project,read,task,taskDir,view,write} from './common.mjs';
import {withCodex} from './codex-history.mjs';

const threadId=z.string().uuid(), id=z.string().regex(/^[a-f0-9]{32}$/);
const input=z.string().min(1).max(12000);
export const nativeControlSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('goal_get')}).strict(),
  z.object({action:z.literal('goal_set'),objective:input.optional(),status:z.enum(['active','paused']),tokenBudget:z.number().int().positive().optional()}).strict(),
  z.object({action:z.literal('goal_clear')}).strict(),
  z.object({action:z.enum(['steer','queue']),expectedTurnId:threadId,prompt:input}).strict(),
]);
export const controlDeliverySchema={
  operation_id:id,task_id:id,generation:z.number().int().positive(),thread_id:threadId,
  created_at:z.number().int().positive(),project:z.string(),mode:z.enum(['inspect','edit']),control:nativeControlSchema,
};
const terminal=['completed','failed','interrupted'];
const failed=error=>({status:'failed',error});
const uncertain={status:'unknown',error:'Native control was attempted without a durable acknowledgement. Reconcile this operation and native thread before sending new input.'};
const clientMessageId=id=>[id.slice(0,8),id.slice(8,12),id.slice(12,16),id.slice(16,20),id.slice(20)].join('-');

export async function executeNativeControl(rpc,threadId,operationId,control) {
  const {action,expectedTurnId,prompt,...options}=control;
  if(action==='goal_get')return rpc('thread/goal/get',{threadId});
  if(action==='goal_set')return rpc('thread/goal/set',{threadId,...options,origin:'user'});
  if(action==='goal_clear')return rpc('thread/goal/clear',{threadId,origin:'user'});
  const params={threadId,clientUserMessageId:clientMessageId(operationId),input:[{type:'text',text:prompt}]};
  if(action==='steer'){
    const result=await rpc('turn/steer',{...params,expectedTurnId});
    if(result?.turnId!==expectedTurnId)throw Error('Native steer returned a different turn.');
    return {turnId:result.turnId,clientUserMessageId:params.clientUserMessageId};
  }
  const {queuedSubmission}=await rpc('thread/queue/add',params);
  if(!queuedSubmission?.id||queuedSubmission.clientUserMessageId!==params.clientUserMessageId)throw Error('Native queue acknowledgement did not match this message.');
  return {queuedSubmissionId:queuedSubmission.id,clientUserMessageId:params.clientUserMessageId};
}

export async function deliverNativeControl(args) {
  const job=view(task(args.task_id)),target=project(args.project);
  if(job.relayGeneration!==args.generation||job.threadId!==args.thread_id||job.project!==args.project||
    job.mode!==args.mode||job.cwd.toLowerCase()!==target.path.toLowerCase()||!job.executionPolicy){
    return failed('The selected task, generation, project, mode or native thread no longer matches.');
  }
  const {control,operation_id}=args;
  const directory=path.join(taskDir(job.id),'control-'+operation_id);
  const request=path.join(directory,'request.json'),receipt=path.join(directory,'receipt.json');
  const live=['running','waiting_for_user'].includes(job.status)&&job.nativeControls===true;
  if(fs.existsSync(receipt))return read(receipt);
  if(fs.existsSync(directory)){
    const recorded=fs.existsSync(request)?read(request):null;
    if(recorded?.route==='live'&&!live&&!fs.existsSync(path.join(directory,'attempted.json'))&&terminal.includes(job.status)){
      return failed('The native task settled before this control could be sent.');
    }
    if(!recorded||recorded.route==='saved'||!live)return uncertain;
    return {status:'running'};
  }
  if(control.expectedTurnId&&(!live||job.activeTurnId!==control.expectedTurnId))return failed('The exact native turn is no longer active. Read the task and select the intended turn or continue the saved thread.');
  if(control.action==='goal_set'&&control.status==='active'&&job.collaborationMode==='plan')return failed('Approve the completed native plan and continue that thread in execution mode to activate a Goal.');
  if(control.action==='goal_set'&&control.status==='active'&&(!live||!job.turnId))return failed('Start or continue the authorized outcome before activating its Goal. A saved Goal can be set to paused.');
  try{fs.mkdirSync(directory);}catch(error){if(error.code==='EEXIST')return uncertain;throw error;}
  const route=live?'live':'saved';
  write(request,{...args,route},{durable:true});
  if(live)return {status:'running'};
  const result=await controlResult(async()=>withCodex(async rpc=>{
    const {thread}=await rpc('thread/read',{threadId:args.thread_id,includeTurns:false});
    if(thread?.id!==args.thread_id||typeof thread.cwd!=='string'||fs.realpathSync.native(thread.cwd).toLowerCase()!==target.path.toLowerCase()){
      throw Object.assign(Error('The saved native thread is outside the selected project.'),{code:-32602});
    }
    return executeNativeControl(rpc,args.thread_id,operation_id,control);
  }));
  write(receipt,result,{durable:true});return result;
}

export async function controlResult(operation){
  try{return {status:'completed',result:await operation()};}
  catch(error){
    // A native validation rejection is conclusive. Internal/transport errors can
    // follow partial persistence and must never cause replay.
    return [-32600,-32601,-32602].includes(error.code)?failed(error.message):{...uncertain,error:error.message};
  }
}

export function attachNativeControls({directory,job,rpc,save,settle}){
  const turns=new Map(),queued=new Map();
  let busy=false,goalStatus=null;
  const belongs=turnId=>turns.has(turnId);
  const observing=()=>busy||queued.size>0||goalStatus==='active'||!!job.activeTurnId;
  function recordGoal(goal){
    job.goal=goal?.threadId===job.threadId?goal:null;
    goalStatus=job.goal?.status||null;job.goalStatus=goalStatus;save();
  }
  function event(message){
    const {method,params:p}=message;
    if(!p||p.threadId!==job.threadId)return;
    if(method==='thread/goal/updated'||method==='thread/goal/cleared'){
      recordGoal(p.goal);settle();return;
    }
    if(method==='turn/started'&&p.turn?.id){
      const turnId=p.turn.id;
      if(!job.nativeTurnDispatchAttempted)return;
      job.activeTurnId=turnId;
      turns.set(turnId,{turn_id:turnId,status:'inProgress'});
      save();return;
    }
    if((method==='item/started'||method==='item/completed')&&p.item?.type==='userMessage'&&queued.has(p.item.clientId)){
      queued.get(p.item.clientId).turnId=p.turnId;
      const turn=turns.get(p.turnId);
      if(turn)turn.client_message_id=p.item.clientId;
    }
    if(method==='turn/completed'&&belongs(p.turn?.id)&&terminal.includes(p.turn.status)){
      const {id:turnId,status}=p.turn;
      for(const item of p.turn.items||[]){
        if(item.type!=='userMessage'||!queued.has(item.clientId))continue;
        queued.get(item.clientId).turnId=turnId;
        turns.get(turnId).client_message_id=item.clientId;
      }
      turns.get(turnId).status=status;
      if(job.activeTurnId===turnId)job.activeTurnId=null;
      if(status==='interrupted')queued.clear(); // Codex preserves and pauses its queue.
      else for(const [client,delivery] of queued)if(delivery.turnId===turnId)queued.delete(client);
      job.observedTurns=[...turns.values()].slice(-20);
      save();
    }
  }
  async function service(){
    if(busy||!job.nativeControls)return;
    busy=true;
    try{
      const entries=fs.readdirSync(directory).filter(name=>/^control-[a-f0-9]{32}$/.test(name)).flatMap(name=>{
        const location=path.join(directory,name),request=path.join(location,'request.json');
        const receipt=path.join(location,'receipt.json'),attempted=path.join(location,'attempted.json');
        if(fs.existsSync(receipt)||!fs.existsSync(request))return [];
        const {route,...raw}=read(request);
        return route==='live'?[{name,receipt,attempted,args:z.object(controlDeliverySchema).strict().parse(raw)}]:[];
      }).sort((a,b)=>a.args.created_at-b.args.created_at||a.name.localeCompare(b.name));
      for(const {name,receipt,attempted,args} of entries){
        const {control}=args;
        if(fs.existsSync(attempted)){write(receipt,uncertain,{durable:true});continue;}
        if(args.task_id!==job.id||args.generation!==job.relayGeneration||args.thread_id!==job.threadId||
          args.mode!==job.mode||args.project!==job.project||name!=='control-'+args.operation_id||
          (control.expectedTurnId&&control.expectedTurnId!==job.activeTurnId)){
          write(receipt,failed('The selected native turn or authorization no longer matches.'),{durable:true});continue;
        }
        write(attempted,{at:new Date().toISOString()},{durable:true});
        const clientId=clientMessageId(args.operation_id);
        if(control.action==='queue')queued.set(clientId,{turnId:null,unknown:false});
        const outcome=await controlResult(()=>executeNativeControl(rpc,job.threadId,args.operation_id,control));
        if(control.action==='queue'){
          if(outcome.status==='failed')queued.delete(clientId);
          const delivery=queued.get(clientId);
          if(delivery)delivery.unknown=outcome.status==='unknown';
        }
        if(outcome.status==='completed'&&control.action.startsWith('goal_')){
          recordGoal(outcome.result.goal);
        }
        write(receipt,outcome,{durable:true});
      }
      if(!job.activeTurnId){
        for(const [client,delivery] of queued){
          // A lost reply is never resent. The exact queue or user message may
          // still prove admission. With no proof, leave that control unknown.
          if(!delivery.unknown||delivery.turnId)continue;
          const list=await rpc('thread/queue/list',{threadId:job.threadId});
          if(list.data.some(item=>item.clientUserMessageId===client))delivery.unknown=false;
          else if(!list.nextCursor)queued.delete(client);
        }
      }
    }finally{busy=false;settle();}
  }
  return {event,service,observing,recordGoal};
}
