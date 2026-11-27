export const STAGE_LABELS={preparing:'Preparing your request','review-vision-1':'Vision 1 is checking the edit','loading-model':'Loading the model','encoding-references':'Preparing reference images','encoding-prompt':'Encoding references and instructions','loading-diffusion':'Preparing the first image step',sampling:'Generating your image',decoding:'Decoding your image','review-vision-2':'Vision 2 is comparing the images',publishing:'Delivering your saved image','review-staging':'Staging the image privately'};
const REVIEW_ISSUES={
  'review-source-changed':'The reserved original changed or is no longer eligible. Leave the original in place and close this incomplete edit.',
  'review-source-connection':'Check the Drive connection and approved PC in Studio. The reserved original was not processed.',
  'review-vision-1-unavailable':'Check local Vision 1 readiness on the PC. This edit did not reach image generation.',
  'review-stage-unconfirmed':'Use Recover Drive staging to check the saved PNG and finish private delivery.',
  'review-stage-connection':'Reconnect Drive, then use Recover Drive staging for the saved PNG.',
  'review-stage-folder':'Check the unshared Review staging folder in Private, then use Recover Drive staging.'
};
const REVIEW_FAILURES={
  'resource-guard':'Check the PC’s temperature, GPU memory, and H: space before another edit.',
  'invalid-reference':'The exact source or approved edit did not pass validation. Review the source and non-intimate scope.',
  'model-unavailable':'Check that the approved model is available on the PC.',
  'invalid-output':'The PNG did not pass integrity checks. Close this edit and keep the original.',
  'output-too-large':'The PNG exceeds the private delivery limit.',
  interrupted:'The PC stopped this edit. Check that the worker is connected before another edit.',
  expired:'The queue window expired before the PC could claim this edit.'
};

export function reviewItemProgress({batch,run,job,receipt,feedback,confirmedDelivery=false,uncertain=false,now=Date.now()}){
  if(!run&&!job){
    if(batch?.state==='stopped')return {label:'Stopped before queueing'};
    if(batch?.expiresAt<=now)return {label:'Reservation expired'};
    if(batch?.state==='paused')return {label:'Reservation paused'};
    return {label:'Reserved',detail:'Not yet admitted to the PC queue.'};
  }
  if(run?.phase==='closed')return {label:'Closed'};
  if(['accepted','rejected'].includes(run?.phase)){
    const analysis={queued:'Vision 2 feedback queued',running:'Vision 2 is reviewing feedback',completed:'Vision 2 guidance ready',failed:'Vision 2 feedback unavailable'}[feedback?.status];
    const learning=run.learningId?'Learning approved':run.draft?'Learning draft saved':receipt?.learning?'Learning available':'Learning awaiting owner input';
    return {label:run.phase==='accepted'?'Accepted':'Not Okay',detail:[analysis,learning].filter(Boolean).join(' · ')};
  }
  if(run?.phase==='accepting')return {label:'Finishing acceptance',detail:'Reopen the review to resume confirming the Drive move.'};
  if(run?.phase==='staged')return {label:job?.status==='completed'?'Ready for owner review':'Staged privately',
    detail:receipt?.state==='unavailable'?'Vision 2 comparison unavailable. You can still review the image.':
      job?.status==='completed'?'Private Drive copy confirmed.':'Waiting for Studio to finish delivery.'};
  const issue=REVIEW_ISSUES[job?.progress?.stage];
  if(job?.status==='failed')return {label:'Edit failed',issue:true,detail:issue||REVIEW_FAILURES[job.error]||'Open the edit to check its last reported stage. The original remains unchanged.'};
  if(job?.status==='cancelled')return {label:'Cancelled'};
  if(job?.status==='expired'||(job?.status==='queued'&&job.expiresAt<=now))return {label:'Expired',detail:REVIEW_FAILURES.expired};
  if(job?.status==='completed')return confirmedDelivery||issue?
    {label:'Staging needs attention',issue:true,detail:issue||REVIEW_ISSUES['review-stage-unconfirmed']}:
    {label:'Checking private staging',detail:'Refresh Auto Review if the Drive confirmation is delayed.'};
  if(job?.status==='paused')return {label:'Paused',detail:'Resume the batch to return this edit to the PC queue.'};
  if(job?.status==='queued')return {label:batch?.state==='paused'?'Paused':'Queued for the PC'};
  if(job?.status==='uploading')return {label:'Preparing the source'};
  if(job?.status==='running'){
    const last=job.progress?.updatedAt,reported=reviewStageLabel(job);
    return {label:(uncertain||finite(last)&&now-last>75000)?`Last reported · ${reported}`:reported,issue:Boolean(issue),detail:issue||progressPresentation(job,{now}).count};
  }
  return {label:'Waiting for the Studio job'};
}

function reviewStageLabel(job){
  const stage=job?.progress?.stage;
  return stage==='preparing'&&job?.id?.startsWith('review-v3-')?'Verifying the reserved source':
    STAGE_LABELS[stage]||(REVIEW_ISSUES[stage]?'Edit needs attention':'PC claim received');
}
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
export function formatDuration(milliseconds){
  if(!finite(milliseconds))return '—';
  const seconds=Math.floor(milliseconds/1000),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60);
  return hours?`${hours}h ${minutes}m ${seconds%60}s`:minutes?`${minutes}m ${seconds%60}s`:`${seconds}s`;
}
export function progressPresentation(job,{now=Date.now(),online=true,connected=true,phoneOnline=true,cached=false,review=false}={}){
  const progress=job?.progress||{},running=job?.status==='running',updated=progress.updatedAt;
  const stale=running&&(!finite(updated)||now-updated>75000),offline=!online||!connected||!phoneOnline;
  // Once contact is stale, keep measured timing at the last report. Continuing
  // a stage clock would imply the PC is still working when that is unknown.
  const clock=stale||offline||cached?(finite(updated)?Math.min(now,updated):null):now;
  const start=progress.jobStartedAt??job?.startedAt,stageStart=progress.stageStartedAt;
  const elapsed=finite(start)&&finite(clock)?formatDuration(Math.max(0,clock-start)):'—';
  const stageElapsed=finite(stageStart)&&finite(clock)?formatDuration(Math.max(0,clock-stageStart)):'—';
  const stage=review?reviewStageLabel(job):STAGE_LABELS[progress.stage]||'Working on your PC';
  const count=progress.stage==='sampling'&&Number.isInteger(progress.step)&&progress.step>=0&&Number.isInteger(progress.total)&&progress.total>0&&progress.step<=progress.total?`${progress.step} / ${progress.total} steps`:'';
  const resources=progress.resources||{},sampleAge=finite(resources.sampledAt)?Math.max(0,now-resources.sampledAt):null;
  const resourceState=offline||cached?'Last reported PC':sampleAge===null?'PC readings unavailable':sampleAge>75000?'Last reported PC':'PC now';
  const percent=value=>finite(value)&&value<=100?`${Math.round(value)}%`:'—';
  const memory=(used,total,unit)=>finite(used)&&finite(total)&&total>0?`${(used/unit).toFixed(1)} / ${(total/unit).toFixed(1)} GB`:'—';
  return {
    stage:running?stage:job?.status==='uploading'?'Sending your references':'Queued for your PC',elapsed,stageElapsed,count,
    freshness:!phoneOnline?'Phone offline \u00b7 last report':!connected?'PC updates paused \u00b7 last report':cached?'Saved update \u00b7 awaiting live connection':!online?'PC offline \u00b7 last report':stale?'Waiting for a fresh PC update':finite(updated)?`Updated ${formatDuration(Math.max(0,now-updated))} ago`:'Waiting for PC progress',
    stale:stale||offline,resourceState,sampleAge:sampleAge===null?'':`${formatDuration(sampleAge)} ago`,
    durations:Object.entries(STAGE_LABELS).filter(([key])=>finite(progress.stageDurations?.[key])).map(([key,name])=>({stage:key,label:name,duration:formatDuration(progress.stageDurations[key])})),
    metrics:[['CPU',percent(resources.cpuPercent)],['RAM',memory(resources.ramUsedBytes,resources.ramTotalBytes,1073741824)],['GPU',percent(resources.gpuUtilPercent)],['VRAM',memory(resources.vramUsedMiB,resources.vramTotalMiB,1024)],['GPU temp',finite(resources.gpuTempC)?`${Math.round(resources.gpuTempC)}°C`:'—']]
  };
}
const html=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export function renderProgressCard(element,job,options={}){
  element.hidden=!job;if(!job){element.replaceChildren();delete element.dataset.signature;return;}
  const view=progressPresentation(job,options),expanded=Boolean(element.querySelector('details')?.open);
  element.dataset.stale=String(view.stale);
  const signature=JSON.stringify([job.id,job.status,view.stage,view.count,view.durations,view.metrics]);
  if(element.dataset.signature!==signature){
    const focused=element.querySelector('summary')===document.activeElement;
    element.dataset.signature=signature;
    element.innerHTML=`<div class="studio-progress-head"><div><span class="studio-progress-eyebrow">${html(options.modelLabel||'Local generation')}</span><h2>${html(view.stage)}</h2></div><span class="studio-progress-elapsed"><strong data-progress="elapsed"></strong><span>elapsed</span></span></div><div class="studio-progress-status"><span><span data-progress="stageElapsed"></span> in this stage</span>${view.count?`<strong>${html(view.count)}</strong>`:''}</div><p class="studio-progress-freshness" data-progress="freshness"></p><div class="studio-progress-resources"><div class="studio-resource-heading"><span data-progress="resourceState"></span><span data-progress="sampleAge"></span></div><dl>${view.metrics.map(([label,value])=>`<div><dt>${html(label)}</dt><dd>${html(value)}</dd></div>`).join('')}</dl></div><details class="studio-progress-details" ${expanded?'open':''}><summary>Stage times <span aria-hidden="true">&#8964;</span></summary>${view.durations.length?`<ol class="studio-stage-durations">${view.durations.map(item=>`<li><span>${html(item.label)}</span><strong>${html(item.duration)}</strong></li>`).join('')}</ol>`:'<p class="studio-stage-empty">Completed stage times appear as the PC reports them.</p>'}<p class="studio-stage-empty">Resource readings cover the whole PC / GPU.</p></details>`;
    if(focused)element.querySelector('summary').focus({preventScroll:true});
  }
  for(const key of ['elapsed','stageElapsed','freshness','resourceState','sampleAge'])element.querySelector(`[data-progress="${key}"]`).textContent=view[key];
}
