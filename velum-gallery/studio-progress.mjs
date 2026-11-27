export const STAGE_LABELS={preparing:'Preparing your request','loading-model':'Loading the model','encoding-references':'Preparing reference images','encoding-prompt':'Encoding references and instructions','loading-diffusion':'Preparing the first image step',sampling:'Generating your image',decoding:'Decoding your image',publishing:'Delivering your saved image'};
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
export function formatDuration(milliseconds){
  if(!finite(milliseconds))return '—';
  const seconds=Math.floor(milliseconds/1000),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60);
  return hours?`${hours}h ${minutes}m ${seconds%60}s`:minutes?`${minutes}m ${seconds%60}s`:`${seconds}s`;
}
export function progressPresentation(job,{now=Date.now(),online=true,connected=true,phoneOnline=true,cached=false}={}){
  const progress=job?.progress||{},running=job?.status==='running',updated=progress.updatedAt;
  const stale=running&&(!finite(updated)||now-updated>75000),offline=!online||!connected||!phoneOnline;
  // Once contact is stale, keep measured timing at the last report. Continuing
  // a stage clock would imply the PC is still working when that is unknown.
  const clock=stale||offline||cached?(finite(updated)?Math.min(now,updated):null):now;
  const start=progress.jobStartedAt??job?.startedAt,stageStart=progress.stageStartedAt;
  const elapsed=finite(start)&&finite(clock)?formatDuration(Math.max(0,clock-start)):'—';
  const stageElapsed=finite(stageStart)&&finite(clock)?formatDuration(Math.max(0,clock-stageStart)):'—';
  const stage=STAGE_LABELS[progress.stage]||'Working on your PC';
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
