const PIN_KEY = 'velum-pin-v1';
const PIN_ITERATIONS = 180000;

function bytesToBase64(bytes) {
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function pinHash(pin, salt, iterations = PIN_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256
  );
  return bytesToBase64(new Uint8Array(bits));
}

async function createPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pinHash(pin, salt);
  localStorage.setItem(PIN_KEY, JSON.stringify({
    v: 1,
    salt: bytesToBase64(salt),
    hash,
    iterations: PIN_ITERATIONS
  }));
}

async function verifyPin(pin) {
  try {
    const record = JSON.parse(localStorage.getItem(PIN_KEY) || 'null');
    if (!record?.salt || !record?.hash) return false;
    const hash = await pinHash(pin, base64ToBytes(record.salt), record.iterations || PIN_ITERATIONS);
    return hash === record.hash;
  } catch {
    return false;
  }
}

function ensurePinOverlay() {
  let overlay = document.getElementById('velumPinGate');
  if (overlay) return overlay;
  overlay = document.createElement('section');
  overlay.id = 'velumPinGate';
  overlay.setAttribute('aria-live', 'polite');
  overlay.style.cssText = [
    'position:fixed','z-index:1000','inset:0','display:grid','place-items:center','padding:28px',
    'background:radial-gradient(100% 70% at 50% 18%,#25151c 0%,#0b0809 58%,#050405 100%)',
    'color:#f6eff1','font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'touch-action:auto'
  ].join(';');
  document.body.appendChild(overlay);
  return overlay;
}

function pinCardMarkup(setup) {
  const title = setup ? 'Create your PIN' : 'Private collection';
  const copy = setup
    ? 'Set a local 4–8 digit PIN for this device.'
    : 'Enter your PIN to open the gallery.';
  const confirm = setup
    ? '<input id="velumPinConfirm" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password" placeholder="Confirm PIN" style="width:100%;padding:13px 14px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:#151013;color:#f6eff1;font-size:18px;text-align:center;letter-spacing:.18em;outline:none" />'
    : '';
  return `
    <div style="width:min(100%,380px);display:flex;flex-direction:column;align-items:center;text-align:center;padding:32px 24px 28px;border:1px solid rgba(255,255,255,.09);border-radius:28px;background:rgba(14,9,11,.72);box-shadow:0 28px 70px rgba(0,0,0,.42);backdrop-filter:blur(20px)">
      <div style="width:48px;height:48px;margin-bottom:22px;border:1px solid rgba(255,255,255,.2);border-radius:50%;display:grid;place-items:center;font:24px Georgia,serif;color:#f3e5e8">V</div>
      <span style="font-size:10px;text-transform:uppercase;letter-spacing:.18em;color:rgba(255,255,255,.62)">Local privacy</span>
      <h1 style="margin:10px 0 10px;font:400 34px/1.05 Georgia,serif;letter-spacing:-.02em">${title}</h1>
      <p style="max-width:300px;margin:0 0 20px;color:#a99da1;font-size:13px;line-height:1.55">${copy}</p>
      <div style="width:100%;display:grid;gap:10px;max-width:250px">
        <input id="velumPinInput" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="${setup ? 'new-password' : 'current-password'}" placeholder="${setup ? 'New PIN' : 'PIN'}" style="width:100%;padding:13px 14px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:#151013;color:#f6eff1;font-size:18px;text-align:center;letter-spacing:.18em;outline:none" />
        ${confirm}
        <button id="velumPinSubmit" style="margin-top:4px;padding:13px 18px;border:0;border-radius:999px;background:#eadde1;color:#25171d;font:600 13px Inter,system-ui;cursor:pointer">${setup ? 'Create PIN' : 'Unlock'}</button>
      </div>
      <small id="velumPinStatus" style="min-height:18px;margin-top:14px;color:#9d8f94;font-size:11px"></small>
    </div>`;
}

function showPinGate({ setup = false } = {}) {
  const overlay = ensurePinOverlay();
  overlay.style.display = 'grid';
  overlay.innerHTML = pinCardMarkup(setup);
  const input = document.getElementById('velumPinInput');
  const confirm = document.getElementById('velumPinConfirm');
  const button = document.getElementById('velumPinSubmit');
  const status = document.getElementById('velumPinStatus');
  setTimeout(() => input?.focus(), 60);

  return new Promise(resolve => {
    const submit = async () => {
      const pin = (input.value || '').trim();
      if (!/^\d{4,8}$/.test(pin)) {
        status.textContent = 'Use 4–8 digits.';
        input.focus();
        return;
      }
      button.disabled = true;
      status.textContent = setup ? 'Securing this device…' : 'Checking…';
      if (setup) {
        if (pin !== (confirm?.value || '').trim()) {
          status.textContent = 'PINs do not match.';
          button.disabled = false;
          confirm?.focus();
          return;
        }
        await createPin(pin);
      } else if (!await verifyPin(pin)) {
        status.textContent = 'Incorrect PIN.';
        input.value = '';
        button.disabled = false;
        input.focus();
        return;
      }
      overlay.style.display = 'none';
      resolve(true);
    };
    button.addEventListener('click', submit);
    [input, confirm].filter(Boolean).forEach(el => el.addEventListener('keydown', e => {
      if (e.key === 'Enter') submit();
    }));
  });
}

async function bootGallery() {
  const hasPin = Boolean(localStorage.getItem(PIN_KEY));
  await showPinGate({ setup: !hasPin });
  await import('./app.js');

  const returnBtn = document.getElementById('returnBtn');
  const neutralScreen = document.getElementById('neutralScreen');
  if (returnBtn && neutralScreen) {
    returnBtn.addEventListener('click', async event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      await showPinGate({ setup: false });
      neutralScreen.classList.remove('open');
    }, true);
  }
}

bootGallery().catch(error => {
  console.error(error);
  const overlay = ensurePinOverlay();
  overlay.style.display = 'grid';
  overlay.innerHTML = '<div style="max-width:320px;text-align:center"><h2 style="font:400 28px Georgia,serif">Could not open Velum</h2><p style="color:#a99da1;font:13px/1.5 system-ui">Reload the app and try again.</p></div>';
});
