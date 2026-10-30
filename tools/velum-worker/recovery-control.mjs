import {pendingRecovery} from '../../velum-gallery/studio-recovery.mjs';

export async function attemptRecovery({read,start,ack,now=Date.now()}){
 const request=await read();
 if(!pendingRecovery(request,now))return false;
 await start();
 await ack(now);
 return true;
}
