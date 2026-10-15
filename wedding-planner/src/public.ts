export function countdownParts(target:string,now=Date.now()) {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(target))return null;
  const end=Date.parse(target);if(!Number.isFinite(end))return null;
  const seconds=Math.max(0,Math.floor((end-now)/1000));
  return {days:Math.floor(seconds/86400),hours:Math.floor(seconds%86400/3600),minutes:Math.floor(seconds%3600/60),seconds:seconds%60,complete:end<=now};
}
if (typeof document !== 'undefined') {
  void Promise.all([import('./pwa').then(({startPwa})=>startPwa()), import('./sharing')]).then(()=>{
    document.querySelector<HTMLElement>('.invitation-actions')?.removeAttribute('hidden');
  });
  const countdown = document.querySelector<HTMLElement>('[data-countdown]');
  if (countdown) {
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => { if (timer) clearInterval(timer); timer = undefined; };
    const update = () => {
      const parts = countdownParts(countdown.dataset.target || '');
      if (!parts) return null;
      countdown.innerHTML = parts.complete
        ? '<p class="countdown-complete">18 January is here.</p>'
        : (['days', 'hours', 'minutes', 'seconds'] as const).map(unit => `<span><b>${String(parts[unit]).padStart(2, '0')}</b><small>${unit}</small></span>`).join('');
      if (parts.complete) stop();
      return parts;
    };
    const start = () => {
      stop();
      const parts = update();
      if (parts && !parts.complete && document.visibilityState !== 'hidden') timer = setInterval(update, 1000);
    };
    start();
    addEventListener('pagehide', stop);
    addEventListener('pageshow', start);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' ? stop() : start());
  }
}
