// Purely visual feedback for one held affection gesture.
// Particles are NOT votes; the gesture controller commits exactly one event on release.
export function createHeartEffects({
  stage, field, random = Math.random, reducedMotion = false
}) {
  let core = null;
  let lastLevel = 0;
  let lastEmission = 0;

  function localPoint(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    return {
      x: Math.max(16, Math.min(rect.width - 16, clientX - rect.left)),
      y: Math.max(16, Math.min(rect.height - 16, clientY - rect.top))
    };
  }

  function particle(x, y) {
    if (reducedMotion) return;
    const existing = field.querySelectorAll('.heart-particle');
    if (existing.length >= 36) existing[0].remove();
    const element = document.createElement('span');
    element.className = 'heart-particle';
    element.textContent = '♥';
    const point = localPoint(x, y);
    const dx = (random() - .5) * 148;
    const dy = -(55 + random() * 113);
    element.style.setProperty('--heart-x', `${point.x}px`);
    element.style.setProperty('--heart-y', `${point.y}px`);
    element.style.setProperty('--heart-dx', `${Math.round(dx)}px`);
    element.style.setProperty('--heart-dy', `${Math.round(dy)}px`);
    element.style.setProperty('--heart-rot', `${Math.round((random() - .5) * 55)}deg`);
    element.style.setProperty('--heart-size', `${Math.round(17 + random() * 19)}px`);
    element.style.setProperty('--heart-duration', `${Math.round(760 + random() * 520)}ms`);
    element.style.setProperty('--heart-scale', String(0.8 + random() * 0.85));
    element.addEventListener('animationend', () => element.remove(), { once: true });
    field.appendChild(element);
  }

  function burst(x, y, amount) {
    for (let i = 0; i < amount; i++) particle(x, y);
  }

  function removeCore() {
    core?.remove();
    core = null;
  }

  function start({ x, y }) {
    removeCore();
    lastLevel = 0;
    lastEmission = 0;
    const point = localPoint(x, y);
    core = document.createElement('span');
    core.className = 'heart-core';
    core.style.setProperty('--heart-x', `${point.x}px`);
    core.style.setProperty('--heart-y', `${point.y}px`);
    core.innerHTML = '<span class="heart-mark">♥</span><span class="heart-level">1</span>';
    field.appendChild(core);
  }

  function progress({ x, y, level, durationMs }) {
    if (!core) return;
    const point = localPoint(x, y);
    core.style.setProperty('--heart-x', `${point.x}px`);
    core.style.setProperty('--heart-y', `${point.y}px`);
    core.querySelector('.heart-level').textContent = String(level);
    if (level > lastLevel) {
      burst(x, y, 4 + level * 2);
      lastLevel = level;
      lastEmission = durationMs;
    } else if (durationMs - lastEmission >= 180) {
      particle(x, y);
      lastEmission = durationMs;
    }
  }

  function finish({ x, y, level }) {
    removeCore();
    burst(x, y, 4 + level);
  }

  function cancel() {
    removeCore();
    lastLevel = 0;
    lastEmission = 0;
  }

  function reset() {
    cancel();
    field.replaceChildren();
  }

  return { start, progress, finish, cancel, reset };
}
