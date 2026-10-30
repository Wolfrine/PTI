import {createHash} from 'node:crypto';

// Acknowledged fingerprints belong to one durable claim/generation. Retrying a
// failed report must send it again; restarting must not replay unchanged progress.
export async function reportChangedSnapshot(claim,snapshot,send) {
  const fingerprint=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  if(claim.reportedSnapshot===fingerprint)return false;
  await send(snapshot);
  claim.reportedSnapshot=fingerprint;
  return true;
}
