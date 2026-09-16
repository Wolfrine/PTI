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
    #driftView .drift-hint{display:none!important}

    .topbar,.bottom-nav,#driftChrome,#velumHardRefresh{transition:opacity .32s ease,transform .32s ease!important}
    body.velum-drift-immersive:not(.velum-controls-visible) .topbar,
    body.velum-drift-immersive:not(.velum-controls-visible) .bottom-nav,
    body.velum-drift-immersive:not(.velum-controls-visible) #driftChrome,
    body.velum-drift-immersive:not(.velum-controls-visible) #velumHardRefresh{opacity:0!important;pointer-events:none!important}
    body.velum-drift-immersive:not(.velum-controls-visible) .topbar{transform:translateY(-10px)!important}
    body.velum-drift-immersive:not(.velum-controls-visible) .bottom-nav{transform:translateY(12px)!important}

    body.velum-drift-immersive.velum-controls-visible .topbar{opacity:1!important;pointer-events:none!important;transform:none!important;padding-left:12px!important;padding-right:12px!important;background:linear-gradient(to bottom,rgba(5,4,5,.58),transparent)!important}
    body.velum-drift-immersive.velum-controls-visible .topbar .brand{pointer-events:auto!important}
    body.velum-drift-immersive.velum-controls-visible .brand-word{display:none!important}
    body.velum-drift-immersive.velum-controls-visible .top-actions{pointer-events:auto!important;display:flex!important;align-items:center!important;gap:5px!important;padding:4px!important;border-radius:999px!important;background:rgba(10,7,8,.36)!important;border:1px solid rgba(255,255,255,.08)!important;backdrop-filter:blur(18px)!important}
    body.velum-drift-immersive.velum-controls-visible .top-actions .sync-btn{height:32px!important;min-width:38px!important;padding:0 9px!important;border-radius:999px!important;background:rgba(255,255,255,.06)!important;font-size:10px!important;line-height:32px!important}
    body.velum-drift-immersive.velum-controls-visible .top-actions .private-dot{display:none!important}
    body.velum-drift-immersive.velum-controls-visible #exitBtn{width:32px!important;height:32px!important;background:rgba(255,255,255,.06)!important}

    body.velum-drift-immersive.velum-controls-visible .bottom-nav{opacity:1!important;pointer-events:auto!important;transform:none!important;height:calc(64px + env(safe-area-inset-bottom,0px))!important;gap:46px!important;background:linear-gradient(to top,rgba(7,5,6,.82) 35%,rgba(7,5,6,0))!important}
    body.velum-drift-immersive.velum-controls-visible #driftChrome{position:fixed!important;z-index:90!important;left:50%!important;right:auto!important;top:auto!important;bottom:calc(82px + env(safe-area-inset-bottom,0px))!important;inset:auto auto calc(82px + env(safe-area-inset-bottom,0px)) 50%!important;width:auto!important;opacity:1!important;pointer-events:auto!important;transform:translateX(-50%)!important}
    body.velum-drift-immersive.velum-controls-visible #driftChrome .chrome-meta{display:none!important}
    body.velum-drift-immersive.velum-controls-visible #driftChrome .vote-strip{display:flex!important;align-items:center!important;gap:12px!important;padding:5px!important;border-radius:999px!important;background:rgba(10,7,8,.34)!important;border:1px solid rgba(255,255,255,.08)!important;backdrop-filter:blur(18px)!important}
    body.velum-drift-immersive.velum-controls-visible #driftChrome .vote-btn,
    body.velum-drift-immersive.velum-controls-visible #driftChrome .focus-btn{width:44px!important;height:44px!important}

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
  const focusOverlay = document.getElementById('focusOverlay');
  const neutralScreen = document.getElementById('neutralScreen');
  const driftView = document.getElementById('driftView');
  const authGate = document.getElementById('authGate');

  function driftVisible() {
    const pin = document.getElementById('velumPinGate');
    return Boolean(
      driftView?.classList.contains('active') &&
      !focusOverlay?.classList.contains('open') &&
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

  window.setTimeout = function(fn, delay = 0, ...args) {
    const ms = Number(delay) || 0;
    if (typeof fn === 'function' && ms >= 6500 && ms <= 13000) {
      return scheduleAuto(fn, args);
    }
    if (typeof fn === 'function' && ms === 220 && fn.name === 'goNext') {
      pauseAuto('vote');
      if (!manualPause && isDefaultView()) resumeAuto({ delay: TOUCH_GRACE });
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

  const driftPointers = new Map();
  let scale = 1;
  let coverScale = 1;
  let maxScale = 4.5;
  let panX = 0;
  let panY = 0;
  let containWidth = 0;
  let containHeight = 0;
  let pinch = null;
  let zoomGesture = false;
  let lastTapAt = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  let preparedImage = null;

  function activeDriftImage() {
    return driftMedia?.querySelector('.drift-image') || null;
  }

  function viewportSize() {
    return {
      width: Math.max(1, window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth),
      height: Math.max(1, window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight)
    };
  }

  function computeGeometry(img = activeDriftImage()) {
    if (!img?.naturalWidth || !img?.naturalHeight) return false;
    const { width: vw, height: vh } = viewportSize();
    const imageAspect = img.naturalWidth / img.naturalHeight;
    const viewAspect = vw / vh;
    if (imageAspect >= viewAspect) {
      containWidth = vw;
      containHeight = vw / imageAspect;
    } else {
      containHeight = vh;
      containWidth = vh * imageAspect;
    }
    coverScale = Math.max(1, vw / containWidth, vh / containHeight);
    maxScale = Math.max(4.5, coverScale * 3);
    return true;
  }

  function clampPan() {
    const { width: vw, height: vh } = viewportSize();
    const maxX = Math.max(0, (containWidth * scale - vw) / 2);
    const maxY = Math.max(0, (containHeight * scale - vh) / 2);
    panX = Math.max(-maxX, Math.min(maxX, panX));
    panY = Math.max(-maxY, Math.min(maxY, panY));
  }

  function isDefaultView() {
    return Boolean(activeDriftImage()) && Math.abs(scale - coverScale) <= SCALE_EPSILON && Math.abs(panX) < 2 && Math.abs(panY) < 2;
  }

  function applyDriftTransform({ pause = true } = {}) {
    const img = activeDriftImage();
    if (!img || !computeGeometry(img)) return;
    scale = Math.max(1, Math.min(maxScale, scale));
    clampPan();
    img.style.transform = `translate3d(${panX}px,${panY}px,0) scale(${scale})`;
    const inspecting = !isDefaultView();
    driftStage?.classList.toggle('velum-inspecting', inspecting);
    if (inspecting && pause) pauseAuto('inspect');
  }

  function setDefaultCover({ resume = false } = {}) {
    const img = activeDriftImage();
    if (!img || !computeGeometry(img)) return;
    scale = coverScale;
    panX = 0;
    panY = 0;
    pinch = null;
    zoomGesture = false;
    applyDriftTransform({ pause: false });
    if (resume && !manualPause) resumeAuto({ delay: TOUCH_GRACE });
  }

  function setFullFit() {
    const img = activeDriftImage();
    if (!img || !computeGeometry(img)) return;
    scale = 1;
    panX = 0;
    panY = 0;
    pinch = null;
    zoomGesture = true;
    applyDriftTransform();
  }

  function prepareCurrentImage() {
    const img = activeDriftImage();
    if (!img || img === preparedImage) return;
    preparedImage = img;
    const ready = () => {
      if (img !== activeDriftImage()) return;
      computeGeometry(img);
      setDefaultCover();
    };
    if (img.complete && img.naturalWidth) ready();
    else img.addEventListener('load', ready, { once: true });
  }

  if (driftMedia) {
    new MutationObserver(() => {
      preparedImage = null;
      driftPointers.clear();
      nativeSetTimeout(prepareCurrentImage, 0);
    }).observe(driftMedia, { childList: true, subtree: true });
  }
  nativeSetTimeout(prepareCurrentImage, 0);

  driftStage?.addEventListener('pointerdown', event => {
    const interactive = Boolean(event.target.closest?.('button,a,select,input'));
    if (interactive) return;
    pauseAuto('touch');
    prepareCurrentImage();
    const img = activeDriftImage();
    if (!img) return;
    driftPointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      px: event.clientX,
      py: event.clientY,
      sx: event.clientX,
      sy: event.clientY,
      at: performance.now()
    });

    if (driftPointers.size === 2) {
      const [a, b] = [...driftPointers.values()];
      pinch = {
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        scale,
        panX,
        panY,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2
      };
      zoomGesture = true;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (!isDefaultView()) {
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
      if (!pinch) return;
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      scale = Math.max(1, Math.min(maxScale, pinch.scale * (distance / pinch.distance)));
      panX = pinch.panX + (midX - pinch.midX);
      panY = pinch.panY + (midY - pinch.midY);
      zoomGesture = true;
      applyDriftTransform();
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (!isDefaultView()) {
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

    const isTap = moved < 14 && (now - point.at) < 520;
    const closeToLast = Math.hypot(event.clientX - lastTapX, event.clientY - lastTapY) < 44;
    const doubleTap = isTap && closeToLast && (now - lastTapAt) < 320;

    if (doubleTap && activeDriftImage()) {
      if (isDefaultView()) setFullFit();
      else setDefaultCover({ resume: true });
      lastTapAt = 0;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (zoomGesture || !isDefaultView()) {
      if (Math.abs(scale - coverScale) <= 0.04 && Math.abs(panX) < 10 && Math.abs(panY) < 10) {
        setDefaultCover({ resume: true });
      } else {
        applyDriftTransform();
        pauseAuto('inspect');
      }
      zoomGesture = !isDefaultView();
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const horizontalAction = Math.abs(dx) > 52 && Math.abs(dx) >= Math.abs(dy);
    const verticalAction = Math.abs(dy) > Math.abs(dx) * 1.15 && Math.abs(dy) > 52;
    if (horizontalAction || verticalAction) {
      return;
    }

    if (isTap) {
      lastTapAt = now;
      lastTapX = event.clientX;
      lastTapY = event.clientY;
      showControls();
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    if (!manualPause) resumeAuto({ delay: TOUCH_GRACE });
  }

  driftStage?.addEventListener('pointerup', finishDriftPointer, true);
  driftStage?.addEventListener('pointercancel', event => {
    driftPointers.delete(event.pointerId);
    if (!driftPointers.size) {
      pinch = null;
      if (isDefaultView() && !manualPause) resumeAuto({ delay: TOUCH_GRACE });
      else pauseAuto('inspect');
    }
  }, true);

  function contextChanged() {
    syncImmersiveClass();
    const focusOpen = focusOverlay?.classList.contains('open');
    const neutralOpen = neutralScreen?.classList.contains('open');
    const authOpen = authGate?.classList.contains('open');
    const driftActive = driftView?.classList.contains('active');
    if (focusOpen || neutralOpen || authOpen || !driftActive) {
      pauseAuto(focusOpen ? 'focus' : neutralOpen ? 'locked' : authOpen ? 'auth' : 'browse');
    } else if (isDefaultView() && !manualPause) {
      resumeAuto({ delay: TOUCH_GRACE });
    } else if (!isDefaultView()) {
      pauseAuto('inspect');
    }
    paintTimer();
  }

  [focusOverlay, neutralScreen, driftView, authGate].filter(Boolean).forEach(el => {
    new MutationObserver(contextChanged).observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
  });

  const onViewportChange = () => {
    const wasDefault = isDefaultView();
    computeGeometry();
    if (wasDefault) setDefaultCover();
    else applyDriftTransform();
  };
  window.addEventListener('resize', onViewportChange);
  window.visualViewport?.addEventListener('resize', onViewportChange);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseAuto('hidden');
    else if (driftVisible() && isDefaultView() && !manualPause) resumeAuto({ delay: TOUCH_GRACE });
  }, true);

  nativeSetTimeout(syncImmersiveClass, 0);

  window.__velumInteraction = {
    pause: () => pauseAuto('manual', true),
    resume: () => resumeAuto({ force: true }),
    resetZoom: () => setDefaultCover({ resume: true }),
    fitImage: setFullFit,
    showControls
  };
})();
