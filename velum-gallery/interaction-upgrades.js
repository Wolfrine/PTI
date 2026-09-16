(() => {
  const nativeSetTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  const nativeRAF = window.requestAnimationFrame.bind(window);
  const nativeCAF = window.cancelAnimationFrame.bind(window);

  const DRIFT_DURATION = 15000;
  const TOUCH_GRACE = 8000;
  const CONTROLS_VISIBLE_MS = 4500;

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
    #driftView .drift-image{width:100vw!important;height:100dvh!important;max-width:none!important;max-height:none!important;object-fit:cover!important;object-position:center!important}
    #driftView .pair-wrap{position:absolute!important;inset:0!important;width:100vw!important;height:100dvh!important;padding:0!important;gap:2px!important}
    #driftView .pair-pane{height:100%!important;border-radius:0!important}
    #driftView .pair-pane img{width:100%!important;height:100%!important;object-fit:cover!important}
    #driftView .drift-hint{display:none!important}

    .topbar,.bottom-nav,#driftChrome,#velumHardRefresh{transition:opacity .32s ease,transform .32s ease!important}
    body.velum-drift-immersive:not(.velum-controls-visible) .topbar,
    body.velum-drift-immersive:not(.velum-controls-visible) .bottom-nav,
    body.velum-drift-immersive:not(.velum-controls-visible) #driftChrome,
    body.velum-drift-immersive:not(.velum-controls-visible) #velumHardRefresh{
      opacity:0!important;pointer-events:none!important
    }
    body.velum-drift-immersive:not(.velum-controls-visible) .topbar{transform:translateY(-10px)!important}
    body.velum-drift-immersive:not(.velum-controls-visible) .bottom-nav{transform:translateY(12px)!important}
    body.velum-drift-immersive.velum-controls-visible .topbar,
    body.velum-drift-immersive.velum-controls-visible .bottom-nav,
    body.velum-drift-immersive.velum-controls-visible #velumHardRefresh{opacity:1!important;pointer-events:auto!important;transform:none!important}
    body.velum-drift-immersive.velum-controls-visible #driftChrome{opacity:1!important;pointer-events:auto!important;transform:none!important}

    #velumHardRefresh{position:fixed;z-index:2100;right:10px;bottom:calc(9px + env(safe-area-inset-bottom,0px));height:30px;padding:0 10px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(13,10,11,.62);color:rgba(255,255,255,.68);backdrop-filter:blur(16px);font:500 9px/1 Inter,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;display:flex;align-items:center;gap:5px;opacity:.72;touch-action:manipulation}
    #velumHardRefresh:active{opacity:1;transform:scale(.97)}
    #velumHardRefresh svg{width:12px;height:12px;stroke-width:1.9}

    #velumAutoTimer{position:fixed;z-index:64;left:0;right:0;bottom:env(safe-area-inset-bottom,0px);height:16px;border:0;background:transparent;padding:0;opacity:0;pointer-events:none;transition:opacity .25s;touch-action:manipulation}
    #velumAutoTimer.visible{opacity:.72;pointer-events:auto}
    #velumAutoTimer .track{position:absolute;left:0;right:0;bottom:0;height:2px;background:rgba(255,255,255,.12);overflow:hidden}
    #velumAutoTimer .fill{display:block;width:100%;height:100%;transform-origin:left center;background:rgba(244,231,235,.74);transform:scaleX(1);transition:transform .08s linear}
    #velumAutoTimer.paused .fill{background:rgba(214,178,162,.82)}

    .drift-image.velum-zooming{animation:none!important;object-fit:contain!important;max-height:none!important;will-change:transform;transform-origin:center center!important;filter:drop-shadow(0 18px 34px rgba(0,0,0,.35))}
    #driftStage.velum-inspecting{cursor:grabbing}
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

  function driftVisible() {
    const drift = document.getElementById('driftView');
    const focus = document.getElementById('focusOverlay');
    const neutral = document.getElementById('neutralScreen');
    const pin = document.getElementById('velumPinGate');
    const auth = document.getElementById('authGate');
    return Boolean(
      drift?.classList.contains('active') &&
      !focus?.classList.contains('open') &&
      !neutral?.classList.contains('open') &&
      (!pin || pin.style.display === 'none') &&
      !auth?.classList.contains('open')
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

  function startAuto() {
    if (!auto.callback || auto.remaining <= 0 || manualPause) {
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
    if (!manualPause) startAuto();
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

  window.setTimeout = function(fn, delay = 0, ...args) {
    const ms = Number(delay) || 0;
    if (typeof fn === 'function' && ms >= 6500 && ms <= 13000) {
      return scheduleAuto(fn, args);
    }
    if (typeof fn === 'function' && ms === 220 && fn.name === 'goNext') {
      pauseAuto('vote');
      if (!manualPause) resumeAuto({ delay: TOUCH_GRACE });
      return nativeSetTimeout(() => {}, ms);
    }
    return nativeSetTimeout(fn, ms, ...args);
  };

  window.clearTimeout = function(id) {
    if (id === auto.token) {
      cancelAuto();
      return;
    }
    nativeClearTimeout(id);
  };

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

  const driftStage = document.getElementById('driftStage');
  const driftMedia = document.getElementById('driftMedia');
  const driftPointers = new Map();
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let pinch = null;
  let zoomGesture = false;
  let lastTapAt = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  function activeDriftImage() {
    return driftMedia?.querySelector('.drift-image') || null;
  }

  function applyDriftTransform() {
    const img = activeDriftImage();
    if (!img) return;
    if (zoom > 1.001) {
      img.classList.add('velum-zooming');
      img.style.transform = `translate3d(${panX}px,${panY}px,0) scale(${zoom})`;
      driftStage?.classList.add('velum-inspecting');
      pauseAuto('zoom');
    } else {
      zoom = 1;
      panX = 0;
      panY = 0;
      img.classList.remove('velum-zooming');
      img.style.transform = '';
      driftStage?.classList.remove('velum-inspecting');
    }
  }

  function resetDriftZoom({ resume = false } = {}) {
    zoom = 1;
    panX = 0;
    panY = 0;
    pinch = null;
    zoomGesture = false;
    driftPointers.clear();
    applyDriftTransform();
    if (resume && !manualPause) resumeAuto({ delay: TOUCH_GRACE });
  }

  if (driftMedia) {
    new MutationObserver(() => resetDriftZoom()).observe(driftMedia, { childList: true });
  }

  driftStage?.addEventListener('pointerdown', event => {
    pauseAuto('touch');
    if (!activeDriftImage()) return;
    driftPointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      px: event.clientX,
      py: event.clientY,
      sx: event.clientX,
      sy: event.clientY,
      at: performance.now(),
      interactive: Boolean(event.target.closest?.('button,a,select,input'))
    });
    if (driftPointers.size === 2) {
      const [a, b] = [...driftPointers.values()];
      pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: zoom };
      zoomGesture = true;
      try { driftStage.setPointerCapture(event.pointerId); } catch {}
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (zoom > 1.001) {
      zoomGesture = true;
      try { driftStage.setPointerCapture(event.pointerId); } catch {}
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  driftStage?.addEventListener('pointermove', event => {
    const point = driftPointers.get(event.pointerId);
    if (!point) return;
    point.px = point.x;
    point.py = point.y;
    point.x = event.clientX;
    point.y = event.clientY;

    if (driftPointers.size >= 2) {
      const [a, b] = [...driftPointers.values()];
      if (!pinch) pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: zoom };
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      zoom = Math.max(1, Math.min(4.5, pinch.scale * (distance / Math.max(1, pinch.distance))));
      zoomGesture = true;
      applyDriftTransform();
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (zoom > 1.001) {
      panX += point.x - point.px;
      panY += point.y - point.py;
      zoomGesture = true;
      applyDriftTransform();
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  function finishDriftPointer(event) {
    const point = driftPointers.get(event.pointerId);
    if (!point) return;
    const dx = event.clientX - point.sx;
    const dy = event.clientY - point.sy;
    const moved = Math.hypot(dx, dy);
    const now = performance.now();
    driftPointers.delete(event.pointerId);
    if (driftPointers.size < 2) pinch = null;

    if (point.interactive) return;

    const isTap = moved < 14 && (now - point.at) < 520;
    const closeToLast = Math.hypot(event.clientX - lastTapX, event.clientY - lastTapY) < 44;
    const doubleTap = isTap && closeToLast && (now - lastTapAt) < 320;

    if (doubleTap && activeDriftImage()) {
      zoom = zoom > 1.001 ? 1 : 2.15;
      panX = 0;
      panY = 0;
      zoomGesture = zoom > 1.001;
      applyDriftTransform();
      lastTapAt = 0;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (zoom <= 1.001 && !manualPause) resumeAuto({ delay: TOUCH_GRACE });
      return;
    }

    if (isTap) {
      lastTapAt = now;
      lastTapX = event.clientX;
      lastTapY = event.clientY;
      showControls();
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!manualPause) resumeAuto({ delay: TOUCH_GRACE });
      return;
    }

    if (zoomGesture || zoom > 1.001) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (zoom <= 1.001) {
        zoomGesture = false;
        if (!manualPause) resumeAuto({ delay: TOUCH_GRACE });
      }
      return;
    }

    const horizontalAction = Math.abs(dx) > 52;
    const verticalAction = Math.abs(dy) > Math.abs(dx) * 1.15 && Math.abs(dy) > 52;
    if (horizontalAction || verticalAction) {
      return;
    }

    if (!manualPause) resumeAuto({ delay: TOUCH_GRACE });
  }

  driftStage?.addEventListener('pointerup', finishDriftPointer, true);
  driftStage?.addEventListener('pointercancel', event => {
    driftPointers.delete(event.pointerId);
    if (!driftPointers.size && zoom <= 1.001 && !manualPause) resumeAuto({ delay: TOUCH_GRACE });
  }, true);

  const focusOverlay = document.getElementById('focusOverlay');
  const neutralScreen = document.getElementById('neutralScreen');
  const driftView = document.getElementById('driftView');
  const authGate = document.getElementById('authGate');

  function contextChanged() {
    syncImmersiveClass();
    const focusOpen = focusOverlay?.classList.contains('open');
    const neutralOpen = neutralScreen?.classList.contains('open');
    const authOpen = authGate?.classList.contains('open');
    const driftActive = driftView?.classList.contains('active');
    if (focusOpen || neutralOpen || authOpen || !driftActive) {
      pauseAuto(focusOpen ? 'focus' : neutralOpen ? 'locked' : authOpen ? 'auth' : 'browse');
    } else if (zoom <= 1.001 && !manualPause) {
      resumeAuto({ delay: TOUCH_GRACE });
    }
    paintTimer();
  }

  [focusOverlay, neutralScreen, driftView, authGate].filter(Boolean).forEach(el => {
    new MutationObserver(contextChanged).observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseAuto('hidden');
    else if (driftVisible() && zoom <= 1.001 && !manualPause) resumeAuto({ delay: TOUCH_GRACE });
  }, true);

  nativeSetTimeout(syncImmersiveClass, 0);

  window.__velumInteraction = {
    pause: () => pauseAuto('manual', true),
    resume: () => resumeAuto({ force: true }),
    resetZoom: () => resetDriftZoom({ resume: true }),
    showControls
  };
})();