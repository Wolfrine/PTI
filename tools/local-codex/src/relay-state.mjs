export function claims(value) {
  if(!value)return [];
  const result=Array.isArray(value)?value:[value];
  if(result.length>4||result.some(job=>!job||!/^[a-f0-9]{32}$/.test(job.id)||!Number.isInteger(job.generation)||job.generation<1||typeof job.lease!=='string'))throw Error('Invalid durable relay claims.');
  if(new Set(result.map(job=>job.id)).size!==result.length)throw Error('Duplicate durable relay claims.');
  return result;
}
export function mergeClaims(active,incoming) {
  const merged=[...claims(active)];
  for(const job of incoming||[]){
    const prior=merged.find(item=>item.id===job.id);
    if(prior){if(prior.generation!==job.generation||prior.lease!==job.lease)throw Error('The relay returned a conflicting generation.');continue;}
    merged.push({...job,localId:null});
  }
  return claims(merged);
}
export function withoutClaim(active,claim) {
  return claims(active).filter(item=>item.id!==claim.id||item.generation!==claim.generation||item.lease!==claim.lease);
}
