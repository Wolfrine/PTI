export function accessRequestFor(user,now=Date.now()){
 const uid=String(user?.uid??''),email=String(user?.email??'').trim().toLowerCase();
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid)||email.length>254||!/^[^/@ ]+@[^/@ ]+\.[^/@ ]+$/.test(email)||user?.emailVerified!==true)throw new Error('verified-google-account-required');
 return {uid,email,name:String(user.displayName??'').replace(/[<>]/g,'').trim().slice(0,80),status:'pending',createdAt:now,updatedAt:now,revision:1};
}

// Pure planning lets retries, UID collisions and paused memberships be checked
// without performing live account writes.
export function accessReview(request,member,{ownerUid,approve,now=Date.now()}={}){
 if(!request)throw new Error('access-request-not-found');
 if(typeof approve!=='boolean')throw new Error('invalid-access-decision');
 const status=approve?'approved':'declined';
 if(request.status!=='pending'){
  if(request.status===status)return {changed:false,request};
  throw new Error('access-request-already-reviewed');
 }
 const next={...request,status,updatedAt:Math.max(now,request.updatedAt),revision:request.revision+1};
 if(!approve)return {changed:true,request:next,member:null};
 if(member&&(member.uid!==''&&member.uid!==request.uid||member.email!==request.email))throw new Error('member-identity-conflict');
 if(member&&member.active!==true)throw new Error('member-paused');
 if(member&&member.role!=='member')throw new Error('member-identity-conflict');
 return {changed:true,request:next,member:{email:request.email,uid:request.uid,role:'member',active:true,name:request.name,
  invitedBy:ownerUid,invitedAt:member?.invitedAt??now,updatedAt:next.updatedAt,revision:(member?.revision??0)+1}};
}
