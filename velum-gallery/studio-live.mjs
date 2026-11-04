// One bounded owner-scoped listener set. SDK reconnects remain SDK-owned;
// elapsed-time ticks and repeated lifecycle events never perform reads.
export function createStudioLive({sdk,db,deviceUid,onState,onError=()=>{}}){
  const {doc,collection,query,where,orderBy,limit,onSnapshot}=sdk;
  let owner='',generation=0,worker=null,binding=null,recovery=null,hints={historicalIds:[],recovery:false};
  const slots=new Map(),recent=new Set(),pending=new Set(),displaced=new Set(),jobs=new Map();
  let scheduled=false,recentReady=false,pendingReady=false;
  const terminal=job=>['completed','failed','cancelled','expired'].includes(job?.status);
  const scope=()=>['users',owner,'velumStudio','workspace'];
  function ingest(snapshot){
    if(!snapshot.exists())return;
    const next={...snapshot.data(),id:snapshot.id},previous=jobs.get(next.id);
    // Separate queries may deliver their cached initial snapshots in any order.
    // A terminal job can never be returned to the queue by an older query view.
    if(terminal(previous)&&!terminal(next))return;
    if(previous?.recordType==='historical-import'&&previous.importState==='ready'&&next.importState!=='ready')return;
    const rank={uploading:0,queued:1,running:2};
    if(!terminal(next)&&rank[previous?.status]>rank[next.status])return;
    if(previous?.status===next.status&&(previous.progress?.updatedAt||0)>(next.progress?.updatedAt||0))return;
    jobs.set(next.id,next);
    if(terminal(next))displaced.delete(next.id);
  }
  function publish(){
    const keep=new Set([...recent,...pending,...displaced,...hints.historicalIds,worker?.activeJob].filter(Boolean));
    // Retain terminal evidence for a stale active claim and recently selected
    // output, while keeping session memory bounded as recent windows advance.
    while(jobs.size>64){const removable=[...jobs.keys()].find(id=>!keep.has(id));if(!removable)break;jobs.delete(removable);}
    onState({worker,binding,recovery,liveError:[...slots.values()].some(slot=>slot.failed),liveCached:[...slots.values()].some(slot=>slot.cached),jobs:[...jobs.values()].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))});
  }
  function schedule(){
    if(scheduled)return;scheduled=true;const token=generation;
    queueMicrotask(()=>{scheduled=false;if(owner&&token===generation){reconcile();publish();}});
  }
  function watch(key,target,receive){
    if(slots.has(key))return;
    const token=generation,slot={unsubscribe:null,failed:false,cached:true};slots.set(key,slot);
    try{
      slot.unsubscribe=onSnapshot(target,{includeMetadataChanges:true},snapshot=>{
        if(token!==generation||slots.get(key)!==slot||!owner)return;
        slot.cached=Boolean(snapshot.metadata?.fromCache);receive(snapshot);schedule();
      },error=>{
        if(token!==generation||slots.get(key)!==slot||!owner)return;
        slot.failed=true;onError(error);
      });
    }catch(error){slot.failed=true;onError(error);}
  }
  function unwatch(key){const slot=slots.get(key);if(!slot)return;slots.delete(key);slot.unsubscribe?.();}
  function queryReceive(ids,snapshot){
    if(ids===recent)recentReady=true;else pendingReady=true;
    const next=new Set(snapshot.docs.map(item=>item.id));
    if(ids===pending)for(const id of ids)if(!next.has(id)&&!terminal(jobs.get(id)))displaced.add(id);
    // Pathological owner-side bulk enqueueing must not expand the fallback set.
    while(displaced.size>20)displaced.delete(displaced.values().next().value);
    ids.clear();next.forEach(id=>ids.add(id));snapshot.docs.forEach(ingest);
  }
  function reconcile(){
    if(!owner)return;
    const base=scope();
    watch('status',doc(db,...base,'status','pc'),snapshot=>{worker=snapshot.exists()?snapshot.data():null;});
    watch('device',doc(db,...base,'devices',deviceUid),snapshot=>{binding=snapshot.exists()?snapshot.data():null;});
    watch('recent',query(collection(db,...base,'jobs'),orderBy('createdAt','desc'),limit(4)),snapshot=>queryReceive(recent,snapshot));
    watch('pending',query(collection(db,...base,'jobs'),where('status','in',['uploading','queued','running']),limit(20)),snapshot=>queryReceive(pending,snapshot));
    if(hints.recovery)watch('recovery',doc(db,...base,'controls','worker-start'),snapshot=>{recovery=snapshot.exists()?snapshot.data():null;});
    else unwatch('recovery');
    const targets=new Set([...(recentReady&&pendingReady?[worker?.activeJob,...displaced]:[]),...hints.historicalIds.slice(0,4)].filter(id=>typeof id==='string'&&id&&!recent.has(id)&&!pending.has(id)));
    for(const key of [...slots.keys()])if(key.startsWith('job:')&&!targets.has(key.slice(4)))unwatch(key);
    for(const id of targets)watch('job:'+id,doc(db,...base,'jobs',id),snapshot=>{if(snapshot.exists())ingest(snapshot);else{displaced.delete(id);jobs.delete(id);}});
  }
  function stop(){
    generation++;owner='';scheduled=false;recentReady=false;pendingReady=false;for(const key of [...slots.keys()])unwatch(key);
    recent.clear();pending.clear();displaced.clear();jobs.clear();worker=null;binding=null;recovery=null;
  }
  return {
    start(uid){if(!uid)return stop();if(uid===owner){reconcile();return;}stop();owner=uid;reconcile();},
    stop,
    setHints(next){hints={historicalIds:[...new Set(next.historicalIds||[])].slice(0,4),recovery:Boolean(next.recovery)};if(owner)reconcile();},
    refresh(){if(!owner)return;for(const [key,slot] of slots)if(slot.failed)unwatch(key);reconcile();},
    get size(){return slots.size;}
  };
}
