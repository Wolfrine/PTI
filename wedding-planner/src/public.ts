export function countdownParts(target:string,now=Date.now()) {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(target))return null;
  const end=Date.parse(target);if(!Number.isFinite(end))return null;
  const seconds=Math.max(0,Math.floor((end-now)/1000));
  return {days:Math.floor(seconds/86400),hours:Math.floor(seconds%86400/3600),minutes:Math.floor(seconds%3600/60),seconds:seconds%60,complete:end<=now};
}
if(typeof document!=='undefined') {
  const countdown=document.querySelector<HTMLElement>('[data-countdown]');
  if(countdown){const update=()=>{const p=countdownParts(countdown.dataset.target||'');if(!p){countdown.closest('section')?.remove();return;}countdown.innerHTML=p.complete?'<p class="countdown-complete">The celebration has arrived.</p>':(['days','hours','minutes','seconds'] as const).map(k=>`<span><b>${String(p[k]).padStart(2,'0')}</b><small>${k}</small></span>`).join('');};update();setInterval(update,1000);}
}
