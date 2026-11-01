import express from 'express';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserIdentity } from './oauth.js';

export const MORSEL_ORIGIN='https://pti-app-2ab59-morsel.web.app';
const names=['food_blinkit_context','food_blinkit_ingest','food_blinkit_sync'];
const requestSchema=z.object({action:z.enum(['capabilities','context','ingest','sync']),args:z.record(z.string(),z.unknown()).default({})}).strict();
const batchSchema=z.object({records:z.array(z.record(z.string(),z.unknown())).min(1).max(10)}).strict();
function code(message:string){
  return /paused/i.test(message)?'ingestion_paused':/revision|conflict|later capture/i.test(message)?'revision_conflict':/outside food scope/i.test(message)?'outside_food_scope':'invalid_or_unavailable';
}
export function morselBlinkitRouter(options:{
  verifyIdentity:(token:string)=>Promise<UserIdentity>;
  checkUser:(uid:string,authenticatedAt:number)=>Promise<void>;
  createServer:(context:{uid:string;email:string;actor:string;taskReference:string;transport:string})=>McpServer;
}){
  const router=express.Router();
  router.use((req,res,next)=>{
    if(req.get('origin')!==MORSEL_ORIGIN){res.status(403).json({ok:false,error:{code:'origin_denied'}});return;}
    res.set({'Access-Control-Allow-Origin':MORSEL_ORIGIN,'Vary':'Origin','Cache-Control':'no-store'});
    if(req.method==='OPTIONS'){
      if(req.get('access-control-request-method')!=='POST'||(req.get('access-control-request-headers')||'').split(',').some(h=>h.trim()&&!['authorization','content-type'].includes(h.trim().toLowerCase()))){res.status(403).end();return;}
      res.set({'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'300'}).status(204).end();return;
    }next();
  });
  router.post('/',async(req,res,next)=>{
    try{
      const bearer=/^Bearer ([^\s]{1,12000})$/.exec(req.get('authorization')||'');
      if(!bearer){res.status(401).json({ok:false,error:{code:'sign_in_required'}});return;}
      const identity=await options.verifyIdentity(bearer[1]);
      await options.checkUser(identity.uid,identity.authenticatedAt);
      res.locals.identity=identity;next();
    }catch{res.status(403).json({ok:false,error:{code:'owner_authorization_required'}});}
  },express.json({limit:'256kb',strict:true}),async(req,res)=>{
    const parsed=requestSchema.safeParse(req.body);
    if(!parsed.success){res.status(400).json({ok:false,error:{code:'invalid_request'}});return;}
    const {action,args}=parsed.data,identity=res.locals.identity as UserIdentity;
    if('uid' in args){res.status(400).json({ok:false,error:{code:'server_bound_account'}});return;}
    const batch=action==='ingest'?batchSchema.safeParse(args):null;
    if(batch&&!batch.success){res.status(400).json({ok:false,error:{code:'bounded_records_required'}});return;}
    if(batch?.success&&batch.data.records.some(r=>'uid' in r)){res.status(400).json({ok:false,error:{code:'server_bound_account'}});return;}
    const server=options.createServer({...identity,actor:'Morsel page WebMCP',taskReference:'owner-authorized-blinkit-import',transport:'morsel-page'});
    const client=new Client({name:'morsel-page-bridge',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
    try{
      await Promise.all([server.connect(a),client.connect(b)]);
      const call=async(name:string,input:Record<string,unknown>)=>{
        const result=await client.callTool({name,arguments:input});
        const value=(result.content as any[]).find(c=>c.type==='text')?.text||'';
        return result.isError?{ok:false,error:{code:code(value)}}:JSON.parse(value);
      };
      if(action==='capabilities'){
        const tools=(await client.listTools()).tools.filter(t=>names.includes(t.name)).map(t=>{
          const inputSchema=structuredClone(t.inputSchema);delete inputSchema.properties?.uid;
          return {name:t.name,description:t.description,inputSchema,annotations:t.annotations};
        });
        const context=await call('food_blinkit_context',{limit:1});
        if(typeof context.ingestionPaused!=='boolean'){res.status(503).json({ok:false,error:{code:'service_unavailable'}});return;}
        res.json({ok:true,tools,ingestionPaused:context.ingestionPaused});
      }else if(action==='ingest'&&batch?.success){
        const results=[];
        for(const [index,record]of batch.data.records.entries()){
          if(req.destroyed&&!req.complete)break;
          results.push({index,...await call('food_blinkit_ingest',record)});
        }
        res.json({ok:results.every(r=>r.ok),results,processed:results.length});
      }else res.json(await call('food_blinkit_'+action,args));
    }catch{if(!res.headersSent)res.status(503).json({ok:false,error:{code:'service_unavailable'}});}
    finally{await client.close().catch(()=>{});await server.close().catch(()=>{});}
  });
  router.all('/',(_req,res)=>res.set('Allow','POST, OPTIONS').status(405).end());
  router.use(((error:any,_req:any,res:any,_next:any)=>res.status(error?.type==='entity.too.large'?413:400).json({ok:false,error:{code:'invalid_or_oversized_request'}})) as express.ErrorRequestHandler);
  return router;
}
