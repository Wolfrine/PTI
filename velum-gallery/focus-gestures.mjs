/**
 * Focus image gestures. The media opens at its complete, uncropped fit.
 * Double-tap toggles zoom/fit, pinch zooms around the fingers, one finger
 * pans only while zoomed, and a downward swipe dismisses at full fit.
 *
 * All visible controls are deliberately outside this controller.
 */
export function createFocusGestures({ canvas, image, isVideo, onClose, clock = () => performance.now() }) {
  const pointers = new Map();
  let scale = 1;
  let x = 0;
  let y = 0;
  let pinch = null;
  let hadPinch = false;
  let lastTap = null;

  function geometry() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const sourceWidth = image.naturalWidth || width;
    const sourceHeight = image.naturalHeight || height;
    const ratio = sourceWidth / sourceHeight;
    const fittedWidth = Math.min(width, height * ratio);
    const fittedHeight = Math.min(height, width / ratio);
    // Permit inspection up to the original image's native pixel detail,
    // with a high safety ceiling for mobile GPU compositing.
    const nativeZoom = Math.max(sourceWidth / fittedWidth, sourceHeight / fittedHeight);
    const maxScale = Math.max(6, Math.min(24, nativeZoom));
    return { rect, width, height, fittedWidth, fittedHeight, maxScale };
  }

  function clampPan() {
    if (scale <= 1) {
      x = 0; y = 0;
      return;
    }
    const g = geometry();
    const maxX = Math.max(0, (g.fittedWidth * scale - g.width) / 2);
    const maxY = Math.max(0, (g.fittedHeight * scale - g.height) / 2);
    x = Math.max(-maxX, Math.min(maxX, x));
    y = Math.max(-maxY, Math.min(maxY, y));
  }

  function paint() {
    if (!isVideo()) image.style.transform = `translate3d(${x}px,${y}px,0) scale(${scale})`;
  }

  function fit() {
    scale = 1; x = 0; y = 0;
    pinch = null;
    pointers.clear();
    hadPinch = false;
    lastTap = null;
    paint();
  }

  function zoomAt(clientX, clientY) {
    if (scale > 1.025) {
      fit();
      return;
    }
    const g = geometry();
    scale = Math.min(2.5, g.maxScale);
    x = -(clientX - g.rect.left - g.width / 2) * (scale - 1);
    y = -(clientY - g.rect.top - g.height / 2) * (scale - 1);
    clampPan();
    paint();
  }

  function down(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const at = clock();
    pointers.set(event.pointerId, {
      sx: event.clientX, sy: event.clientY,
      x: event.clientX, y: event.clientY,
      at
    });
    if (!isVideo()) {
      try { canvas.setPointerCapture(event.pointerId); } catch {}
    }
    if (pointers.size === 2 && !isVideo()) {
      const [a, b] = [...pointers.values()];
      const g = geometry();
      pinch = {
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
        centerX: g.rect.left + g.width / 2,
        centerY: g.rect.top + g.height / 2,
        scale, x, y
      };
      hadPinch = true;
      lastTap = null;
    }
  }

  function move(event) {
    const point = pointers.get(event.pointerId);
    if (!point || isVideo()) return;
    const dx = event.clientX - point.x;
    const dy = event.clientY - point.y;
    point.x = event.clientX;
    point.y = event.clientY;

    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const nextMidX = (a.x + b.x) / 2;
      const nextMidY = (a.y + b.y) / 2;
      scale = Math.max(1, Math.min(geometry().maxScale, pinch.scale * distance / pinch.distance));
      const factor = scale / pinch.scale;
      x = pinch.x * factor + (nextMidX - pinch.midX) + (pinch.midX - pinch.centerX) * (1 - factor);
      y = pinch.y * factor + (nextMidY - pinch.midY) + (pinch.midY - pinch.centerY) * (1 - factor);
      clampPan();
      paint();
    } else if (pointers.size === 1 && scale > 1.025 && !hadPinch) {
      x += dx;
      y += dy;
      clampPan();
      paint();
    }
  }

  function up(event) {
    const point = pointers.get(event.pointerId);
    if (!point) return;
    const solitary = pointers.size === 1 && !hadPinch;
    const dx = event.clientX - point.sx;
    const dy = event.clientY - point.sy;
    const at = clock();
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) hadPinch = false;
    if (!solitary) return;

    // In videos, allow normal native playback interaction, but permit
    // a deliberate downward swipe to leave the image-free viewer too.
    if ((isVideo() || scale <= 1.025) &&
        dy > 95 && dy > Math.abs(dx) * 1.25) {
      lastTap = null;
      onClose();
      return;
    }
    if (isVideo()) return;
    const isTap = Math.hypot(dx, dy) < 16 && at - point.at < 520;
    if (!isTap) {
      lastTap = null;
      return;
    }
    if (lastTap && at - lastTap.at < 320 &&
        Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 45) {
      lastTap = null;
      zoomAt(event.clientX, event.clientY);
    } else {
      lastTap = { at, x: event.clientX, y: event.clientY };
    }
  }

  function cancel(event) {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) hadPinch = false;
    lastTap = null;
  }

  canvas.addEventListener('pointerdown', down, true);
  canvas.addEventListener('pointermove', move, true);
  canvas.addEventListener('pointerup', up, true);
  canvas.addEventListener('pointercancel', cancel, true);

  return {
    fit,
    getState: () => ({ scale, x, y, maxScale: geometry().maxScale }),
    destroy() {
      canvas.removeEventListener('pointerdown', down, true);
      canvas.removeEventListener('pointermove', move, true);
      canvas.removeEventListener('pointerup', up, true);
      canvas.removeEventListener('pointercancel', cancel, true);
      fit();
    }
  };
}
