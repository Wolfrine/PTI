import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dependencyRequire=createRequire(new URL('../pti-mcp/package.json',import.meta.url));
const sdk=(path)=>import(pathToFileURL(dependencyRequire.resolve(path)).href);
const MAX_RESULT_BYTES=4*1024*1024;

export function validateRequest(request,now=Date.now()){
  if(!request||request.schemaVersion!==1)throw new Error('Unsupported request schema.');
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(request.requestId??''))throw new Error('Invalid request ID.');
  if(typeof request.purpose!=='string'||request.purpose.trim().length<10||request.purpose.length>2000)throw new Error('A concrete user-directed purpose is required.');
  const expiry=Date.parse(request.expiresAt);
  if(!Number.isFinite(expiry)||expiry<=now||expiry>now+24*60*60*1000)throw new Error('Request must expire within the next 24 hours.');
  if(!['read','write'].includes(request.mode))throw new Error('Specify read or write mode.');
  if(!['call','verify'].includes(request.kind))throw new Error('Specify call or verify kind.');
  if(request.kind==='verify'){
    if(request.mode!=='write')throw new Error('The temporary CRUD verification requires write mode.');
    return request;
  }
  if(!Array.isArray(request.calls)||request.calls.length<1||request.calls.length>10)throw new Error('Provide between 1 and 10 tool calls.');
  for(const call of request.calls){
    if(!call||typeof call.name!=='string'||!call.arguments||typeof call.arguments!=='object'||Array.isArray(call.arguments))throw new Error('Each tool call requires a name and arguments object.');
  }
  return request;
}

function parseToolJson(result){
  const block=result.content?.find(item=>item.type==='text');
  if(!block)throw new Error('Tool did not return JSON text.');
  return JSON.parse(block.text);
}

export async function executeRequest(client,request){
  validateRequest(request);
  const tools=[];let cursor;
  do{
    const page=await client.listTools(cursor?{cursor}:{});
    tools.push(...page.tools);cursor=page.nextCursor;
    if(tools.length>1000)throw new Error('Unexpected tool catalog size.');
  }while(cursor);
  const catalog=new Map(tools.map(tool=>[tool.name,tool]));
  const results=[];let bytes=0;
  const invoke=async(name,args)=>{
    const tool=catalog.get(name);
    if(!tool)throw new Error(`Unadvertised MCP tool: ${name}`);
    if(request.mode!=='write'&&tool.annotations?.readOnlyHint!==true)throw new Error(`Write mode required for ${name}.`);
    const entry={name,outcome:'unknown'};results.push(entry);
    try{
      const result=await client.callTool({name,arguments:args},undefined,{timeout:60000});
      entry.outcome=result.isError?'tool-error':'completed';
      bytes+=Buffer.byteLength(JSON.stringify(result));
      if(bytes>MAX_RESULT_BYTES){entry.resultOmitted='Response exceeded the private artifact result budget.';throw new Error('Result budget exceeded; use smaller bounded queries.');}
      entry.result=result;
      if(result.isError)throw new Error(`MCP tool failed: ${name}`);
      return result;
    }catch(error){entry.error=error.message;error.results=results;throw error;}
  };

  if(request.kind==='call'){
    for(const {name} of request.calls){
      const tool=catalog.get(name);
      if(!tool)throw new Error(`Unadvertised MCP tool: ${name}`);
      if(request.mode!=='write'&&tool.annotations?.readOnlyHint!==true)throw new Error(`Write mode required for ${name}.`);
    }
    for(const call of request.calls)await invoke(call.name,call.arguments);
  }else{
    const nonce=randomUUID(),path=`mcpConnectionChecks/${nonce}`;
    const fixture={connectionCheck:true,nonce,requestId:request.requestId,stage:'created'};
    let created=false;
    try{
      const item=parseToolJson(await invoke('firestore_create_document',{path,data:fixture}));created=true;
      const updated=parseToolJson(await invoke('firestore_update_document',{path,expectedUpdateToken:item.updateToken,data:{stage:'updated'}}));
      const read=parseToolJson(await invoke('firestore_get_document',{path}));
      if(read?.nonce!==nonce||read?.stage!=='updated'||read?.updateToken!==updated.updateToken)throw new Error('Read-after-write verification failed.');
      await invoke('firestore_delete_document',{path,expectedUpdateToken:read.updateToken,confirmation:`DELETE ${path}`});created=false;
      if(parseToolJson(await invoke('firestore_get_document',{path}))!==null)throw new Error('Deletion verification failed.');
    }catch(error){
      try{
        const current=parseToolJson(await invoke('firestore_get_document',{path}));
        if(current?.connectionCheck===true&&current?.nonce===nonce){
          await invoke('firestore_delete_document',{path,expectedUpdateToken:current.updateToken,confirmation:`DELETE ${path}`});created=false;
        }else if(current!==null)created=true;
      }catch{created=true;}
      error.results=results;error.fixturePath=path;error.cleanupNeeded=created;throw error;
    }
  }
  return {requestId:request.requestId,status:'success',tools,results};
}

export async function connectServer(serverPath,env=process.env){
  const [{Client},{StdioClientTransport}]=await Promise.all([
    sdk('@modelcontextprotocol/sdk/client/index.js'),
    sdk('@modelcontextprotocol/sdk/client/stdio.js')
  ]);
  const client=new Client({name:'pti-actions-mcp-client',version:'1.0.0'});
  const transport=new StdioClientTransport({
    command:process.execPath,args:[serverPath],
    env:Object.fromEntries(Object.entries(env).filter(([,value])=>typeof value==='string')),
    stderr:'pipe'
  });
  transport.stderr?.on('data',()=>{});
  try{await client.connect(transport,{timeout:30000});return client;}
  catch(error){await transport.close();throw error;}
}

async function main(){
  const [requestFile,outputFile]=process.argv.slice(2);
  if(!requestFile||!outputFile)throw new Error('Usage: node client.mjs request.json result.json');
  let client,report,request;
  try{
    if(process.env.GITHUB_RUN_ATTEMPT&&process.env.GITHUB_RUN_ATTEMPT!=='1')throw new Error('Submit a fresh request instead of replaying an existing run.');
    request=validateRequest(JSON.parse(await readFile(requestFile,'utf8')));
    client=await connectServer(fileURLToPath(new URL('../pti-mcp/dist/index.js',import.meta.url)));
    report=await executeRequest(client,request);
    process.stdout.write('PTI MCP request succeeded. Results saved to the private artifact.\n');
  }catch(error){
    report={requestId:request?.requestId??null,status:'error',error:error.message,results:error.results??[],fixturePath:error.fixturePath,cleanupNeeded:error.cleanupNeeded};
    process.stderr.write('PTI MCP request failed. Details saved to the private artifact.\n');process.exitCode=1;
  }finally{
    if(client){try{await client.close();}catch{if(report)report.transportCloseError=true;}}
    await mkdir(dirname(resolve(outputFile)),{recursive:true});
    await writeFile(outputFile,JSON.stringify({...report,completedAt:new Date().toISOString(),commit:process.env.GITHUB_SHA??null,runId:process.env.GITHUB_RUN_ID??null},null,2),{mode:0o600});
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(()=>{process.stderr.write('MCP client could not finish writing its result.\n');process.exitCode=1;});
}
