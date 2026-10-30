// Pure prerequisite checks; no credentials, private data or browser login.
export function serviceDisabled(body,service){
  return (body?.error?.details||[]).some(detail=>detail.reason==='SERVICE_DISABLED'&&detail.metadata?.service===service)
    || (service==='drive.googleapis.com'&&/drive api.*(disabled|has not been used)/i.test(body?.error?.message||''));
}
export async function waitForServiceOperation(operation,{read,wait=()=>new Promise(resolve=>setTimeout(resolve,1000)),attempts=30}){
  let current=operation;
  for(let attempt=0;attempt<=attempts;attempt++){
    if(current.error)throw new Error(`Service enable failed: ${current.error.message||'unknown error'}`);
    if(current.done)return;
    if(!operation.name)throw new Error('Service enable returned no operation identity.');
    if(attempt===attempts)throw new Error('Service enable is still pending; no completed activation was confirmed.');
    await wait();current=await read(operation.name);
  }
}
