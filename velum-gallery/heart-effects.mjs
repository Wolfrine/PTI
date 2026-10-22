import { heartGrowth, heartParticleSizePx } from './affection.mjs';

// Pure visual feedback: hearts are NOT individual votes. One completed
// press is persisted as one duration-based affection event by the app.
export function createHeartEffects({
  stage, field, random = Math.random, reducedMotion = false
}) {
  const MAX_LIVE_PARTICLES = 28;
  let core = null;
  let lastEmission = 0;
  let lastBloom = 0;

  function localPoint(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    return {
      x: Math.max(18, Math.min(rect.width - 18, clientX - rect.left)),
      y: Math.max(18, Math.min(rect.height - 18, clientY - rect.top))
    };
  }

  function particle(x, y, durationMs, { bloom = false } = {}) {
    if (reducedMotion) return;
    const existing = field.querySelectorAll('.heart-particle');
    if (existing.length >= MAX_LIVE_PARTICLES) existing[0].remove();
    const element = document.createElement('span');
    element.className = 'heart-particle';
    element.textContent = '♥';
    const point = localPoint(x, y);
    const growth = heartGrowth(durationMs);
    const size = heartParticleSizePx(durationMs, random());
    const dispersion = 75 + 42 * growth + (bloom ? 25 : 0);
    const dx = (random() - 0.5) * 2 * dispersion;
    const dy = -(55 + random() * (85 + 55 * growth));
    element.style.setProperty('--heart-x', `${point.x}px`);
    element.style.setProperty('--heart-y', `${point.y}px`);
    element.style.setProperty('--heart-dx', `${Math.round(dx)}px`);
    element.style.setProperty('--heart-dy', `${Math.round(dy)}px`);
    element.style.setProperty('--heart-rot', `${Math.round((random() - 0.5) * 58)}deg`);
    element.style.setProperty('--heart-size', `${size}px`);
    element.style.setProperty('--heart-duration',
      `${Math.round(760 + random() * 460 + growth * 180)}ms`);
    element.style.setProperty('--heart-scale', String(0.92 + random() * 0.16));
    element.style.setProperty('--heart-opacity', String(0.75 + random() * 0.25));
    element.addEventListener('animationend', () => element.remove(), { once: true });
    field.appendChild(element);
  }

  function burst(x, y, durationMs, amount, bloom = false) {
    for (let i = 0; i < amount; i++) particle(x, y, durationMs, { bloom });
  }

  function removeCore() {
    core?.remove();
    core = null;
  }

  function start({ x, y }) {
    removeCore();
    lastEmission = 0;
    lastBloom = 0;
    const point = localPoint(x, y);
    core = document.createElement('span');
    core.className = 'heart-core';
    core.setAttribute('aria-hidden', 'true');
    core.style.setProperty('--heart-x', `${point.x}px`);
    core.style.setProperty('--heart-y', `${point.y}px`);
    core.innerHTML = '<span class="heart-mark">♥</span>';
    field.appendChild(core);
  }

  function progress({ x, y, durationMs }) {
    if (!core) return;
    const growth = heartGrowth(durationMs);
    const point = localPoint(x, y);
    core.style.setProperty('--heart-x', `${point.x}px`);
    core.style.setProperty('--heart-y', `${point.y}px`);
    core.style.setProperty('--heart-core-size', `${Math.round(32 + 24 * growth)}px`);
    core.style.setProperty('--heart-core-glow', String(0.35 + 0.5 * growth));

    // Visual intensity evolves continuously, then pulses rhythmically after
    // size stabilizes; the gesture duration is never capped.
    const emissionInterval = Math.round(400 - 165 * growth);
    if (durationMs - lastEmission >= emissionInterval) {
      const amount = growth > 0.7 && random() > 0.68 ? 2 : 1;
      burst(x, y, durationMs, amount);
      lastEmission = durationMs;
    }
    const bloomInterval = Math.round(1750 - 550 * growth);
    if (durationMs > 1700 && durationMs - lastBloom >= bloomInterval) {
      burst(x, y, durationMs, 2 + Math.round(growth * 3), true);
      lastBloom = durationMs;
    }
  }

  function finish({ x, y, durationMs }) {
    removeCore();
    const growth = heartGrowth(durationMs);
    burst(x, y, durationMs, 4 + Math.round(growth * 5), true);
  }

  function cancel() {
    removeCore();
    lastEmission = 0;
    lastBloom = 0;
  }

  function reset() {
    cancel();
    field.replaceChildren();
  }

  return { start, progress, finish, cancel, reset };
}
