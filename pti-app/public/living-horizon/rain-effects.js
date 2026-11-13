// Rain as a painterly weather event: three physical depth cues on one canvas,
// a light atmospheric veil, and optional surface ripples where water is mapped.
// This module never fetches data, records location, or adds an animation loop
// when rain is absent / offscreen / reduced-motion is requested.
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function randomSource(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

const DEPTHS = [
  { name: 'distant', share: .52, velocity: 170, length: 13, width: .78, opacity: .42 },
  { name: 'middle', share: .32, velocity: 295, length: 26, width: 1.05, opacity: .62 },
  { name: 'near', share: .16, velocity: 455, length: 41, width: 1.45, opacity: .86 },
];

/**
 * Parent integration:
 *   const rain = createRainSystem(document.querySelector('#weather-canvas'), frame);
 *   rain.update({active:weather==='rain'||weather==='storm', storm:weather==='storm',
 *     intensity:mmPerHour, wind:windKmPerHour, phase:'day'|'dusk'|'night',
 *     waterBand:{left:.30,right:.85,top:.60,bottom:.74} /* optional, normalized * / });
 *   rain.destroy() when the horizon unmounts.
 *
 * Remove the former requestAnimationFrame/drawRain block in main.js; both
 * implementations must not draw into the same canvas concurrently.
 */
export function createRainSystem(canvas, frame) {
  if (!canvas || !frame) return { update() {}, destroy() {} };
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return { update() {}, destroy() {} };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mist = document.createElement('div');
  mist.className = 'horizon-rain-mist';
  mist.setAttribute('aria-hidden', 'true');
  frame.insertBefore(mist, canvas);
  frame.classList.add('has-rain-system');

  let width = 1;
  let height = 1;
  let scale = 1;
  let raf = 0;
  let elapsed = 0;
  let lastFrame = 0;
  let visible = true;
  let destroyed = false;
  let groups = [];
  let state = {
    active: false, storm: false, intensity: 0, wind: 12, phase: 'day',
    waterBand: null,
  };

  function density() {
    return Math.sqrt(clamp(state.intensity, 0, 20) / 20);
  }

  function rebuild() {
    const box = frame.getBoundingClientRect();
    width = Math.max(1, Math.round(box.width));
    height = Math.max(1, Math.round(box.height));
    scale = Math.min(1.6, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    const random = randomSource(0x71a1a31);
    // Enough spatial detail to read as rainfall even on a wide TV; cap work.
    const total = Math.round(clamp(width * .42, 115, 560));
    groups = DEPTHS.map((depth) => {
      const length = Math.round(total * depth.share);
      const particles = Array.from({ length }, () => ({
        x: random() * (width + 70) - 35,
        y: random() * (height + 80) - 40,
        variance: .76 + random() * .59,
        stroke: .76 + random() * .41,
        drift: .7 + random() * .55,
      }));
      return { ...depth, particles };
    });
  }

  function advance(delta) {
    const power = density();
    const wind = clamp(state.wind, 0, 80);
    for (const group of groups) {
      const activeCount = Math.round(group.particles.length * (.23 + power * .77));
      for (let i = 0; i < activeCount; i++) {
        const drop = group.particles[i];
        drop.y += group.velocity * drop.variance * delta * (1 + power * .32);
        drop.x -= (.12 + wind * .064) * group.velocity * .39 * drop.drift * delta;
        if (drop.y > height + 45) {
          drop.y = -55 - (i % 8) * 11;
          drop.x = ((drop.x * .17 + i * 71.31 + width * 2.3) % (width + 70)) - 35;
        }
        if (drop.x < -85) drop.x += width + 135;
      }
    }
  }

  function paintBand(group, power) {
    const night = state.phase === 'night';
    const storm = state.storm;
    const slant = .10 + clamp(state.wind, 0, 80) * .0096;
    const lengthScale = .70 + power * .50;
    const activeCount = Math.round(group.particles.length * (.23 + power * .77));

    context.save();
    context.lineCap = 'round';
    context.lineWidth = group.width * (storm ? 1.12 : 1);
    context.strokeStyle = group.name === 'distant' ? '#7c9fa8'
      : group.name === 'middle' ? '#d6e9ec' : '#f6fcf8';
    if (night) context.strokeStyle = group.name === 'distant' ? '#9ab8ca' : '#e4f0fa';
    if (group.name === 'near') {
      context.shadowColor = night ? '#9aafc3a0' : '#e7f5f4b2';
      context.shadowBlur = storm ? 2.8 : 1.8;
    }
    for (let i = 0; i < activeCount; i++) {
      const particle = group.particles[i];
      const length = group.length * particle.stroke * lengthScale;
      const shimmer = .82 + .18 * Math.sin(elapsed * .002 + i * 7.3);
      context.globalAlpha = clamp(group.opacity * (.42 + power * .78) * shimmer, .03, .92);
      context.beginPath();
      context.moveTo(particle.x, particle.y);
      context.lineTo(particle.x - length * slant, particle.y + length);
      context.stroke();
    }
    context.restore();
  }

  function paintWaterRipples(power) {
    const band = state.waterBand;
    if (!band || power <= .08) return;
    const left = clamp(Number(band.left), 0, 1);
    const right = clamp(Number(band.right), left, 1);
    const top = clamp(Number(band.top), 0, 1);
    const bottom = clamp(Number(band.bottom), top, 1);
    if (right - left < .02 || bottom - top < .01) return;

    const random = randomSource(0xbed0a11);
    const count = Math.round(5 + power * 13);
    context.save();
    context.strokeStyle = state.phase === 'night' ? '#d4e8f9' : '#f0faf8';
    context.lineWidth = .75;
    for (let i = 0; i < count; i++) {
      const x = width * (left + (right - left) * random());
      const y = height * (top + (bottom - top) * random());
      const age = (elapsed * .00044 * (1 + power) + random()) % 1;
      context.globalAlpha = (.22 + power * .13) * Math.pow(1 - age, 1.7);
      context.beginPath();
      context.ellipse(x, y, 1.1 + age * 6.8, .36 + age * 1.75, 0, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    if (!state.active || state.intensity <= 0) return;
    const power = density();
    // The distant veil is a nearly imperceptible tint, not a tinted rectangle.
    // It communicates moisture in the air behind bright foreground streaks.
    const curtain = context.createLinearGradient(0, height * .15, 0, height * .88);
    curtain.addColorStop(0, 'rgba(190,211,213,0)');
    curtain.addColorStop(.42, 'rgba(190,211,213,.060)');
    curtain.addColorStop(1, 'rgba(211,222,217,0)');
    context.fillStyle = curtain;
    context.globalAlpha = state.storm ? power : power * .66;
    context.fillRect(0, 0, width, height);
    context.globalAlpha = 1;
    for (const group of groups) paintBand(group, power);
    paintWaterRipples(power);
  }

  function tick(timestamp) {
    raf = 0;
    if (!state.active || !visible || document.hidden || reducedMotion.matches || destroyed) return;
    if (lastFrame && timestamp - lastFrame < 31) {
      raf = window.requestAnimationFrame(tick);
      return;
    }
    const delta = lastFrame ? clamp((timestamp - lastFrame) / 1000, 0, .07) : .033;
    lastFrame = timestamp;
    elapsed += delta * 1000;
    advance(delta);
    draw();
    raf = window.requestAnimationFrame(tick);
  }

  function schedule() {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    lastFrame = 0;
    if (destroyed) return;
    draw();
    if (state.active && state.intensity > 0 && visible && !document.hidden && !reducedMotion.matches)
      raf = window.requestAnimationFrame(tick);
  }

  const observer = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      schedule();
    }, { threshold: .02 })
    : null;
  observer?.observe(frame);
  const resize = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => { rebuild(); schedule(); }) : null;
  resize?.observe(frame);
  const onVisibility = () => schedule();
  const onMotion = () => schedule();
  document.addEventListener('visibilitychange', onVisibility);
  reducedMotion.addEventListener?.('change', onMotion);
  rebuild();
  schedule();

  return {
    update(next = {}) {
      if (destroyed) return;
      const intensity = Number(next.intensity);
      const wind = Number(next.wind);
      state = {
        ...state, ...next,
        active: Boolean(next.active ?? state.active),
        storm: Boolean(next.storm ?? state.storm),
        intensity: clamp(Number.isFinite(intensity) ? intensity : state.intensity, 0, 20),
        wind: clamp(Number.isFinite(wind) ? wind : state.wind, 0, 80),
      };
      const power = state.active ? density() : 0;
      frame.style.setProperty('--rain-mist-opacity', (power * (state.storm ? .76 : .51)).toFixed(3));
      frame.style.setProperty('--rain-sheet-opacity', (!power ? 0 : Math.min(.56, .12 + power * .43)).toFixed(3));
      schedule();
    },
    destroy() {
      destroyed = true;
      if (raf) window.cancelAnimationFrame(raf);
      observer?.disconnect();
      resize?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotion.removeEventListener?.('change', onMotion);
      mist.remove();
      frame.classList.remove('has-rain-system');
      frame.style.removeProperty('--rain-mist-opacity');
      frame.style.removeProperty('--rain-sheet-opacity');
      context.clearRect(0, 0, width, height);
    },
  };
}
