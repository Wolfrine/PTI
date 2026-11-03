const archiveUrl=new URL('./studio-archive.mjs',import.meta.url);
archiveUrl.search=new URL(import.meta.url).search;
const {creationReady}=await import(archiveUrl.href);

// A pose is an image input, but never the subject's original for this gesture.
export function singleSourceReference(job,verifiedResult){
  if(!verifiedResult||!creationReady(job)||!Array.isArray(job?.references)||job.references.length!==1)return null;
  const reference=job.references[0];
  if(!reference||reference.role==='pose'||(job.pose?.mode==='image'&&job.pose.referenceIndex===0)||!/^[a-f0-9]{64}$/.test(reference.sha256||''))return null;
  return reference;
}

// Delegated handlers survive Studio's frequent redraws and replacement of the
// Creations dialog. Only a deliberate tap/hold requests the private input.
export function createOriginalCompareController(root,{current,loadOriginal}){
  let jobId='',pinned=false,peeking=false,loading=false,error='',activePointer=null,skipClickUntil=0,generation=0,flight=null;
  const originalUrl=(context,reference)=>{
    const preview=context.previews?.[reference.sha256];
    return typeof preview==='string'?preview:preview?.url||'';
  };
  const eligible=()=>{
    const context=current(),reference=!context.locked&&singleSourceReference(context.job,Boolean(context.generatedUrl));
    return reference?{...context,reference}:null;
  };
  function endPointer(suppressClick=false,event=null){
    if(!activePointer)return;
    clearTimeout(activePointer.timer);
    const held=activePointer.held;
    activePointer=null;
    if(held){peeking=false;sync();}
    // A real pointerup can produce a subsequent synthesized click. Synthetic
    // fixture pointer events cannot, and must not suppress the next real tap.
    if((held||suppressClick)&&event?.isTrusted)skipClickUntil=performance.now()+420;
  }
  function reset(){
    endPointer();generation++;jobId='';pinned=false;peeking=false;loading=false;error='';flight=null;skipClickUntil=0;
  }
  function sync(){
    const context=eligible();
    if(!context){if(jobId)reset();return;}
    if(jobId!==context.job.id){reset();jobId=context.job.id;}
    const source=originalUrl(context,context.reference),showOriginal=Boolean(source&&(pinned||peeking));
    const message=loading&&(pinned||peeking)&&!source?'Loading original…':error?'Original unavailable · tap to retry':showOriginal?(peeking&&!pinned?'Original reference · release to return':'Original reference · tap to switch'):'Tap to compare · hold to peek';
    root.querySelectorAll('[data-compare-original]').forEach(button=>{
      if(button.dataset.compareOriginal!==context.job.id)return;
      const generated=button.querySelector('.studio-compare-frame > img:not([data-compare-source])'),referenceImage=button.querySelector('[data-compare-source]'),cue=button.querySelector('[data-compare-cue]');
      // Keep the generated image in normal layout. The source is an overlay:
      // landscape/portrait mismatches never resize or jump the comparison UI.
      if(source&&referenceImage?.getAttribute('src')!==source)referenceImage.setAttribute('src',source);
      if(referenceImage){referenceImage.hidden=!showOriginal;referenceImage.setAttribute('aria-hidden',String(!showOriginal));}
      if(generated)generated.setAttribute('aria-hidden',String(showOriginal));
      button.dataset.comparing=showOriginal?'original':'generated';
      button.setAttribute('aria-pressed',String(pinned));
      button.setAttribute('aria-busy',String(loading&&!source));
      button.setAttribute('aria-label',`${showOriginal?'Showing original reference':'Showing generated image'}. Tap to switch images or press and hold to peek at the original.`);
      if(cue)cue.textContent=message;
    });
  }
  async function requestOriginal(){
    const context=eligible();if(!context)return;
    if(originalUrl(context,context.reference)){sync();return;}
    if(flight?.jobId===context.job.id)return flight.promise;
    const token=generation,id=context.job.id;
    loading=true;error='';sync();
    const promise=Promise.resolve().then(()=>loadOriginal()).then(()=>{
      if(token===generation&&eligible()?.job.id===id){
        const updated=eligible();
        if(!originalUrl(updated,updated.reference))throw new Error('Reference did not load');
      }
    }).catch(()=>{
      if(token===generation&&eligible()?.job.id===id){error='Original unavailable · tap to retry';pinned=false;}
    }).finally(()=>{
      if(token===generation&&eligible()?.job.id===id){loading=false;flight=null;sync();}
    });
    flight={jobId:id,promise};
    return promise;
  }
  const controlFrom=target=>target instanceof Element?target.closest('[data-compare-original]'):null;
  root.addEventListener('click',event=>{
    const button=controlFrom(event.target);if(!button)return;
    // The primary Studio click handler manages archive tiles, not compare images.
    event.stopImmediatePropagation();
    if(event.detail>0&&performance.now()<skipClickUntil){skipClickUntil=0;return;}
    const context=eligible();if(!context||button.dataset.compareOriginal!==context.job.id)return;
    pinned=!pinned;error='';sync();if(pinned)void requestOriginal();
  },true);
  root.addEventListener('pointerdown',event=>{
    const button=controlFrom(event.target),context=eligible();
    if(!button||!context||button.dataset.compareOriginal!==context.job.id||!event.isPrimary||event.button!==0)return;
    endPointer();
    const scrolls=new Map();
    for(let ancestor=button;ancestor;ancestor=ancestor.parentElement)scrolls.set(ancestor,{x:ancestor.scrollLeft,y:ancestor.scrollTop});
    const documentScroller=document.scrollingElement||document.documentElement;
    scrolls.set(documentScroller,{x:documentScroller.scrollLeft,y:documentScroller.scrollTop});
    const gesture={id:event.pointerId,jobId:context.job.id,x:event.clientX,y:event.clientY,held:false,timer:0,scrolls};
    gesture.timer=setTimeout(()=>{
      if(activePointer!==gesture||eligible()?.job.id!==gesture.jobId)return;
      gesture.held=true;peeking=true;sync();void requestOriginal();
    },370);
    activePointer=gesture;
  },true);
  window.addEventListener('pointermove',event=>{
    if(activePointer?.id!==event.pointerId)return;
    if(Math.hypot(event.clientX-activePointer.x,event.clientY-activePointer.y)>12)endPointer(true,event);
  },true);
  window.addEventListener('pointerup',event=>{if(activePointer?.id===event.pointerId)endPointer(false,event);},true);
  window.addEventListener('pointercancel',event=>{if(activePointer?.id===event.pointerId)endPointer(true,event);},true);
  window.addEventListener('scroll',event=>{
    if(!activePointer)return;
    const target=event.target===document?(document.scrollingElement||document.documentElement):event.target;
    const before=activePointer.scrolls.get(target);
    if(before&&(Math.abs(target.scrollTop-before.y)>5||Math.abs(target.scrollLeft-before.x)>5))endPointer(true,event);
  },true);
  window.addEventListener('blur',()=>endPointer(true));
  root.addEventListener('contextmenu',event=>{if(controlFrom(event.target))event.preventDefault();},true);
  root.addEventListener('dragstart',event=>{if(controlFrom(event.target))event.preventDefault();},true);
  root.querySelector('#studioDetailsPanel')?.addEventListener('close',()=>endPointer(true));
  return {reset,sync};
}
