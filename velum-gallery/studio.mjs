// Every local module inherits the published shell's release identity.
const localModule = relative => { const url=new URL(relative,import.meta.url);url.search=new URL(import.meta.url).search;return import(url.href); };
const {MODELS,makeJob,workerOnline,deviceApproved,devicePending,deviceCanQueue,modelReferenceLimit}=await localModule('./studio-contract.mjs');
const {PC_DEVICE_UID}=await localModule('./device-config.mjs');
const {renderStudioShell,renderStudioState,renderCreationDetails,selectedJob,pendingJob,formatJobStatus}=await localModule('./studio-view.mjs');
const {ARCHIVE_PAGE_SIZE,archiveSource,mergeArchivePage,decodeThumbnail,creationReady,historicalCreation}=await localModule('./studio-archive.mjs');
const {prepareReference,decodeReference,MAX_REFERENCES}=await localModule('./studio-reference.mjs');
const {makeRecoveryRequest,pendingRecovery,RECOVERY_COOLDOWN_MS}=await localModule('./studio-recovery.mjs');
const {createReferencePicker}=await localModule('./studio-reference-picker.mjs');
const {POSE_CATEGORIES}=await localModule('./drive-library.mjs');
const {verifyOriginal}=await localModule('./studio-drive.mjs');
export {renderStudioShell,renderStudioState,formatJobStatus};

export async function decodeResult(result,chunks){
  if(result?.mime!=='image/png'||!Number.isInteger(result.chunks)||result.chunks<1||result.chunks>16||!Number.isInteger(result.bytes)||result.bytes<8||result.bytes>7200000||!/^[a-f0-9]{64}$/.test(result.sha256||'')||chunks.length!==result.chunks)throw new Error('Invalid image manifest');
  const ordered=[...chunks].sort((a,b)=>a.index-b.index),parts=ordered.map((chunk,index)=>{if(chunk.index!==index||typeof chunk.data!=='string'||!chunk.data.length||chunk.data.length>600000||!/^[A-Za-z0-9+/]*={0,2}$/.test(chunk.data))throw new Error('Invalid image chunk');return Uint8Array.from(atob(chunk.data),value=>value.charCodeAt(0));});
  const bytes=new Uint8Array(parts.reduce((total,part)=>total+part.length,0));let offset=0;parts.forEach(part=>{bytes.set(part,offset);offset+=part.length;});if(bytes.length!==result.bytes||[137,80,78,71,13,10,26,10].some((value,index)=>bytes[index]!==value))throw new Error('Image size or format mismatch');const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');if(digest!==result.sha256)throw new Error('Image integrity check failed');return new Blob([bytes],{type:'image/png'});
}

export async function mountStudio({app,auth,drive}){
  const root=document.querySelector('#studioView');if(!root)return;renderStudioShell(root);
  const {getFirestore,doc,collection,query,where,orderBy,limit,startAfter,documentId,getDoc,getDocs,setDoc,updateDoc,deleteDoc}=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore-lite.js');
  const {onAuthStateChanged}=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js');
  if(!drive)throw new Error('Studio Drive integration is unavailable. Refresh Velum.');
  const referencePicker=createReferencePicker({drive});
  const db=getFirestore(app);
   const state={signedIn:false,connected:navigator.onLine,mode:'create',worker:null,binding:null,bindingBusy:false,recovery:null,recoveryBusy:false,jobs:[],selectedId:'',resultUrl:'',feedback:null,message:'',references:[],archiveJobs:[],archiveFilter:'all',archiveModel:'',archiveDate:'',archiveHasMore:true,archiveLoading:false,archiveError:'',saves:{},feedbackMap:{},removed:{},lastRemovedId:''};
  let uid='',epoch=0,timer=0,polling=false,resultJob='',resultBlob=null,archiveCursor=null,archiveEpoch=0,thumbActive=0,locked=false,pendingUpload=null,autoSelect=true,undoTimer=0,poseEpoch=0;
  const thumbs=new Map(),thumbMissing=new Set(),thumbQueue=[],thumbPending=new Set();
  state.referencePreviews={};state.driveJobs=[];
  const workspace=()=>['users',uid,'velumStudio','workspace'];
  const draw=()=>{renderStudioState(root,{...state,now:Date.now()});root.querySelector('#studioDriveQuality').disabled=Boolean(state.driveLoading);observeThumbs();};
  const detailsDraw=()=>{const panel=root.querySelector('#studioDetailsPanel'),scroll=panel.scrollTop,opened=[...panel.querySelectorAll('details[open]')].map(item=>item.querySelector('summary')?.textContent);renderCreationDetails(root,state);panel.querySelectorAll('details').forEach(item=>{if(opened.includes(item.querySelector('summary')?.textContent))item.open=true;});panel.scrollTop=scroll;};
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){observer.unobserve(entry.target);queueThumb(entry.target.dataset.thumb,entry.target);}}),{root,rootMargin:'200px'}):null;
  function observeThumbs(){if(state.mode!=='creations')return;root.querySelectorAll('[data-thumb]').forEach(element=>{const id=element.dataset.thumb,record=state.archiveJobs.find(item=>item.id===id);if(historicalCreation(record)&&!creationReady(record))return;if(thumbs.has(id))paintThumb(element,thumbs.get(id));else if(!thumbMissing.has(id)){if(observer)observer.observe(element);else queueThumb(id,element);}});}
  function paintThumb(element,url){if(!element.isConnected||element.querySelector('img'))return;const image=new Image();image.src=url;image.alt='';image.loading='lazy';image.decoding='async';element.append(image);}
  function queueThumb(id,element){if(!uid||thumbPending.has(id)||thumbs.has(id)||thumbMissing.has(id))return;thumbPending.add(id);thumbQueue.push({id,element,token:epoch});drainThumbs();}
  function drainThumbs(){while(thumbActive<6&&thumbQueue.length){const item=thumbQueue.shift();thumbActive++;(async()=>{try{if(item.token!==epoch||!uid)return;const driveJob=state.driveJobs.find(job=>job.id===item.id);if(driveJob){const file=await drive.metadata(driveJob.driveOriginal.fileId);if(item.token!==epoch||!uid)return;if(file.thumbnailLink){paintThumb(item.element,file.thumbnailLink);return;}thumbMissing.add(item.id);return;}const snapshot=await getDoc(doc(db,...workspace(),'thumbs',item.id));if(!snapshot.exists()){thumbMissing.add(item.id);return;}const blob=await decodeThumbnail(snapshot.data());if(item.token!==epoch||!uid)return;const url=URL.createObjectURL(blob);thumbs.set(item.id,url);paintThumb(item.element,url);if(thumbs.size>144){const first=thumbs.keys().next().value;URL.revokeObjectURL(thumbs.get(first));thumbs.delete(first);}}catch{if(item.token===epoch)thumbMissing.add(item.id);}finally{thumbActive--;thumbPending.delete(item.id);drainThumbs();}})();}}
  function clearResult(){if(state.resultUrl)URL.revokeObjectURL(state.resultUrl);for(const value of Object.values(state.referencePreviews||{}))URL.revokeObjectURL(value.url||value);state.referencePreviews={};state.resultUrl='';state.resultError='';state.feedback=null;state.saveMessage='';resultJob='';resultBlob=null;}
  function clearPose(){poseEpoch++;if(state.pose?.url)URL.revokeObjectURL(state.pose.url);state.pose=null;state.poseEnabled=false;state.poseLoading=false;state.poseError='';root.querySelector('#studioPoseEnabled').checked=false;}
  function clearReferences(){state.references.forEach(reference=>URL.revokeObjectURL(reference.url));state.references=[];state.parentJobId='';clearPose();}
  function clearPrivateSession(){referencePicker.clear();clearPose();state.driveJobs=[];state.driveLoading=false;pendingUpload=null;state.canRetryUpload=false;state.uploadProgress='';state.message='';state.saveMessage='';state.referencePick=false;root.querySelector('#studioReferenceSources').hidden=true;root.querySelector('#studioReferenceOpen').setAttribute('aria-expanded','false');drive.clear();}
  function switchMode(mode){state.mode=mode;draw();root.scrollTop=0;if(mode==='creations'&&!state.archiveJobs.length&&!state.archiveLoading)loadArchive(true);}
  function showDialog(id){const dialog=root.querySelector(id);if(!dialog.open)dialog.showModal();}
  function closeDialogs(){root.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());}
  async function related(collectionName,ids){const values={};for(let index=0;index<ids.length;index+=30){const group=ids.slice(index,index+30);if(!group.length)continue;const snapshot=await getDocs(query(collection(db,...workspace(),collectionName),where(documentId(),'in',group)));snapshot.docs.forEach(item=>{values[item.id]=item.data();});}return values;}
  async function loadArchive(reset=false){
    if(!uid||locked||state.archiveLoading)return;if(reset){archiveEpoch++;archiveCursor=null;state.archiveJobs=[];state.archiveHasMore=true;root.querySelector('#studioArchiveGrid').dataset.signature='';}if(!state.archiveHasMore)return;
    const token=epoch,lane=archiveEpoch,source=archiveSource(state.archiveFilter);state.archiveLoading=true;state.archiveError='';draw();
    try{const constraints=[...(source.where?[where(...source.where)]:[]),orderBy(source.order,'desc'),...(archiveCursor?[startAfter(archiveCursor)]:[]),limit(ARCHIVE_PAGE_SIZE)];const snapshot=await getDocs(query(collection(db,...workspace(),source.collection),...constraints));if(token!==epoch||lane!==archiveEpoch||!uid)return;
      let jobs;if(source.collection==='jobs')jobs=snapshot.docs.map(item=>({...item.data(),id:item.id}));else{jobs=(await Promise.all(snapshot.docs.map(async item=>{const entry=item.data(),jobId=entry.jobId||item.id;const job=await getDoc(doc(db,...workspace(),'jobs',jobId));return job.exists()?{...job.data(),id:job.id}:null;}))).filter(Boolean);}
      const ids=jobs.map(job=>job.id);const [saves,feedback,removed]=await Promise.all([related('saves',ids),related('feedback',ids),related('removed',ids)]);if(token!==epoch||lane!==archiveEpoch||!uid)return;
      state.saves={...state.saves,...saves};state.feedbackMap={...state.feedbackMap,...feedback};for(const id of ids)if(!removed[id])delete state.removed[id];state.removed={...state.removed,...removed};state.archiveJobs=mergeArchivePage(state.archiveJobs,[...jobs,...(state.archiveFilter==='all'||state.archiveFilter==='saved'?state.driveJobs:[])]);archiveCursor=snapshot.docs.at(-1)||archiveCursor;state.archiveHasMore=snapshot.docs.length===ARCHIVE_PAGE_SIZE;
    }catch(error){if(token===epoch&&lane===archiveEpoch)state.archiveError=error?.code==='failed-precondition'?'This archive filter is waiting for its database index. Try All while it finishes.':'Archive could not load. Reconnect and retry; no originals were removed.';}
    finally{if(token===epoch&&lane===archiveEpoch){state.archiveLoading=false;draw();}}
  }
  async function loadResult(){const job=selectedJob(state),signature=job?`${job.id}:${job.status}:${job.importState||''}:${job.result?.sha256||''}`:'';if(!job||resultJob===signature)return;resultJob=signature;const token=epoch,id=job.id;try{let blob=null;if(job.recordType==='drive-acceptance'){const actual=await drive.readReference({id:job.driveOriginal.fileId});blob=actual.blob;await verifyOriginal(blob,job);}else{const [feedback,save,chunks]=await Promise.all([getDoc(doc(db,...workspace(),'feedback',id)),getDoc(doc(db,...workspace(),'saves',id)),creationReady(job)&&job.result?.chunks?getDocs(collection(db,...workspace(),'jobs',id,'chunks')):Promise.resolve(null)]);if(chunks)blob=await decodeResult(job.result,chunks.docs.map(item=>item.data()));if(token!==epoch||id!==state.selectedId||!uid||locked)return;state.feedback=feedback.exists()?feedback.data():null;if(save.exists())state.saves[id]=save.data();}if(token!==epoch||id!==state.selectedId||!uid||locked)return;if(blob){resultBlob=blob;state.resultUrl=URL.createObjectURL(blob);}else if(creationReady(job))state.resultError='The original is local to your PC. No private remote image is available for this record.';}catch{if(token!==epoch||id!==state.selectedId)return;state.resultError='The original is unavailable remotely or failed its integrity check. No substitute preview is shown.';}draw();if(root.querySelector('#studioDetailsPanel').open)detailsDraw();}
  async function loadDriveQuality(){
    if(!uid||locked||state.driveLoading)return;const token=epoch;state.driveLoading=true;state.message='Opening private Drive quality runs…';draw();
    try{const records=await drive.loadQualityCreations();if(token!==epoch||locked)return;state.driveJobs=records.map(record=>structuredClone(record));for(const record of records)state.saves[record.id]={fileId:record.driveOriginal.fileId,webViewLink:`https://drive.google.com/file/d/${record.driveOriginal.fileId}/view`,name:record.provenance.label};state.archiveJobs=mergeArchivePage(state.archiveJobs.filter(record=>record.recordType!=='drive-acceptance'),state.driveJobs);root.querySelector('#studioArchiveGrid').dataset.signature='';state.message=`${records.length} actual Drive quality results loaded. Source type and judgments are in Details. Refresh Drive runs as more finish.`;}
    catch(error){if(token===epoch)state.message=error.message||'Drive quality results could not load. Reconnect and retry.';}
    finally{if(token===epoch){state.driveLoading=false;draw();}}
  }
  async function chooseJob(id,openDetails=false){if(!uid)return;clearResult();state.selectedId=id;draw();if(openDetails){detailsDraw();showDialog('#studioDetailsPanel');}await loadResult();}
  async function loadSourceReference(index){
    const job=selectedJob(state),reference=job?.references?.[index],token=epoch;if(!reference||state.referencePreviews[reference.sha256])return;
    let blob;
    if(job.recordType==='drive-acceptance'){const actual=await drive.readReference({id:reference.inputFileId||reference.source.id});const bytes=new Uint8Array(await actual.blob.arrayBuffer()),encoded=btoa(Array.from(bytes,value=>String.fromCharCode(value)).join('')),chunks=[];for(let offset=0;offset<encoded.length;offset+=600000)chunks.push({index:chunks.length,data:encoded.slice(offset,offset+600000)});blob=await decodeReference({...reference,chunks:chunks.length},chunks);}
    else{const snapshot=await getDocs(collection(db,...workspace(),'jobs',job.id,'inputs',String(index),'chunks'));blob=await decodeReference(reference,snapshot.docs.map(item=>item.data()));}
    if(token!==epoch||locked||state.selectedId!==job.id)return;
    state.referencePreviews[reference.sha256]=URL.createObjectURL(blob);detailsDraw();
  }
  async function poll(){
    clearTimeout(timer);if(!uid||locked||polling)return;polling=true;const token=epoch;
    try{
      const checkRecovery=!workerOnline(state.worker)||state.recovery?.status==='requested';
      const [status,jobs,binding,recovery]=await Promise.all([
        getDoc(doc(db,...workspace(),'status','pc')),
        getDocs(query(collection(db,...workspace(),'jobs'),orderBy('createdAt','desc'),limit(4))),
        getDoc(doc(db,...workspace(),'devices',PC_DEVICE_UID)),
        checkRecovery?getDoc(doc(db,...workspace(),'controls','worker-start')).catch(()=>null):Promise.resolve(null)
      ]);
      if(token!==epoch||!uid||locked)return;
      state.worker=status.exists()?status.data():null;state.binding=binding.exists()?binding.data():null;if(checkRecovery)state.recovery=recovery?.exists()?recovery.data():null;
      state.jobs=jobs.docs.map(item=>({...item.data(),id:item.id}));state.connected=navigator.onLine;
      // Merge newly imported history into an already open All feed. Preserve cursor pages.
      const staged=(state.archiveJobs||[]).filter(item=>historicalCreation(item)&&!creationReady(item));
      const imports=state.jobs.filter(historicalCreation);
      for(const item of staged.slice(0,4)){const snapshot=await getDoc(doc(db,...workspace(),'jobs',item.id));if(snapshot.exists())imports.push({...snapshot.data(),id:item.id});}
      if(token!==epoch||!uid||locked)return;
      for(const item of imports)if(creationReady(item)&&!creationReady(state.archiveJobs.find(previous=>previous.id===item.id)))thumbMissing.delete(item.id);
      if(state.mode==='creations'&&state.archiveFilter==='all'&&imports.length)state.archiveJobs=mergeArchivePage(state.archiveJobs,imports).sort((a,b)=>b.createdAt-a.createdAt);
      if(autoSelect&&!state.selectedId&&state.jobs.length)state.selectedId=state.jobs[0].id;
      draw();await loadResult();
    }catch(error){
      if(token===epoch&&uid&&!locked){state.connected=false;state.message=error?.code==='permission-denied'?'Studio is private to its owner. This account has no access.':'Could not reach private Studio. Reconnect to refresh confirmed jobs.';draw();}
    }finally{
      polling=false;if(uid&&!locked&&token===epoch)timer=setTimeout(poll,document.hidden?60000:15000);else if(uid&&!locked)timer=setTimeout(poll,0);
    }
  }
  async function requestRecovery(){
    if(!uid||locked||!state.signedIn||state.recoveryBusy||!navigator.onLine||!state.connected||!deviceApproved(state.binding))return;
    if(state.worker?.version!=='2.2.0'||state.worker?.capabilities?.recoveryControl!==true){state.message='Remote start requires the updated Windows recovery helper on this PC.';draw();return;}
    const now=Date.now();
    if(pendingRecovery(state.recovery,now)){state.message='A start request is already waiting for the PC.';draw();return;}
    if(state.recovery?.requestedAt>now-RECOVERY_COOLDOWN_MS){state.message='Wait one minute between recovery attempts.';draw();return;}
    const token=epoch,next=makeRecoveryRequest(now);state.recoveryBusy=true;state.message='';draw();
    try{
      await setDoc(doc(db,...workspace(),'controls','worker-start'),next);
      if(token===epoch&&uid&&!locked){state.recovery=next;state.message='Worker start requested. Velum will confirm only when the PC sends a fresh heartbeat.';}
    }catch(error){if(token===epoch)state.message=error?.code==='permission-denied'?'Recovery request was not authorized. Refresh and retry.':'Recovery request was not confirmed. Reconnect and retry.';}
    finally{if(token===epoch){state.recoveryBusy=false;draw();poll();}}
  }
  async function changeBinding(action){if(!uid||state.bindingBusy||!navigator.onLine||!state.connected||(action==='approve'?!(devicePending(state.binding)||(state.binding?.deviceUid===PC_DEVICE_UID&&state.binding.status==='revoked')):!deviceApproved(state.binding)))return;const token=epoch;state.bindingBusy=action;state.message='';draw();try{const update=action==='approve'?{status:'approved',approvedAt:Date.now()}:{status:'revoked',revokedAt:Date.now()};await updateDoc(doc(db,...workspace(),'devices',PC_DEVICE_UID),update);if(token!==epoch||!uid)return;state.binding={...state.binding,...update};state.message=action==='approve'?'PC approved. Private requests can reach it whenever Windows is online.':'PC access revoked.';}catch{if(token===epoch)state.message='Device approval was not confirmed. Refresh and retry.';}finally{if(token===epoch){state.bindingBusy=false;draw();poll();}}}
  async function addReference(blob,source,replace=false){if(locked)throw new Error('Unlock Studio before adding a reference.');const select=root.querySelector('#studioModel'),model=select.value,limit=modelReferenceLimit(state.worker,model),poseCount=state.poseEnabled&&state.pose?1:0;if(!limit)throw new Error('This model cannot edit a reference on the currently installed worker. Select a supported model.');if(!replace&&state.references.length+poseCount>=Math.min(MAX_REFERENCES,limit))throw new Error(`This model accepts ${limit} total reference image${limit===1?'':'s'}, including pose.`);const token=epoch,reference=await prepareReference(blob,source);if(token!==epoch||!uid||locked){URL.revokeObjectURL(reference.url);return;}if(!replace&&(state.references.length+poseCount>=Math.min(MAX_REFERENCES,modelReferenceLimit(state.worker,select.value))||state.references.some(item=>item.manifest.sha256===reference.manifest.sha256||(source.kind==='drive'&&item.manifest.source.kind==='drive'&&item.manifest.source.id===source.id)))){URL.revokeObjectURL(reference.url);throw new Error('Choose a distinct reference within the current model limit.');}if(replace)clearReferences();state.references.push(reference);state.referencePick=false;state.mode='create';root.querySelector('#studioReferenceSources').hidden=true;root.querySelector('#studioReferenceOpen').setAttribute('aria-expanded','false');state.message='Reference attached. Write your instruction; a new original will be created.';draw();}
  async function choosePose(){
    const token=epoch,lane=++poseEpoch,model=root.querySelector('#studioModel').value,limit=modelReferenceLimit(state.worker,model);
    state.poseEnabled=true;state.poseError='';state.poseLoading=true;draw();
    try{
      if(state.worker?.capabilities?.promptSchema!==4)throw new Error('Pose conditioning needs worker 2.3.0. Refresh after the PC update.');
      if(!state.references.length)throw new Error('Attach a subject reference first. The pose is an additional image input.');
      if(state.references.length>=limit)throw new Error(`This model accepts ${limit} total image inputs. Remove a subject or choose Qwen / FLUX before adding a pose.`);
      const file=await drive.choosePose({category:state.poseCategory||'auto',twoPerson:Boolean(state.poseTwoPerson),excludeId:state.pose?.fileId||''});
      const selected=await drive.readReference(file),reference=await prepareReference(selected.blob,selected.source);
      if(token!==epoch||lane!==poseEpoch||locked){URL.revokeObjectURL(reference.url);return;}
      if(state.references.length>=modelReferenceLimit(state.worker,root.querySelector('#studioModel').value)){URL.revokeObjectURL(reference.url);throw new Error('No image-input slot remains for the pose. Remove a subject or turn pose off.');}
      if(state.references.some(item=>item.manifest.sha256===reference.manifest.sha256||item.manifest.source.id===file.id)){URL.revokeObjectURL(reference.url);throw new Error('This pose duplicates a subject reference. Shuffle to choose another.');}
      if(state.pose?.url)URL.revokeObjectURL(state.pose.url);
      reference.manifest.role='pose';state.pose={fileId:file.id,catalogId:file.catalogId,category:file.category,label:file.name.slice(0,160),url:reference.url,mode:'image',reference,
       instruction:`Use image ${state.references.length+1} only as the reference for body pose and framing. Preserve the personal identity, face and body proportions from the earlier subject image${state.references.length===1?'':'s'}. Apply the requested outfit change. Do not copy the pose reference person's identity, clothing or background.`};
    }catch(error){if(token===epoch&&lane===poseEpoch)state.poseError=error.message||'Pose could not load. Retry or turn it off.';}
    finally{if(token===epoch&&lane===poseEpoch){state.poseLoading=false;draw();}}
  }
  async function creationReference(id,edit=false){await chooseJob(id);const job=selectedJob(state);if(!resultBlob||!creationReady(job))throw new Error('This original is not available remotely for reference editing.');await addReference(resultBlob,{kind:job.driveOriginal?'drive':'studio',id:job.driveOriginal?.fileId||job.id,name:`Creation · ${job.seed}`},edit);if(edit){root.querySelector('#studioPrompt').value='';root.querySelector('#studioSeed').value='';}state.parentJobId=job.driveOriginal?'':job.id;closeDialogs();root.scrollTop=0;if(edit)root.querySelector('#studioPrompt').focus();}
  async function feedbackSave(verdict,note=''){if(!uid||!state.connected||!navigator.onLine||!['keep','iterate','reject'].includes(verdict)||note.length>2000)throw new Error('Reconnect before saving feedback.');const token=epoch,id=state.selectedId,feedback={verdict,note,updatedAt:Date.now()};await setDoc(doc(db,...workspace(),'feedback',id),feedback);if(token!==epoch||id!==state.selectedId)return;state.feedback=feedback;state.feedbackMap[id]=feedback;}
  async function removeCreation(id){
    if(state.removing)return;
    if(!uid||locked||!navigator.onLine||!state.connected)throw new Error('Reconnect before removing a creation.');
    if(state.removed[id])return;const token=epoch,record={jobId:id,removedAt:Date.now()};
    state.removing=true;draw();
    try{await setDoc(doc(db,...workspace(),'removed',id),record);if(token!==epoch||!uid||locked)return;
      state.removed[id]=record;state.lastRemovedId=id;state.message='Removed from Creations. The original and any active generation are untouched.';
      if(state.selectedId===id){autoSelect=false;clearResult();state.selectedId='';}
      clearTimeout(undoTimer);undoTimer=setTimeout(()=>{if(state.lastRemovedId===id){state.lastRemovedId='';state.message='Creation removed from this view. Restore it from Removed whenever you wish.';draw();}},12000);
      closeDialogs();
    }finally{state.removing=false;draw();}
  }
  async function restoreCreation(id){
    if(state.removing)return;
    if(!id||!uid||locked||!navigator.onLine||!state.connected)throw new Error('Reconnect before restoring a creation.');
    state.removing=true;const token=epoch;draw();
    try{await deleteDoc(doc(db,...workspace(),'removed',id));if(token!==epoch||!uid||locked)return;
      delete state.removed[id];if(state.lastRemovedId===id){clearTimeout(undoTimer);state.lastRemovedId='';}
      state.message='Creation restored to its original date in Creations.';closeDialogs();
    }finally{state.removing=false;draw();}
  }
  async function saveDrive(keep=false){if(!uid||locked||!resultBlob||state.saving)return;const job=selectedJob(state);if(!job||!creationReady(job))return;const token=epoch,id=job.id,blob=resultBlob,restoreDetails=root.querySelector('#studioDetailsPanel').open;closeDialogs();state.saving=true;state.saveMessage='Preparing private Drive save…';draw();try{if(keep)await feedbackSave('keep',state.feedback?.note||'');const known=await getDoc(doc(db,...workspace(),'saves',id));if(token!==epoch||locked)return;if(known.exists()){state.saves[id]=known.data();state.saveMessage='Already saved to your Private folder.';state.message=state.saveMessage;return;}const saved=await drive.save({job,blob,onProgress:progress=>{if(token===epoch){state.saveMessage=typeof progress==='number'?`Saving to Drive · ${Math.round(progress*100)}%`:String(progress?.message||'Saving to Drive…');state.message=state.saveMessage;draw();}}});if(token!==epoch||!uid||locked)return;let record={jobId:id,fileId:saved.id,name:saved.name,webViewLink:saved.webViewLink||`https://drive.google.com/file/d/${saved.id}/view`,savedAt:Date.now(),mime:'image/png',sha256:job.result.sha256,bytes:job.result.bytes,folderId:'1AedezVcOlOB-cdv00j1HQ7Sy-EZntHgA'};const target=doc(db,...workspace(),'saves',id),existing=await getDoc(target);if(existing.exists())record=existing.data();else await setDoc(target,record);if(token===epoch){state.saves[id]=record;state.saveMessage='Saved to the Private folder root. Refresh your Drive gallery to see it in Drift.';state.message=state.saveMessage;}}catch(error){if(token===epoch){state.saveMessage=error?.message||'Drive save was not confirmed. Retry when online; the original stays on your PC.';state.message=state.saveMessage;}}finally{if(token===epoch){state.saving=false;draw();if(restoreDetails&&id===state.selectedId&&!locked){detailsDraw();showDialog('#studioDetailsPanel');}}}}
  root.addEventListener('click',async event=>{const button=event.target.closest('button');if(!button)return;try{
    if(button.dataset.action==='quick-exit')window.dispatchEvent(new CustomEvent('velum:quick-exit'));
    if(button.matches('[data-mode]')){state.referencePick=false;switchMode(button.dataset.mode);}
    if(button.matches('[data-close]'))button.closest('dialog').close();
    if(button.id==='studioDeviceOpen')showDialog('#studioDevicePanel');if(button.id==='studioAdvancedOpen')showDialog('#studioAdvancedPanel');if(button.id==='studioRefresh'){state.message='';clearResult();draw();poll();if(state.mode==='creations')loadArchive(true);}
    if(button.id==='studioApprove')changeBinding('approve');if(button.id==='studioRevoke')changeBinding('revoke');if(button.id==='studioRequestRecovery')await requestRecovery();
    if(button.id==='studioNew'){autoSelect=false;state.referencePick=false;clearResult();clearReferences();state.selectedId='';root.querySelector('#studioPrompt').value='';root.querySelector('#studioSeed').value='';switchMode('create');root.querySelector('#studioPrompt').focus();}
    if(button.dataset.action==='retry-upload')await uploadReferences();
    if(button.dataset.action==='cancel-upload'){const job=selectedJob(state);if(job?.status==='uploading'){await updateDoc(doc(db,...workspace(),'jobs',job.id),{status:'cancelled'});if(pendingUpload?.id===job.id)pendingUpload=null;job.status='cancelled';state.canRetryUpload=false;state.message='Incomplete upload cancelled. Reference bytes remain private; no inference was requested.';draw();poll();}}
    if(button.id==='studioReferenceOpen'){const sources=root.querySelector('#studioReferenceSources');sources.hidden=!sources.hidden;button.setAttribute('aria-expanded',String(!sources.hidden));}
    if(button.id==='studioReferenceFile')root.querySelector('#studioReferenceInput').click();if(button.id==='studioReferenceCreation'){state.referencePick=true;switchMode('creations');}if(button.id==='studioReferenceDrive'){const remaining=modelReferenceLimit(state.worker,root.querySelector('#studioModel').value)-state.references.length-(state.poseEnabled&&state.pose?1:0);if(remaining<1)throw new Error('No image-input slots remain. Remove a reference first.');const files=await referencePicker.choose({limit:remaining,selectedIds:state.references.filter(item=>item.manifest.source.kind==='drive').map(item=>item.manifest.source.id)});for(const file of files){const selection=await drive.readReference(file);await addReference(selection.blob,selection.source);}}
    if(button.id==='studioPoseShuffle')await choosePose();
    if(button.id==='studioDriveQuality')await loadDriveQuality();
    if(button.hasAttribute('data-source-reference'))await loadSourceReference(Number(button.dataset.sourceReference));
    if(button.hasAttribute('data-remove-reference')){const [reference]=state.references.splice(Number(button.dataset.removeReference),1);if(reference)URL.revokeObjectURL(reference.url);if(!state.references.length)clearPose();draw();}
    for(const [attribute,direction] of [['data-reference-up',-1],['data-reference-down',1]])if(button.hasAttribute(attribute)){const index=Number(button.getAttribute(attribute)),next=index+direction;if(next>=0&&next<state.references.length)[state.references[index],state.references[next]]=[state.references[next],state.references[index]];draw();}
    if(button.hasAttribute('data-filter')&&button.dataset.filter!==state.archiveFilter){if(state.archiveLoading)return;state.archiveFilter=button.dataset.filter;loadArchive(true);}
    if(button.id==='studioLoadMore')loadArchive();if(button.dataset.action==='undo-remove')await restoreCreation(state.lastRemovedId);if(button.dataset.creation){if(state.referencePick)await creationReference(button.dataset.creation);else await chooseJob(button.dataset.creation,true);}
    if(button.dataset.action==='details'){detailsDraw();showDialog('#studioDetailsPanel');loadResult();}
    if(button.dataset.action==='iterate'){const job=selectedJob(state);if(job&&!historicalCreation(job)){clearReferences();root.querySelector('#studioPrompt').value=job.prompt;root.querySelector('#studioSeed').value=String(job.seed);root.querySelector('#studioModel').value=job.model;state.parentJobId=job.id;state.mode='create';state.message='Original prompt and seed copied exactly. This new request has no attached references.';closeDialogs();draw();root.scrollTop=root.querySelector('#studioForm').offsetTop;root.querySelector('#studioPrompt').focus();}}
    if(button.dataset.action==='edit'){const model=root.querySelector('#studioEditModel')?.value,select=root.querySelector('#studioModel'),previous=select.value;if(!model)throw new Error('Choose an available edit model first.');select.value=model;try{await creationReference(state.selectedId,true);}catch(error){select.value=previous;throw error;}}if(button.dataset.action==='remove')await removeCreation(state.selectedId);if(button.dataset.action==='restore')await restoreCreation(state.selectedId);if(button.dataset.action==='save')await saveDrive();if(button.dataset.action==='keep-save')await saveDrive(true);
  }catch(error){state.message=error?.message||'This action could not finish. Your originals are unchanged.';draw();}});
  ['studioModel','studioConsent'].forEach(id=>root.querySelector(`#${id}`).addEventListener('change',draw));root.querySelector('#studioPrompt').addEventListener('input',draw);
  root.querySelector('#studioModel').addEventListener('change',()=>{if(state.poseEnabled){clearPose();state.message='Pose turned off after changing model. Re-enable it to check this model’s image-input limit.';draw();}});
  root.querySelector('#studioPoseEnabled').addEventListener('change',event=>{if(event.target.checked)choosePose();else{clearPose();draw();}});
  root.querySelector('#studioPoseCategory').addEventListener('change',event=>{state.poseCategory=event.target.value;if(state.poseEnabled)choosePose();});
  root.querySelector('#studioPoseTwoPerson').addEventListener('change',event=>{state.poseTwoPerson=event.target.checked;if(!state.poseTwoPerson&&state.poseCategory==='two-person')state.poseCategory='auto';if(state.poseEnabled)choosePose();});
  root.querySelector('#studioArchiveModel').addEventListener('change',event=>{state.archiveModel=event.target.value;draw();});root.querySelector('#studioArchiveDate').addEventListener('change',event=>{state.archiveDate=event.target.value;draw();});
  root.querySelector('#studioReferenceInput').addEventListener('change',async event=>{try{for(const file of event.target.files)await addReference(file,{kind:'file',id:'local',name:file.name});}catch(error){state.message=error.message;draw();}finally{event.target.value='';}});
  async function uploadReferences(){
    if(!pendingUpload||state.submitting||!uid||locked||!navigator.onLine)return;
    const upload=pendingUpload,token=epoch;state.submitting=true;state.message='';draw();
    try{
      const current=await getDoc(doc(db,...workspace(),'jobs',upload.id));
      if(token!==epoch||!uid||locked)return;
      if(!current.exists())throw new Error('This upload record is unavailable. Refresh before trying again.');
      if(current.data().status!=='uploading'){
        const confirmed=current.data(),job=state.jobs.find(item=>item.id===upload.id);if(job)Object.assign(job,confirmed);
        pendingUpload=null;state.canRetryUpload=false;
        if(confirmed.inputsReady){clearReferences();state.message='Reference request already confirmed. It was not submitted again.';return;}
        throw new Error('This reference upload is no longer active. Start a new image when ready.');
      }
      for(let index=0;index<upload.references.length;index++)for(const chunk of upload.references[index].chunks){
        if(token!==epoch||!uid||locked)return;
        const target=doc(db,...workspace(),'jobs',upload.id,'inputs',String(index),'chunks',String(chunk.index)),existing=await getDoc(target);
        if(token!==epoch||!uid||locked)return;
        if(existing.exists()){const value=existing.data();if(value.index!==chunk.index||value.data!==chunk.data)throw new Error('Existing reference bytes do not match this upload. Cancel it before trying again.');}
        else await setDoc(target,chunk);
        if(token!==epoch||!uid||locked)return;
        state.uploadProgress=`Reference ${index+1}/${upload.references.length} · ${Math.round((chunk.index+1)/upload.references[index].chunks.length*100)}%`;draw();
      }
      if(token!==epoch||!uid||locked)return;
      if(current.data().schemaVersion===4)for(let index=0;index<upload.references.length;index++){
        const r=upload.references[index].manifest,manifest={index,sha256:r.sha256,bytes:r.bytes,chunks:r.chunks},target=doc(db,...workspace(),'jobs',upload.id,'inputs',String(index)),existing=await getDoc(target);
        if(token!==epoch||!uid||locked)return;
        if(existing.exists()){const ready=existing.data();if(JSON.stringify(ready)!==JSON.stringify(manifest)&&['index','sha256','bytes','chunks'].some(key=>ready[key]!==manifest[key]))throw new Error('Reference ready record does not match this upload.');}
        else await setDoc(target,manifest);
      }
      if(token!==epoch||!uid||locked)return;
      await updateDoc(doc(db,...workspace(),'jobs',upload.id),{status:'queued',inputsReady:true});
      if(token!==epoch||!uid||locked)return;
      const job=state.jobs.find(item=>item.id===upload.id);if(job){job.status='queued';job.inputsReady=true;}
      pendingUpload=null;state.canRetryUpload=false;clearReferences();state.archiveJobs=[];archiveCursor=null;state.archiveHasMore=true;state.message=workerOnline(state.worker)?'References sent to your PC. Your instruction was preserved exactly.':'References queued privately until your PC reconnects.';
    }catch(error){if(token===epoch){state.canRetryUpload=true;state.message=error?.message||'Reference upload interrupted. Retry the same private upload, or cancel it. No inference starts until all references are ready.';}}
    finally{if(token===epoch){state.submitting=false;state.uploadProgress='';draw();poll();}}
  }
  root.querySelector('#studioForm').addEventListener('submit',async event=>{event.preventDefault();if(!uid||state.submitting||!navigator.onLine||!state.connected||!deviceApproved(state.binding)||state.jobs.some(job=>pendingJob(job)))return;const model=root.querySelector('#studioModel').value;if(!deviceCanQueue(state.binding,state.worker,model))return;const seedInput=root.querySelector('#studioSeed').value,seed=seedInput===''?crypto.getRandomValues(new Uint32Array(1))[0]&0x7fffffff:Number(seedInput),token=epoch;state.submitting=true;state.message='';draw();let target;
    try{
      if(state.poseEnabled&&(state.poseLoading||state.poseError||!state.pose))throw new Error('Choose a valid pose, or turn the pose setting off.');
      const payloadReferences=[...state.references,...(state.poseEnabled&&state.pose?[state.pose.reference]:[])],references=payloadReferences.map((reference,index)=>({...reference.manifest,index}));
      if(references.length&&references.length>modelReferenceLimit(state.worker,model))throw new Error('This worker has not verified reference editing for the selected model.');
      const pose=state.poseEnabled&&state.pose?Object.fromEntries(['fileId','catalogId','category','label','instruction','mode'].map(key=>[key,state.pose[key]])):undefined;
      if(pose){pose.referenceIndex=references.length-1;pose.instruction=pose.instruction.replace(/^Use image \d+/,`Use image ${references.length}`);}
      const job=makeJob({model,prompt:root.querySelector('#studioPrompt').value,seed,consent:root.querySelector('#studioConsent').checked,references,parentJobId:state.parentJobId||'',...(pose?{pose}:{})});
      target=doc(collection(db,...workspace(),'jobs'));await setDoc(target,job);
      if(token!==epoch||!uid||locked)return;
      clearResult();autoSelect=false;state.selectedId=target.id;state.jobs.unshift({...job,id:target.id});
      if(references.length){pendingUpload={id:target.id,references:payloadReferences};state.canRetryUpload=true;state.submitting=false;await uploadReferences();}
      else{state.archiveJobs=[];archiveCursor=null;state.archiveHasMore=true;state.message=workerOnline(state.worker)?'Sent to your PC. Your prompt was preserved exactly.':'Queued privately until your PC reconnects. Your prompt was preserved exactly.';clearReferences();}
    }
    catch(error){if(token===epoch)state.message=error?.code==='permission-denied'?'This account cannot create private Studio requests.':target?'Reference transfer was not confirmed. Retry the same upload or refresh before retrying.':error.message||'Request was not confirmed.';}
    finally{if(token===epoch){state.submitting=false;state.uploadProgress='';draw();poll();}}
  });
  root.querySelector('#studioDetails').addEventListener('submit',async event=>{if(event.target.id!=='studioFeedback')return;event.preventDefault();const form=event.target,output=form.querySelector('#studioFeedbackStatus'),button=form.querySelector('button[type=submit]'),data=new FormData(form);button.disabled=true;output.textContent='Saving…';try{await feedbackSave(data.get('verdict'),String(data.get('note')||''));output.textContent='Feedback saved';draw();}catch(error){output.textContent=error.message||'Not saved. Reconnect and retry.';}finally{button.disabled=false;}});
  onAuthStateChanged(auth,user=>{const previousUid=uid;epoch++;archiveEpoch++;clearTimeout(timer);clearTimeout(undoTimer);clearPrivateSession();clearResult();clearReferences();closeDialogs();observer?.disconnect();thumbQueue.length=0;thumbs.forEach(url=>URL.revokeObjectURL(url));thumbs.clear();thumbMissing.clear();thumbPending.clear();uid=user?.uid||'';Object.assign(state,{signedIn:Boolean(uid),jobs:[],archiveJobs:[],worker:null,binding:null,bindingBusy:false,recovery:null,recoveryBusy:false,selectedId:'',message:'',submitting:false,archiveLoading:false,archiveHasMore:true,archiveError:'',saves:{},feedbackMap:{},removed:{},lastRemovedId:'',saving:false});archiveCursor=null;autoSelect=true;if(!uid||previousUid!==uid){root.querySelector('#studioPrompt').value='';root.querySelector('#studioConsent').checked=false;root.querySelector('#studioSeed').value='';root.querySelector('#studioDetails').replaceChildren();}draw();if(uid)poll();});
  window.addEventListener('velum:lock',clearPrivateSession);
  window.addEventListener('pagehide',clearPrivateSession);
  window.addEventListener('velum:lock',()=>{locked=true;epoch++;archiveEpoch++;clearTimeout(timer);clearTimeout(undoTimer);closeDialogs();clearResult();clearReferences();observer?.disconnect();thumbQueue.length=0;thumbs.forEach(url=>URL.revokeObjectURL(url));thumbs.clear();thumbMissing.clear();state.jobs=[];state.archiveJobs=[];state.selectedId='';state.feedbackMap={};state.saves={};state.removed={};state.lastRemovedId='';state.submitting=false;state.saving=false;state.archiveLoading=false;root.querySelector('#studioPrompt').value='';root.querySelector('#studioConsent').checked=false;root.querySelector('#studioSeed').value='';root.querySelector('#studioDetails').replaceChildren();draw();});
  window.addEventListener('velum:unlock',()=>{locked=false;state.connected=navigator.onLine;draw();if(uid)poll();});
  const onlineChanged=()=>{state.connected=navigator.onLine;draw();if(uid&&navigator.onLine&&!locked)poll();};window.addEventListener('online',onlineChanged);window.addEventListener('offline',onlineChanged);document.addEventListener('visibilitychange',()=>{if(uid&&!locked&&!document.hidden)poll();});window.addEventListener('pagehide',()=>{epoch++;clearTimeout(timer);clearResult();closeDialogs();});window.addEventListener('pageshow',event=>{if(event.persisted&&uid&&!locked){draw();poll();}});draw();return{refresh:poll};
}
