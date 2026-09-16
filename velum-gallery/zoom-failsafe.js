(() => {
  const stage = document.getElementById('driftStage');
  const chrome = document.getElementById('driftChrome');
  if (!stage || !chrome) return;

  const style = document.createElement('style');
  style.textContent = `
    #velumResetView{width:44px;height:44px;border-radius:50%;display:none;place-items:center;color:#f7eff1;background:rgba(12,8,10,.5);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(18px);touch-action:manipulation}
    #velumResetView svg{width:19px;height:19px}
    #driftStage.velum-inspecting ~ * #velumResetView{display:grid}
    body.velum-controls-visible #driftStage.velum-inspecting #velumResetView{display:grid}
    body.velum-controls-visible #velumResetView.velum-visible{display:grid}
  `;
  document.head.appendChild(style);

  const strip = chrome.querySelector('.vote-strip');
  const reset = document.createElement('button');
  reset.id = 'velumResetView';
  reset.type = 'button';
  reset.setAttribute('aria-label', 'Reset image view');
  reset.title = 'Reset image view';
  reset.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v6h6M20 20v-6h-6M6 18a8 8 0 0 0 12-3M18 6A8 8 0 0 0 6 9"/></svg>';
  strip?.insertBefore(reset, strip.children[1] || null);

  const syncResetVisibility = () => {
    const inspecting = stage.classList.contains('velum-inspecting');
    reset.classList.toggle('velum-visible', inspecting);
  };
  new MutationObserver(syncResetVisibility).observe(stage, { attributes: true, attributeFilter: ['class'] });
  syncResetVisibility();

  reset.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    window.__velumInteraction?.resetZoom?.();
    window.__velumInteraction?.showControls?.();
  });

  // A tap while inspecting used to be consumed before the normal tap handler
  // could reveal controls. Observe at Window capture level so there is always
  // a way back to the controls/reset button.
  const pointers = new Map();
  window.addEventListener('pointerdown', event => {
    if (!stage.classList.contains('velum-inspecting')) return;
    if (!stage.contains(event.target)) return;
    if (event.target.closest?.('button,a,select,input')) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, at: performance.now() });
  }, true);

  window.addEventListener('pointerup', event => {
    const start = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (!start || !stage.classList.contains('velum-inspecting')) return;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    const elapsed = performance.now() - start.at;
    if (moved < 18 && elapsed < 650) {
      window.__velumInteraction?.showControls?.();
    }
  }, true);

  window.addEventListener('pointercancel', event => pointers.delete(event.pointerId), true);
})();
