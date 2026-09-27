// A deployed interface is not proof that its private backend has been activated.
let runtime = { cloudReady: false, reason: 'Cloud activation is pending. No personal data can be saved yet.' };
try {
  const response = await fetch('/runtime-status.json', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
  if (response.ok) runtime = await response.json();
} catch { runtime.reason = 'Cloud status is unavailable. The sample works without saving personal data.'; }
const sample = new URLSearchParams(location.search).get('demo') === '1';
if (!runtime.cloudReady) {
  document.addEventListener('click', event => {
    const action = event.target.closest('button')?.dataset.action;
    if (['login', 'logout', 'exit-demo'].includes(action)) {
      event.preventDefault(); event.stopImmediatePropagation(); location.assign('/');
    }
  }, true);
}
if (runtime.cloudReady || sample) {
  await import('./app.mjs');
} else {
  document.querySelector('#app').innerHTML = `<div class="welcome"><a class="brand" href="/"><span class="mark" aria-hidden="true"></span>Personal <span class="eyebrow">/ PTI</span></a><main id="main" class="welcome-grid"><section><div class="eyebrow">Personal intelligence · preview release</div><h1>A little signal.<br><em>Room to think.</em></h1><p>A finite collection of what matters. A place for your thoughts. Questions that continue beyond the feed.</p><div class="banner"><strong>Cloud activation pending.</strong><br>This deployment is a preview. Sign-in, private saving, news publishing and agent access are not active.</div><div class="actions"><a class="primary" href="/?demo=1">Explore the working sample</a><button class="secondary" id="retry">Check activation</button></div><p class="hint">The sample uses fictional material. Its changes last only for the open session and are never uploaded.</p></section><aside class="welcome-aside"><article><div class="eyebrow">01 / Today</div><h2>Enough to be informed.</h2><p>Five items, source context and explicit feedback. No endless feed.</p></article><article><div class="eyebrow">02 / Capture</div><h2>Keep your own interpretation.</h2><p>A thought, a link or an open question. Connect it to what you read.</p></article><article><div class="eyebrow">03 / Threads</div><h2>Let a question continue.</h2><p>Connect observations to questions you choose to explore.</p></article></aside></main><footer>The private runtime remains isolated from existing PTI, Velum and Luminary data. No live-data or AI-agent connection is implied by this preview.</footer></div>`;
  document.querySelector('#retry').addEventListener('click', () => location.reload());
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}
