import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {home,read,write,VERSION} from './common.mjs';

const numeric=value=>Number.isFinite(value)&&value>=0?value:null;
const median=values=>{const sorted=values.filter(v=>v!==null).sort((a,b)=>a-b);return sorted.length?sorted[Math.floor(sorted.length/2)]:null;};
const knownProbe=task=>task.purpose==='acceptance'||task.purpose===undefined&&/acceptance|fixture|bridge[- ](?:smoke|history|test)|relay[- ]accept/i.test(`${task.title||''} ${task.workKey||''}`);
const cleanKey=value=>typeof value==='string'&&/^[a-z0-9-]{1,64}$/i.test(value)?value:'unknown';
const failureCategories=new Set(['interrupted','model-or-harness-policy','workspace-conflict','sign-in-required','timeout','task-failed']);
const failureClass=task=>/model|reasoning effort|fallback/i.test(task.error||'')?'model-choice':/lease|heartbeat|connection|sign.in/i.test(task.error||'')?'connection':/workspace|EEXIST|conflict/i.test(task.error||'')?'workspace-conflict':/duration|elapsed/i.test(task.error||'')?'timeout':task.status==='interrupted'?'interrupted':'unclassified';

export function summarizeTasks(tasks,{now=Date.now(),days=7,remoteData=null,localTasks={}}={}){
  if(!Number.isInteger(days)||days<1||days>90)throw Error('Review window must be 1 to 90 days.');
  const cutoff=now-days*86400000;
  const feedback=new Map();
  for(const job of remoteData?.jobs||[]){
    const localId=localTasks[job.id];if(!localId)continue;
    const outcomes=[...(job.outcomesHistory||[])];
    if(job.ownerOutcome)outcomes.push({generation:job.generation,outcome:job.ownerOutcome,at:job.outcomeAt});
    for(const item of outcomes)if(['accepted','needs_rework','abandoned'].includes(item.outcome)&&Number.isInteger(item.generation))feedback.set(`${localId}:${item.generation}`,item.outcome);
  }
  const rows=[];let invalid=0,heuristicProbes=0;
  for(const task of tasks){
    if(!/^[a-f0-9]{32}$/.test(task.id||'')){invalid++;continue;}
    const runs=task.runs?.length?task.runs:[null];
    if(knownProbe(task)&&task.purpose===undefined)heuristicProbes++;
    for(let index=0;index<runs.length;index++){
      const run=runs[index],at=Date.parse(run?.finishedAt||run?.startedAt||task.updatedAt||task.createdAt);
      if(!Number.isFinite(at)||at<cutoff||at>now+60000)continue;
      const generation=run?.generation??(runs.length===1?(task.history?.length||0)+1:null);
      const purpose=run?.purpose==='acceptance'||knownProbe(task)?'acceptance':run?.purpose==='work'||task.purpose==='work'?'work':'unknown';
      const status=run?.status||task.status;
      rows.push({taskId:task.id,runId:run?.runId||null,generation,project:cleanKey(task.project),mode:['edit','inspect'].includes(task.mode)?task.mode:'unknown',purpose,
        status:['queued','running','waiting_for_user','completed','failed','interrupted'].includes(status)?status:'unknown',
        strategy:['auto','single','team'].includes(run?.strategy||task.strategy)?run?.strategy||task.strategy:'unknown',
        at:new Date(at).toISOString(),durationMs:numeric(run?.durationMs),waitingMs:numeric(run?.waitingMs),
        commands:numeric(run?.commands),toolCalls:numeric(run?.toolCalls),toolFailures:numeric(run?.toolFailures),approvals:numeric(run?.approvals),questions:numeric(run?.questions),
        sandboxType:['readOnly','workspaceWrite','dangerFullAccess'].includes(run?.executionPolicy?.sandboxType)?run.executionPolicy.sandboxType:'unknown',
        approvalPolicy:run?.executionPolicy?.approvalPolicy==='never'?'never':'unknown',
        childrenSeen:numeric(run?.childrenSeen),childrenWithVerifiedSelection:run?.children?.filter(c=>c.selectionVerified===true).length??null,
        observedResponseTokens:numeric(run?.parentUsage?.totalTokens),tokenBasis:run?.tokenBasis||'unknown',usageCoverage:run?.usageCoverage||'unknown',
        ownerOutcome:feedback.get(`${task.id}:${generation}`)||'unknown',failureClass:['failed','interrupted'].includes(status)?run?(failureCategories.has(run.errorCategory)?run.errorCategory:'unclassified'):failureClass(task):null});
    }
  }
  const work=rows.filter(row=>row.purpose==='work'),probes=rows.filter(row=>row.purpose==='acceptance'),unclassified=rows.filter(row=>row.purpose==='unknown');
  const remoteLocalIds=new Set((remoteData?.jobs||[]).map(job=>localTasks[job.id]).filter(Boolean));
  const counts=(source,key)=>Object.fromEntries([...new Set(source.map(row=>row[key]))].map(value=>[String(value),source.filter(row=>row[key]===value).length]));
  const candidates=[];
  const stalledApprovals=work.filter(row=>row.status==='interrupted'&&row.approvals>0&&row.questions===0&&row.waitingMs>=300000);
  if(stalledApprovals.length)candidates.push({id:'inspect-approval-wait-interruption',decision:'investigate',evidence:stalledApprovals.map(row=>row.taskId).slice(0,12),reason:'An interrupted work run spent at least five minutes awaiting human approval. Check actual task policy and delivery state; completion and owner acceptance remain separate.'});
  if(work.filter(row=>['failed','interrupted'].includes(row.status)).length>=3)candidates.push({id:'inspect-repeated-execution-failure',decision:'investigate',evidence:work.filter(row=>row.failureClass).map(row=>row.taskId).slice(0,12),reason:'At least three failed/interrupted executions. Establish the mechanism and owner impact before changing the harness.'});
  const emptyTeams=work.filter(row=>row.strategy==='team'&&row.childrenSeen===0&&row.status==='completed');
  if(emptyTeams.length>=3)candidates.push({id:'review-unnecessary-team-routing',decision:'candidate',evidence:emptyTeams.map(row=>row.taskId).slice(0,12),reason:'At least three team requests completed without children. Check whether explicit single routing would reduce overhead for comparable tasks.'});
  if(work.filter(row=>row.ownerOutcome==='needs_rework').length>=2)candidates.push({id:'review-owner-rework',decision:'investigate',evidence:work.filter(row=>row.ownerOutcome==='needs_rework').map(row=>row.taskId).slice(0,12),reason:'At least two explicit owner rework verdicts. Compare their actual task scope and checks before generalizing.'});
  return {schemaVersion:1,generatedAt:new Date(now).toISOString(),windowDays:days,source:'owner Local Codex bridge metadata',
    coverage:{taskRecords:tasks.length,invalidRecords:invalid,observedRuns:rows.length,ordinaryRuns:work.length,acceptanceRuns:probes.length,unclassifiedRuns:unclassified.length,historicalProbeHeuristicRecords:heuristicProbes,
      ordinaryRunsWithDuration:work.filter(row=>row.durationMs!==null).length,ordinaryRunsWithResponseTokens:work.filter(row=>row.observedResponseTokens!==null).length,ordinaryRunsWithOwnerVerdict:work.filter(row=>row.ownerOutcome!=='unknown').length,
      ownerFeedbackSynced:remoteData!==null,remoteRecentLimit:remoteData&&'limit' in remoteData?remoteData.limit:100,remoteLimitReached:remoteData?.limitReached??null,remoteHasMore:remoteData?.has_more??null,
      remoteLookupCoverage:remoteData?.coverage??'unknown',remoteRequestedJobs:remoteData?.requestedJobs??null,remoteMatchedJobs:remoteData?.jobs?.length??null,remoteMissingJobs:remoteData?.missingTaskIds?.length??null,remoteBatchCount:remoteData?.batchCount??null,
      ordinaryRunsWithRemoteMetadata:work.filter(row=>remoteLocalIds.has(row.taskId)).length},
    ordinary:{statuses:counts(work,'status'),strategies:counts(work,'strategy'),ownerOutcomes:counts(work,'ownerOutcome'),failureClasses:counts(work.filter(row=>row.failureClass),'failureClass'),
      medianDurationMs:median(work.map(row=>row.durationMs)),medianWaitingMs:median(work.map(row=>row.waitingMs)),byStrategy:Object.fromEntries(['single','auto','team'].map(strategy=>{const selected=work.filter(row=>row.strategy===strategy);return [strategy,{runs:selected.length,medianDurationMs:median(selected.map(row=>row.durationMs)),ownerAccepted:selected.filter(row=>row.ownerOutcome==='accepted').length}];}))},
    acceptance:{runs:probes.length,statuses:counts(probes,'status')},unclassified:{runs:unclassified.length,statuses:counts(unclassified,'status')},candidates,
    limitations:['Protocol completion, passing tests and owner acceptance are different signals.','Missing historical metrics are unknown, never zero.','Admission/conflict rejections, retry counts and queue latency are not yet measured by this report.','Observed token counters cover the latest reported response; they are not total task/team cost.','Account-wide allowance cannot be attributed to this bridge.','Comparisons are observational and do not establish that more agents or this harness caused improvement.','Sparse or unchanged evidence is a no-change result; no automatic promotion is justified.'],rows};
}

export function reviewTaskIds(tasks,localTasks,{days=7,now=Date.now()}={}){
  const selected=new Set(summarizeTasks(tasks,{days,now}).rows.map(row=>row.taskId));
  return Object.entries(localTasks).filter(([remote,local])=>/^[a-f0-9]{32}$/.test(remote)&&selected.has(local)).map(([remote])=>remote);
}
export async function collectReviewMetadata(taskIds,request){
  const ids=[...new Set(taskIds)];
  if(ids.some(id=>!/^[a-f0-9]{32}$/.test(id)))throw Error('Invalid review task identity.');
  const jobs=[],missingTaskIds=[];let batchCount=0;
  // This is a transport batch size, not a limit on work or review history.
  for(let offset=0;offset<ids.length;offset+=100){
    const batch=ids.slice(offset,offset+100),data=await request(batch),expected=new Set(batch);
    if(data?.coverage!=='requested-jobs'||data.requestedJobs!==batch.length||!Array.isArray(data.jobs)||!Array.isArray(data.missingTaskIds))throw Error('Owner review metadata scope was not confirmed.');
    const resolved=[...data.jobs.map(job=>job.id),...data.missingTaskIds];
    if(resolved.length!==batch.length||new Set(resolved).size!==resolved.length||resolved.some(id=>!expected.has(id)))throw Error('Owner review metadata identities were incomplete or mismatched.');
    jobs.push(...data.jobs);missingTaskIds.push(...data.missingTaskIds);batchCount++;
  }
  return {coverage:'requested-jobs',limit:null,limitReached:false,has_more:false,requestedJobs:ids.length,jobs,missingTaskIds,batchCount};
}
export function reviewFingerprint(report){
  return createHash('sha256').update(JSON.stringify({windowDays:report.windowDays,rows:report.rows,coverage:report.coverage,syncError:report.syncError,transport:report.transport?Object.fromEntries(Object.entries(report.transport).filter(([key])=>!['basis','observedAt'].includes(key))):null})).digest('hex');
}
async function syncOwnerMetadata(taskIds){
  const {loadCredential,refresh,saveCredential}=await import('./credentials.mjs');
  const session=await refresh(await loadCredential());await saveCredential(session.refreshToken);
  return collectReviewMetadata(taskIds,async batch=>{
    const response=await fetch('https://pti-firestore-mcp-185802494856.asia-south1.run.app/local-codex/worker/review_data',{
      method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.idToken}`},body:JSON.stringify({task_ids:batch}),signal:AbortSignal.timeout(20000)});
    if(!response.ok){await response.body?.cancel();throw Error(`Owner review metadata unavailable (HTTP ${response.status}).`);}
    return response.json();
  });
}
export async function reviewUsage({days=7,sync=false,outputDirectory=path.join(home,'harness','reviews')}={}){
  if(!fs.realpathSync.native(home).toLowerCase().startsWith('f:\\'))throw Error('Bridge review data must resolve to F:.');
  const taskRoot=path.join(home,'tasks');
  const files=fs.existsSync(taskRoot)?fs.readdirSync(taskRoot,{withFileTypes:true}).filter(entry=>entry.isDirectory()&&/^[a-f0-9]{32}$/.test(entry.name)).map(entry=>({name:entry.name,at:fs.statSync(path.join(taskRoot,entry.name)).mtimeMs})).sort((a,b)=>b.at-a.at).slice(0,5000):[];
  const tasks=files.map(entry=>{try{return read(path.join(home,'tasks',entry.name,'task.json'));}catch{return null;}}).filter(Boolean);
  const state=fs.existsSync(path.join(home,'data','relay-state.json'))?read(path.join(home,'data','relay-state.json')):{};
  let remoteData=null,syncError=null;
  if(sync)try{remoteData=await syncOwnerMetadata(reviewTaskIds(tasks,state.localTasks||{},{days}));}catch(error){syncError=error.message;}
  const report=summarizeTasks(tasks,{days,remoteData,localTasks:state.localTasks||{}});
  report.workerVersion=VERSION;report.syncError=syncError;
  report.transport=state.transport?{...state.transport,basis:'Cumulative local relay request/event counters since transport.startedAt; not billed Firestore operations.',observedAt:new Date().toISOString()}:null;
  report.headroom={freeMemoryBytes:os.freemem(),totalMemoryBytes:os.totalmem()};
  const fingerprint=reviewFingerprint(report);
  if(!path.win32.isAbsolute(outputDirectory)||!path.win32.resolve(outputDirectory).toLowerCase().startsWith('f:\\'))throw Error('Review outputs must be on F:.');
  let existingParent=outputDirectory;
  while(!fs.existsSync(existingParent))existingParent=path.dirname(existingParent);
  if(!fs.realpathSync.native(existingParent).toLowerCase().startsWith('f:\\'))throw Error('Review output parent must resolve to F:.');
  fs.mkdirSync(outputDirectory,{recursive:true});
  if(!fs.realpathSync.native(outputDirectory).toLowerCase().startsWith('f:\\'))throw Error('Review outputs must resolve to F:.');
  const indexFile=path.join(outputDirectory,'latest.json');
  let prior;try{prior=read(indexFile);}catch{}
  const changed=prior?.fingerprint!==fingerprint;
  const file=changed?path.join(outputDirectory,`review-${new Date().toISOString().replace(/[:.]/g,'-')}.json`):prior.file;
  if(changed)write(file,report);
  write(indexFile,{checkedAt:new Date().toISOString(),fingerprint,file,changed,ordinaryRuns:report.coverage.ordinaryRuns,acceptanceRuns:report.coverage.acceptanceRuns,candidates:report.candidates.length,syncError});
  return {changed,file,coverage:report.coverage,candidates:report.candidates,syncError};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{const daysIndex=process.argv.indexOf('--days'),days=daysIndex<0?7:Number(process.argv[daysIndex+1]);console.log(JSON.stringify(await reviewUsage({days,sync:process.argv.includes('--sync')}),null,2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
