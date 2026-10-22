(() => {
  const nativeSetTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  const nativeRAF = window.requestAnimationFrame.bind(window);
  const nativeCAF = window.cancelAnimationFrame.bind(window);

  const DRIFT_DURATION = 15000;
  const TOUCH_GRACE = 8000;
  const CONTROLS_VISIBLE_MS = 4500;
  const SCALE_EPSILON = 0.025;

  let nextAutoToken = -700001;
  let manualPause = false;
  let resumeHandle = null;
  let controlsHandle = null;
  let auto = {
    token: null,
    nativeId: null,
    callback: null,
    args: [],
    total: 0,
    remaining: 0,
    startedAt: 0,
    running: false,
    reason: '',
    raf: null
  };

  const style = document.createElement('style');
  style.textContent = `
    #driftView{position:fixed!important;inset:0!important;z-index:5!important;background:#000!important}
    #driftView .drift-stage,#driftView .drift-media,#driftView .single-wrap{position:absolute!important;inset:0!important;width:100vw!important;height:100dvh!important;padding:0!important;margin:0!important}
    #driftView .drift-image{width:100vw!important;height:100dvh!important;max-width:none!important;max-height:none!important;object-fit:contain!important;object-position:center!important;animation:none!important;transform-origin:center center!important;will-change:transform;user-select:none!important}
    #driftView .pair-wrap{position:absolute!important;inset:0!important;width:100vw!important;height:100dvh!important;padding:0!important;gap:2px!important}
    #driftView .pair-pane{height:100%!important;border-radius:0!important}
    #driftView .pair-pane img{width:100%!important;height:100%!important;object-fit:cover!important}

    .topbar,.bottom-nav,#velumHardRefresh{transition:opacity .32s ease,transform .32s ease!important}
    body.velum-drift-immersive:not(.velum-controls-visible) .topbar,
    body.velum-drift-immersive:not(.velum-controls-visible) #velumHardRefresh{opacity:0!important;pointer-events:none!important}
    body.velum-drift-immersive:not(.velum-controls-visible) .topbar{transform:translateY(-10px)!important}

    /* Primary navigation remains available even in immersive Drift. */
    body.velum-drift-immersive .bottom-nav{
      opacity:1!important;
      visibility:visible!important;
      pointer-events:auto!important;
      transform:none!important;
      z-index:120!important;
      height:calc(58px + env(safe-area-inset-bottom,0px))!important;
      gap:42px!important;
      background:linear-gradient(to top,rgba(7,5,6,.62) 12%,rgba(7,5,6,.20) 48%,rgba(7,5,6,0) 100%)!important;
    }
    body.velum-drift-immersive:not(.velum-controls-visible) .bottom-nav{
      opacity:.72!important;
    }
    body.velum-drift-immersive .bottom-nav .nav-item{
      display:flex!important;
      visibility:visible!important;
      pointer-events:auto!important;
    }
    body.velum-drift-immersive:not(.velum-controls-visible) .bottom-nav .nav-item{
      color:rgba(235,222,226,.54)!important;
    }
    body.velum-drift-immersive:not(.velum-controls-visible) .bottom-nav .nav-item.active{
      color:rgba(235,222,226,.82)!important;
    }

    body.velum-drift-immersive.velum-controls-visible .topbar{opacity:1!important;pointer-events:none!important;transform:none!important;padding-left:12px!important;padding-right:12px!important;background:linear-gradient(to bottom,rgba(5,4,5,.58),transparent)!important}
    body.velum-drift-immersive.velum-controls-visible .topbar .brand{pointer-events:auto!important}
    body.velum-drift-immersive.velum-controls-visible .brand-word{display:none!important}
    body.velum-drift-immersive.velum-controls-visible .top-actions{pointer-events:auto!important;display:flex!important;align-items:center!important;gap:5px!important;padding:4px!important;border-radius:999px!important;background:rgba(10,7,8,.36)!important;border:1px solid rgba(255,255,255,.08)!important;backdrop-filter:blur(18px)!important}
    body.velum-drift-immersive.velum-controls-visible .top-actions .sync-btn{height:32px!important;min-width:38px!important;padding:0 9px!important;border-radius:999px!important;background:rgba(255,255,255,.06)!important;font-size:10px!important;line-height:32px!important}
    body.velum-drift-immersive.velum-controls-visible .top-actions .private-dot{display:none!important}
    body.velum-drift-immersive.velum-controls-visible #exitBtn{width:32px!important;height:32px!important;background:rgba(255,255,255,.06)!important}

    body.velum-drift-immersive.velum-controls-visible .bottom-nav{opacity:1!important;pointer-events:auto!important;transform:none!important;height:calc(64px + env(safe-area-inset-bottom,0px))!important;gap:46px!important;background:linear-gradient(to top,rgba(7,5,6,.82) 35%,rgba(7,5,6,0))!important}
    #velumHardRefresh{position:fixed;z-index:2100;right:12px;bottom:calc(15px + env(safe-area-inset-bottom,0px));height:34px;padding:0 10px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(13,10,11,.62);color:rgba(255,255,255,.72);backdrop-filter:blur(16px);font:500 9px/1 Inter,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;display:flex;align-items:center;gap:5px;opacity:.78;touch-action:manipulation}
    #velumHardRefresh:active{opacity:1;transform:scale(.97)}
    #velumHardRefresh svg{width:13px;height:13px;stroke-width:1.9}
    body.velum-drift-immersive.velum-controls-visible #velumHardRefresh{opacity:1!important;pointer-events:auto!important;transform:none!important}

    #velumAutoTimer{position:fixed;z-index:64;left:0;right:0;bottom:env(safe-area-inset-bottom,0px);height:16px;border:0;background:transparent;padding:0;opacity:0;pointer-events:none;transition:opacity .25s;touch-action:manipulation}
    #velumAutoTimer.visible{opacity:.72;pointer-events:auto}
    #velumAutoTimer .track{position:absolute;left:0;right:0;bottom:0;height:2px;background:rgba(255,255,255,.12);overflow:hidden}
    #velumAutoTimer .fill{display:block;width:100%;height:100%;transform-origin:left center;background:rgba(244,231,235,.74);transform:scaleX(1);transition:transform .08s linear}
    #velumAutoTimer.paused .fill{background:rgba(214,178,162,.82)}

    #driftStage.velum-inspecting{cursor:grabbing}
    @media (max-width:420px){#velumHardRefresh{width:34px;padding:0;justify-content:center}#velumHardRefresh span{display:none}}
    @media (min-width:720px){#velumHardRefresh{right:calc(50% - 250px)}}
  `;
  document.head.appendChild(style);

  const refreshBtn = document.createElement('button');
  refreshBtn.id = 'velumHardRefresh';
  refreshBtn.type = 'button';
  refreshBtn.setAttribute('aria-label', 'Hard refresh Velum');
  refreshBtn.title = 'Hard refresh app shell';
  refreshBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg><span>Refresh</span>';
  document.body.appendChild(refreshBtn);

  const timer = document.createElement('button');
  timer.id = 'velumAutoTimer';
  timer.type = 'button';
  timer.setAttribute('aria-label', 'Pause or resume Drift timer');
  timer.title = 'Tap the bottom edge to pause or resume auto-advance';
  timer.innerHTML = '<span class="track"><i class="fill"></i></span>';
  document.body.appendChild(timer);
  const timerFill = timer.querySelector('.fill');

  const driftStage = document.getElementById('driftStage');
  const driftMedia = document.getElementById('driftMedia');
  const neutralScreen = document.getElementById('neutralScreen');
  const driftView = document.getElementById('driftView');
  const authGate = document.getElementById('authGate');

  function driftVisible() {
    const pin = document.getElementById('velumPinGate');
    return Boolean(
      driftView?.classList.contains('active') &&
      !neutralScreen?.classList.contains('open') &&
      (!pin || pin.style.display === 'none') &&
      !authGate?.classList.contains('open')
    );
  }

  function syncImmersiveClass() {
    document.body.classList.toggle('velum-drift-immersive', driftVisible());
    if (!driftVisible()) document.body.classList.remove('velum-controls-visible');
  }

  function showControls() {
    if (!driftVisible()) return;
    document.body.classList.add('velum-controls-visible');
    if (controlsHandle !== null) nativeClearTimeout(controlsHandle);
    controlsHandle = nativeSetTimeout(() => {
      controlsHandle = null;
      document.body.classList.remove('velum-controls-visible');
    }, CONTROLS_VISIBLE_MS);
  }

  function mediaReady() {
    const media = [...(driftMedia?.querySelectorAll('img') || [])];
    return media.length > 0 && media.every(img => img.complete && img.naturalWidth > 0);
  }

  function paintTimer() {
    syncImmersiveClass();
    if (!auto.callback || !driftVisible()) {
      timer.classList.remove('visible');
      return;
    }
    timer.classList.add('visible');
    const elapsed = auto.running ? performance.now() - auto.startedAt : 0;
    const remaining = Math.max(0, auto.running ? auto.remaining - elapsed : auto.remaining);
    const ratio = auto.total > 0 ? Math.max(0, Math.min(1, remaining / auto.total)) : 0;
    timerFill.style.transform = `scaleX(${ratio})`;
    timer.classList.toggle('paused', manualPause || (!auto.running && remaining > 0));
  }

  function animateTimer() {
    if (auto.raf) nativeCAF(auto.raf);
    const frame = () => {
      paintTimer();
      if (auto.running) auto.raf = nativeRAF(frame);
      else auto.raf = null;
    };
    auto.raf = nativeRAF(frame);
  }

  function cancelResume() {
    if (resumeHandle !== null) nativeClearTimeout(resumeHandle);
    resumeHandle = null;
  }

  function cancelAuto() {
    cancelResume();
    if (auto.nativeId !== null) nativeClearTimeout(auto.nativeId);
    if (auto.raf) nativeCAF(auto.raf);
    auto = { token:null, nativeId:null, callback:null, args:[], total:0, remaining:0, startedAt:0, running:false, reason:'', raf:null };
    paintTimer();
  }

  function fireAuto() {
    const callback = auto.callback;
    const args = auto.args;
    auto.running = false;
    auto.nativeId = null;
    auto.remaining = 0;
    paintTimer();
    if (typeof callback === 'function') callback(...args);
  }

  function waitForMediaThenStart(token) {
    if (auto.token !== token || manualPause) return;
    if (mediaReady()) {
      startAuto();
      return;
    }
    const media = [...(driftMedia?.querySelectorAll('img') || [])];
    if (!media.length) {
      nativeSetTimeout(() => waitForMediaThenStart(token), 60);
      return;
    }
    const retry = () => {
      if (auto.token === token && !auto.running && !manualPause && mediaReady()) startAuto();
    };
    media.forEach(img => {
      if (!img.complete || !img.naturalWidth) {
        img.addEventListener('load', retry, { once: true });
        img.addEventListener('error', retry, { once: true });
      }
    });
  }

  function startAuto() {
    if (!auto.callback || auto.remaining <= 0 || manualPause || auto.running) {
      paintTimer();
      return;
    }
    if (!mediaReady()) {
      waitForMediaThenStart(auto.token);
      paintTimer();
      return;
    }
    if (auto.nativeId !== null) nativeClearTimeout(auto.nativeId);
    auto.startedAt = performance.now();
    auto.running = true;
    auto.reason = '';
    auto.nativeId = nativeSetTimeout(fireAuto, auto.remaining);
    animateTimer();
  }

  function scheduleAuto(callback, args) {
    cancelResume();
    if (auto.nativeId !== null) nativeClearTimeout(auto.nativeId);
    if (auto.raf) nativeCAF(auto.raf);
    const token = nextAutoToken--;
    auto = {
      token,
      nativeId: null,
      callback,
      args,
      total: DRIFT_DURATION,
      remaining: DRIFT_DURATION,
      startedAt: 0,
      running: false,
      reason: '',
      raf: null
    };
    if (!manualPause) waitForMediaThenStart(token);
    else paintTimer();
    return token;
  }

  function pauseAuto(reason = 'inspect', makeManual = false) {
    cancelResume();
    if (!auto.callback) return;
    if (auto.running) {
      auto.remaining = Math.max(0, auto.remaining - (performance.now() - auto.startedAt));
      if (auto.nativeId !== null) nativeClearTimeout(auto.nativeId);
      auto.nativeId = null;
      auto.running = false;
      if (auto.raf) nativeCAF(auto.raf);
      auto.raf = null;
    }
    auto.reason = reason;
    if (makeManual) manualPause = true;
    paintTimer();
  }

  function resumeAuto({ force = false, delay = 0 } = {}) {
    cancelResume();
    if (!auto.callback || auto.running) return;
    if (manualPause && !force) return;
    if (force) manualPause = false;
    const token = auto.token;
    const run = () => {
      resumeHandle = null;
      if (auto.token !== token || auto.running || manualPause) return;
      startAuto();
    };
    if (delay > 0) resumeHandle = nativeSetTimeout(run, delay);
    else run();
  }

  timer.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    if (!auto.callback) return;
    if (auto.running) pauseAuto('manual', true);
    else resumeAuto({ force: true });
  });

  refreshBtn.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    refreshBtn.disabled = true;
    refreshBtn.querySelector('span').textContent = 'Updating';
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(reg => reg.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
      }
    } catch (error) {
      console.warn('Velum hard refresh cleanup failed', error);
    }
    const url = new URL(location.href);
    url.searchParams.set('fresh', Date.now().toString());
    location.replace(url.toString());
  });

  // The pointer system lives only in drift-gestures.mjs, not in this timer helper.
  function isDefaultView() {
    return !driftStage?.classList.contains('velum-inspecting');
  }

  function gestureState({ zoomed, touching }) {
    driftStage?.classList.toggle('velum-inspecting', zoomed);
    if (zoomed) pauseAuto('inspect');
    else if (touching) pauseAuto('touch');
    else if (driftVisible() && !manualPause) resumeAuto({ delay: TOUCH_GRACE });
    paintTimer();
  }

  function contextChanged() {
    syncImmersiveClass();
    const neutralOpen = neutralScreen?.classList.contains('open');
    const authOpen = authGate?.classList.contains('open');
    const driftActive = driftView?.classList.contains('active');
    if (neutralOpen || authOpen || !driftActive) {
      pauseAuto(neutralOpen ? 'locked' : authOpen ? 'auth' : 'browse');
    } else if (isDefaultView() && !manualPause) {
      resumeAuto({ delay: TOUCH_GRACE });
    } else if (!isDefaultView()) {
      pauseAuto('inspect');
    }
    paintTimer();
  }

  [neutralScreen, driftView, authGate].filter(Boolean).forEach(el => {
    new MutationObserver(contextChanged).observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseAuto('hidden');
    else if (driftVisible() && isDefaultView() && !manualPause) resumeAuto({ delay: TOUCH_GRACE });
  }, true);

  nativeSetTimeout(syncImmersiveClass, 0);

  window.__velumInteraction = {
    pause: () => pauseAuto('manual', true),
    resume: () => resumeAuto({ force: true }),
    scheduleAdvance: callback => scheduleAuto(callback, []),
    clearAdvance: cancelAuto,
    gestureState,
    showControls,
    getTimerState: () => ({ running: auto.running, remaining: auto.remaining, manualPause })
  };
})();
