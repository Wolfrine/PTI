import './motion.css';

/** Progressive invitation motion; content never relies on animation to become visible. */
export function startInvitationMotion() {
  const hero = document.querySelector<HTMLElement>('.garden-hero');
  if (!hero || hero.dataset.motionReady) return;
  hero.dataset.motionReady = 'true';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const opening: Animation[] = [];
  const ambient: Animation[] = [];
  const botanical = document.createElement('div');
  botanical.className = 'motion-botanical'; botanical.setAttribute('aria-hidden', 'true');
  botanical.innerHTML = '<svg viewBox="0 0 160 230" fill="none" focusable="false"><path d="M54 219C99 184 57 148 99 94C111 75 114 48 114 18"/><path d="M65 176C31 178 20 159 25 147C51 145 68 155 65 176ZM79 151C106 159 124 142 121 127C96 123 79 133 79 151ZM91 110C65 117 48 101 54 84C78 81 94 92 91 110ZM108 72C133 73 145 52 135 39C115 42 106 54 108 72Z"/><path d="M65 176 39 158M79 151 109 136M91 110 65 92M108 72 129 49"/></svg>';
  hero.append(botanical);
  const sway = botanical.animate([{ transform: 'translate(0,0) rotate(-1deg)' }, { transform: 'translate(3px,-6px) rotate(2deg)', offset: .5 }, { transform: 'translate(0,0) rotate(-1deg)' }], { duration: 10500, iterations: Infinity, easing: 'ease-in-out' });
  sway.id = 'botanical-sway'; ambient.push(sway);
  let userPaused = false;
  try { userPaused = localStorage.getItem('wedding-motion') === 'paused'; } catch { /* Motion works without storage. */ }
  let inView = hero.getBoundingClientRect().bottom > 0 && hero.getBoundingClientRect().top < innerHeight;
  let pageActive = true;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'motion-toggle'; button.dataset.motionToggle = '';
  hero.append(button);
  const label = () => {
    button.hidden = reduced.matches;
    button.setAttribute('aria-pressed', String(userPaused));
    button.innerHTML = `<svg viewBox="0 0 12 14" aria-hidden="true">${userPaused ? '<path d="M2 1 11 7 2 13Z"/>' : '<path d="M2 1h3v12H2ZM8 1h3v12H8Z"/>'}</svg><span>${userPaused ? 'Resume motion' : 'Pause motion'}</span>`;
  };
  const sync = () => {
    label();
    const state = reduced.matches ? 'reduced' : userPaused ? 'paused' : !pageActive || document.visibilityState === 'hidden' ? 'background' : !inView ? 'offscreen' : 'playing';
    hero.dataset.motionState = state;
    for (const animation of opening) {
      if (state === 'reduced') animation.cancel();
      else if (state === 'playing' && animation.playState !== 'finished' && animation.playState !== 'idle') animation.play();
      else if (state !== 'playing' && animation.playState !== 'finished' && animation.playState !== 'idle') animation.pause();
    }
    for (const animation of ambient) {
      if (state === 'reduced') animation.cancel();
      else if (state === 'playing') animation.play();
      else animation.pause();
    }
  };
  if (!reduced.matches && !userPaused) {
    const enter = (selector: string, delay: number, distance = 10) => {
      const element = hero.querySelector(selector);
      if (element) opening.push(element.animate([{ opacity: .7, transform: `translateY(${distance}px)` }, { opacity: 1, transform: 'translateY(0)' }], { duration: 760, delay, easing: 'cubic-bezier(.2,.7,.25,1)', fill: 'backwards' }));
    };
    enter('.eyebrow', 0, 6); enter('h1', 70); enter('.date-caption', 160, 7); enter('.hero-date', 200, 7); enter('.guest-welcome', 270, 7);
    const scene = hero.querySelector('.scene');
    if (scene) opening.push(scene.animate([{ transform: 'scale(1.025)', opacity: .86 }, { transform: 'scale(1)', opacity: 1 }], { duration: 1800, easing: 'cubic-bezier(.2,.6,.25,1)' }));
  }
  button.addEventListener('click', () => {
    userPaused = !userPaused;
    // A deliberate pause must never leave names/date washed out or displaced.
    if (userPaused) for (const animation of opening) if (animation.playState !== 'idle') animation.finish();
    try { localStorage.setItem('wedding-motion', userPaused ? 'paused' : 'playing'); } catch { /* Optional preference only. */ }
    sync();
  });
  const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); }, { threshold: .05 });
  observer.observe(hero);
  reduced.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  addEventListener('pagehide', () => { pageActive = false; sync(); });
  addEventListener('pageshow', () => { pageActive = true; inView = hero.getBoundingClientRect().bottom > 0 && hero.getBoundingClientRect().top < innerHeight; sync(); });
  sync();
}
