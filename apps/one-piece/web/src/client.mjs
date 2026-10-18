export const CONTROL_ORIGIN='https://pti-onepiece-home.duckdns.org:8443';
export class ClientError extends Error { constructor(code,status=0,detail){super(code);this.code=code;this.status=status;this.detail=detail;} }
export function createClient(getUser,getGeneration=()=>null) {
 return async function request(route,input,{method=input===undefined?'GET':'POST',signal,timeout=45000}={}) {
  if(!/^\/api\/[a-zA-Z0-9/_-]+$/.test(route))throw new ClientError('invalid-request');
  const user=getUser(),uid=user?.uid??null,generation=getGeneration();
  const assertIdentity=()=>{if((getUser()?.uid??null)!==uid||getGeneration()!==generation)throw new ClientError('identity-changed');};
  const perform=async refresh=>{
   assertIdentity();
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
   try {
    const token=user?await user.getIdToken(refresh):null;
    assertIdentity();
    const response=await fetch(CONTROL_ORIGIN+route,{method,mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',
     headers:{...(token?{Authorization:`Bearer ${token}`}:{}) ,...(input!==undefined?{'Content-Type':'application/json'}:{})},
     body:input===undefined?undefined:JSON.stringify(input),signal:signal?AbortSignal.any([signal,controller.signal]):controller.signal});
    assertIdentity();
    const value=await response.json().catch(()=>({error:'invalid-response'}));
    assertIdentity();
    if(response.status===401&&user&&!refresh)return perform(true);
    if(!response.ok)throw new ClientError(value.error??'request-failed',response.status,value.detail);
    return value;
   }catch(error){assertIdentity();if(error instanceof ClientError)throw error;throw new ClientError(controller.signal.aborted?'companion-timeout':'companion-offline');}
   finally{clearTimeout(timer);}
  };
  return perform(false);
 };
}
