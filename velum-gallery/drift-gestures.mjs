import { affectionLevel, HOLD_THRESHOLD_MS } from './affection.mjs';

// One-finger media interaction for Velum Drift.
// This is the sole pointer gesture owner. No Focus overlay or pinch is required.
export function createDriftGestures({
  stage,
  getImage,
  isActive = () => true,
  onNext = () => {},
  onPrev = () => {},
  onTap = () => {},
  onHoldStart = () => {},
  onHoldProgress = () => {},
  onHoldEnd = () => {},
  onHoldCancel = () => {},
  onState = () => {},
  now = () => performance.now(),
  setDelay = (fn, ms) => setTimeout(fn, ms),
  cancelDelay = id => clearTimeout(id)
}) {
  const TAP_MS = 320;
  const TAP_DISTANCE = 46;
  const SWIPE_DISTANCE = 52;
  const SLIDE_START = 9;
  const HOLD_MOVE_TOLERANCE = 13;
  const HEART_PULSE_MS = 180;
  const FIT_EPS = 0.025;
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let pointer = null;
  let lastTap = null;
  let tapTimer = null;
  let holdTimer = null;
  let holdPulseTimer = null;
  let secondaryTouch = false;
  let previousState = '';
  let preparedImage = null;

  function geometry() {
    const rect = stage.getBoundingClientRect();
    const w = Math.max(1, rect.width || stage.clientWidth || 1);
    const h = Math.max(1, rect.height || stage.clientHeight || 1);
    const img = getImage();
    const iw = Math.max(1, img?.naturalWidth || w);
    const ih = Math.max(1, img?.naturalHeight || h);
    const ratio = iw / ih;
    const fittedWidth = Math.min(w, h * ratio);
    const fittedHeight = Math.min(h, w / ratio);
    // Native resolution is the useful upper bound; 24x limits GPU compositing.
    const nativeScale = Math.max(iw / fittedWidth, ih / fittedHeight);
    return {
      rect, w, h, fittedWidth, fittedHeight,
      maxScale: Math.max(6, Math.min(24, nativeScale))
    };
  }

  function isZoomed() { return scale > 1 + FIT_EPS; }

  function clampPan() {
    if (!isZoomed()) {
      panX = 0;
      panY = 0;
      return;
    }
    const g = geometry();
    const maxX = Math.max(0, (g.fittedWidth * scale - g.w) / 2);
    const maxY = Math.max(0, (g.fittedHeight * scale - g.h) / 2);
    panX = Math.max(-maxX, Math.min(maxX, panX));
    panY = Math.max(-maxY, Math.min(maxY, panY));
  }

  function notify(touching = false, force = false) {
    const state = `${isZoomed() ? 1 : 0}:${touching ? 1 : 0}`;
    if (!force && previousState === state) return;
    previousState = state;
    stage.classList.toggle('velum-inspecting', isZoomed());
    onState({ zoomed: isZoomed(), touching });
  }

  function paint(touching = false) {
    const img = getImage();
    if (img) img.style.transform = `translate3d(${panX}px,${panY}px,0) scale(${scale})`;
    notify(touching);
  }

  function cancelTap() {
    if (tapTimer !== null) cancelDelay(tapTimer);
    tapTimer = null;
  }

  function clearHoldTimers() {
    if (holdTimer !== null) cancelDelay(holdTimer);
    if (holdPulseTimer !== null) cancelDelay(holdPulseTimer);
    holdTimer = holdPulseTimer = null;
  }

  function cancelHold() {
    const wasHolding = pointer?.mode === 'holding';
    clearHoldTimers();
    if (wasHolding) {
      onHoldCancel();
      pointer.mode = 'hold-cancelled';
    }
    if (pointer) pointer.holdDisabled = true;
  }

  function pulseHold(pointerId) {
    if (!pointer || pointer.id !== pointerId || pointer.mode !== 'holding' || !isActive()) {
      cancelHold();
      return;
    }
    const durationMs = Math.max(HOLD_THRESHOLD_MS, now() - pointer.at);
    onHoldProgress({
      level: affectionLevel(durationMs),
      durationMs,
      x: pointer.x,
      y: pointer.y
    });
    holdPulseTimer = setDelay(() => pulseHold(pointerId), HEART_PULSE_MS);
  }

  function beginHold(pointerId) {
    holdTimer = null;
    if (!pointer || pointer.id !== pointerId || secondaryTouch || !isActive() ||
        pointer.doubleCandidate || pointer.holdDisabled || pointer.mode !== 'pending') return;
    pointer.mode = 'holding';
    lastTap = null;
    onHoldStart({ x: pointer.x, y: pointer.y });
    pulseHold(pointerId);
  }

  function fit({ touching = false } = {}) {
    scale = 1;
    panX = 0;
    panY = 0;
    clampPan();
    paint(touching);
  }

  function zoomTo(target, anchorX, anchorY, touching = true) {
    const g = geometry();
    const next = Math.max(1, Math.min(g.maxScale, target));
    const factor = next / scale;
    const localX = anchorX - g.rect.left - g.w / 2;
    const localY = anchorY - g.rect.top - g.h / 2;
    panX = panX * factor + localX * (1 - factor);
    panY = panY * factor + localY * (1 - factor);
    scale = next;
    clampPan();
    paint(touching);
  }

  function toggleZoom(clientX, clientY) {
    if (isZoomed()) fit();
    else zoomTo(Math.min(2.5, geometry().maxScale), clientX, clientY, false);
  }

  function onPointerDown(event) {
    if (!isActive()) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target?.closest?.('button,a,select,input,textarea,[data-drift-gesture-ignore]')) return;
    if (pointer) {
      secondaryTouch = true;
      cancelHold();
      cancelTap();
      lastTap = null;
      return;
    }
    secondaryTouch = false;
    const at = now();
    const doubleCandidate = Boolean(lastTap &&
      at - lastTap.at < TAP_MS &&
      Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < TAP_DISTANCE);
    cancelTap();
    if (!doubleCandidate) lastTap = null;
    pointer = {
      id: event.pointerId,
      sx: event.clientX,
      sy: event.clientY,
      x: event.clientX,
      y: event.clientY,
      at,
      startScale: scale,
      doubleCandidate,
      holdDisabled: doubleCandidate,
      mode: 'pending'
    };
    if (!doubleCandidate) holdTimer = setDelay(() => beginHold(event.pointerId), HOLD_THRESHOLD_MS);
    try { stage.setPointerCapture(event.pointerId); } catch {}
    notify(true);
  }

  function onPointerMove(event) {
    if (!pointer || pointer.id !== event.pointerId || secondaryTouch) return;
    const dx = event.clientX - pointer.sx;
    const dy = event.clientY - pointer.sy;
    const moved = Math.hypot(dx, dy);

    if (pointer.mode === 'holding') {
      if (moved > HOLD_MOVE_TOLERANCE) cancelHold();
      else {
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        return;
      }
    } else if (pointer.mode === 'pending' && !pointer.holdDisabled &&
               moved > HOLD_MOVE_TOLERANCE) {
      clearHoldTimers();
      pointer.holdDisabled = true;
    }

    if (pointer.mode === 'hold-cancelled') {
      // A cancelled hold cannot become an accidental vote or navigation.
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      return;
    }
    if (pointer.doubleCandidate && pointer.mode === 'pending' &&
        Math.abs(dy) >= SLIDE_START && Math.abs(dy) >= Math.abs(dx) * 0.75) {
      pointer.mode = 'slide-zoom';
      lastTap = null;
    }
    if (pointer.mode === 'slide-zoom') {
      // Google Maps-style, one-thumb zoom: double-tap, keep the second tap down,
      // slide up for more detail, slide down to return to fit.
      zoomTo(pointer.startScale * Math.exp(-dy / 115), pointer.sx, pointer.sy);
    } else if (!pointer.doubleCandidate && isZoomed()) {
      const deltaX = event.clientX - pointer.x;
      const deltaY = event.clientY - pointer.y;
      if (Math.hypot(dx, dy) > 4) pointer.mode = 'pan';
      panX += deltaX;
      panY += deltaY;
      clampPan();
      paint(true);
    }
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  }

  function onPointerUp(event) {
    if (!pointer || pointer.id !== event.pointerId) return;
    const p = pointer;
    pointer = null;
    clearHoldTimers();
    if (secondaryTouch) {
      secondaryTouch = false;
      lastTap = null;
      notify(false);
      return;
    }
    if (p.mode === 'holding') {
      const durationMs = Math.max(HOLD_THRESHOLD_MS, now() - p.at);
      onHoldEnd({
        level: affectionLevel(durationMs),
        durationMs,
        x: event.clientX,
        y: event.clientY
      });
      lastTap = null;
      notify(false);
      return;
    }
    if (p.mode === 'hold-cancelled') {
      lastTap = null;
      notify(false);
      return;
    }
    const dx = event.clientX - p.sx;
    const dy = event.clientY - p.sy;
    const moved = Math.hypot(dx, dy);
    const at = now();

    if (p.mode === 'slide-zoom') {
      if (!isZoomed()) fit();
      else notify(false);
      lastTap = null;
      return;
    }
    if (p.mode === 'pan' || (isZoomed() && moved >= 16)) {
      lastTap = null;
      notify(false);
      return;
    }

    const tapped = moved < 16 && at - p.at < 520;
    if (p.doubleCandidate && tapped) {
      lastTap = null;
      toggleZoom(event.clientX, event.clientY);
      notify(false);
      return;
    }
    if (isZoomed()) {
      if (tapped) queueTap(at, event.clientX, event.clientY);
      else lastTap = null;
      notify(false);
      return;
    }

    if (!tapped) {
      cancelTap();
      lastTap = null;
      if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) >= Math.abs(dy)) {
        notify(false);
        if (dx < 0) onNext(); else onPrev();
        return;
      }
    } else {
      queueTap(at, event.clientX, event.clientY);
    }
    notify(false);
  }

  function queueTap(at, x, y) {
    cancelTap();
    lastTap = { at, x, y };
    tapTimer = setDelay(() => {
      tapTimer = null;
      if (lastTap?.at !== at) return;
      lastTap = null;
      if (isActive()) onTap();
    }, TAP_MS + 10);
  }

  function onPointerCancel(event) {
    if (pointer?.id !== event.pointerId) return;
    cancelHold();
    pointer = null;
    secondaryTouch = false;
    cancelTap();
    lastTap = null;
    notify(false);
  }

  function onResize() {
    clampPan();
    paint(false);
  }

  function prepare() {
    const img = getImage();
    if (!img || img === preparedImage) return;
    preparedImage = img;
    const ready = () => {
      if (img !== getImage()) return;
      clampPan();
      paint(false);
    };
    if (img.complete && img.naturalWidth) ready();
    else img.addEventListener('load', ready, { once: true });
  }

  function reset() {
    cancelHold();
    pointer = null;
    secondaryTouch = false;
    lastTap = null;
    preparedImage = null;
    cancelTap();
    scale = 1;
    panX = panY = 0;
    const img = getImage();
    if (img) img.style.transform = 'translate3d(0px,0px,0) scale(1)';
    notify(false, true);
    prepare();
  }

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerCancel);
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  reset();

  return {
    reset,
    fit: () => fit(),
    getState: () => ({ scale, panX, panY, zoomed: isZoomed(), maxScale: geometry().maxScale }),
    destroy() {
      cancelHold();
      pointer = null;
      cancelTap();
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerup', onPointerUp);
      stage.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      stage.classList.remove('velum-inspecting');
    }
  };
}
