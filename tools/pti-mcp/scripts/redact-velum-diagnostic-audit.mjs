// One explicitly flagged CI repair, limited to this task's two diagnostic jobs.
// Select metadata only; do not read or print the stored private payloads.
import {applicationDefault,getApps,initializeApp} from 'firebase-admin/app';
import {FieldValue,getFirestore} from 'firebase-admin/firestore';
import {OWNER_UID,PROJECT} from '../../velum-worker/session.mjs';
import {belongsToExactVelumJob} from '../dist/velum-audit.js';
const allowed=new Set(['diag-clothed-4r-20261105-a747ea-1','diag-clothed-4r-20261105-a747ea-2']);
const args=process.argv.slice(2),apply=args.includes('--apply'),jobs=[];
for(let i=0;i<args.length;i++){
 if(args[i]==='--apply')continue;
 if(args[i]!=='--job-id'||!allowed.has(args[i+1]))throw Error('Only the two authorized diagnostic IDs are allowed.');
 jobs.push(args[++i]);
}
if(!jobs.length||new Set(jobs).size!==jobs.length)throw Error('Explicit distinct diagnostic IDs are required.');
if(!getApps().length)initializeApp({credential:applicationDefault(),projectId:PROJECT});
const db=getFirestore(),reports=[];
for(const jobId of jobs){
 const root=`users/${OWNER_UID}/velumStudio/workspace/jobs/${jobId}`;
 const query=db.collection('mcpAuditLog').where('target','>=',root).where('target','<',root+'\uf8ff')
   .select('target','payloadRedactionVersion').limit(100);
 const snapshot=await query.get();
 if(snapshot.size===100)throw Error('Repair scan is truncated; no broader repair is inferred.');
 const matches=snapshot.docs.filter(doc=>belongsToExactVelumJob(doc.get('target'),root));
 if(!matches.length)throw Error('Expected diagnostic audit metadata was not found; repair is unverified.');
 const pending=matches.filter(doc=>doc.get('payloadRedactionVersion')!==1);
 if(apply&&pending.length){
  const batch=db.batch();
  for(const doc of pending)batch.update(doc.ref,{before:null,after:null,
   input:{redacted:true,reason:'velum-private-payloads-removed'},payloadRedactionVersion:1,
   payloadRedactedAt:FieldValue.serverTimestamp()},{lastUpdateTime:doc.updateTime});
  await batch.commit();
 }
 const verified=apply?(await query.get()).docs.filter(doc=>belongsToExactVelumJob(doc.get('target'),root)):matches;
 if(apply&&verified.some(doc=>doc.get('payloadRedactionVersion')!==1))throw Error('Audit redaction readback failed.');
 reports.push({jobId,matched:matches.length,redacted:apply?pending.length:0,verified:apply?verified.length:0,apply});
}
console.log(JSON.stringify({scope:'only two owner-authorized diagnostic audit records',reports}));
