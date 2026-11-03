// Mobile-first browsing of an opened Studio creation. The image is the only
// gesture surface; details, controls and vertical scrolling remain native.
export function createStudioViewerController(root, { isOpen, navigate }) {
  const SWIPE_DISTANCE = 56;
  const SWIPE_DOMINANCE = 1.35;
  let active = null;
  let lastNavigation = -Infinity;

  const imageFrom = target => target instanceof Element ? target.closest('.studio-detail-image') : null;
  const overMedia = target => {
    const media = imageFrom(target);
    return Boolean(media && root.contains(media) && media.closest('#studioDetailsPanel'));
  };
  const reset = () => { active = null; root.classList.remove('studio-viewer-swiping'); };
  const navigateOnce = direction => {
    if (!isOpen() || performance.now() - lastNavigation < 180) return;
    lastNavigation = performance.now();
    // Selection changes synchronously; fetching the original may continue in
    // the background. Never block a second deliberate swipe on a network read.
    try { Promise.resolve(navigate(direction)).catch(() => {}); } catch { /* UI owns its error state. */ }
  };

  root.addEventListener('pointerdown', event => {
    if (!isOpen() || !overMedia(event.target) || !event.isPrimary || event.button !== 0) return;
    active = { id: event.pointerId, x: event.clientX, y: event.clientY, started: performance.now(), direction: '' };
  }, true);
  window.addEventListener('pointermove', event => {
    if (!active || event.pointerId !== active.id || !isOpen()) return;
    const dx = event.clientX - active.x, dy = event.clientY - active.y;
    if (Math.abs(dy) > 13 && Math.abs(dy) > Math.abs(dx) * 1.05) { reset(); return; }
    if (Math.abs(dx) > 17 && Math.abs(dx) > Math.abs(dy) * SWIPE_DOMINANCE) {
      active.direction = dx > 0 ? 'right' : 'left';
      root.classList.add('studio-viewer-swiping');
    }
  }, true);
  window.addEventListener('pointerup', event => {
    if (!active || event.pointerId !== active.id) return;
    const gesture = active;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    reset();
    if (!isOpen() || !gesture.direction || Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * SWIPE_DOMINANCE) return;
    navigateOnce(dx < 0 ? 1 : -1);
  }, true);
  window.addEventListener('pointercancel', event => { if (active?.id === event.pointerId) reset(); }, true);
  window.addEventListener('blur', reset);
  root.querySelector('#studioDetailsPanel')?.addEventListener('close', reset);

  window.addEventListener('keydown', event => {
    if (!isOpen() || !['ArrowLeft', 'ArrowRight'].includes(event.key) || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (target instanceof Element && (target.closest('input, textarea, select, [contenteditable="true"], [role="slider"], [role="radio"]') || target.closest('.studio-detail-information'))) return;
    event.preventDefault();
    navigateOnce(event.key === 'ArrowRight' ? 1 : -1);
  });

  root.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('[data-viewer-direction]') : null;
    if (!button || !root.contains(button) || !isOpen()) return;
    const direction = button.dataset.viewerDirection === 'next' ? 1 : button.dataset.viewerDirection === 'prev' ? -1 : 0;
    if (!direction || button.disabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    navigateOnce(direction);
  }, true);

  return { reset };
}
