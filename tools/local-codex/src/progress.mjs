import {createHash} from 'node:crypto';

// Acknowledged fingerprints belong to one durable claim/generation. Retrying a
// failed report must send it again; restarting must not replay unchanged progress.
export async function reportChangedSnapshot(claim,snapshot,send) {
  // Live token/tool counters alone are not progress for the chat. Include them
  // with the next real update and always fingerprint the final telemetry.
  const {telemetry,goal,...visible}=snapshot;
  const observed=goal?{...visible,goal:{status:goal.status,objective:goal.objective,tokenBudget:goal.tokenBudget}}:visible;
  const fingerprint=createHash('sha256').update(JSON.stringify(['completed','failed','interrupted'].includes(snapshot.status)?snapshot:observed)).digest('hex');
  if(claim.reportedSnapshot===fingerprint)return false;
  await send(snapshot);
  claim.reportedSnapshot=fingerprint;
  return true;
}
