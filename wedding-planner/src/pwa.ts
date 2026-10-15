import './pwa.css';

interface InstallPrompt extends Event {
  prompt():Promise<void>;
  userChoice:Promise<{outcome:'accepted'|'dismissed'}>;
}
let started=false;
let prompt:InstallPrompt|null=null;
let help:HTMLDialogElement|null=null;
const standalone=()=>matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;
const ios=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);

function installationState() {
  document.body.dataset.pwaInstalled=String(standalone());
}
function showHelp(trigger:HTMLElement) {
  if(!help) {
    help=document.createElement('dialog');help.className='pwa-help';help.setAttribute('aria-labelledby','pwa-help-title');
    help.innerHTML=`<button type="button" class="pwa-close" aria-label="Close installation help">×</button><p class="pwa-eyebrow">MAHIMA & MAYANK</p><h2 id="pwa-help-title">Keep our wedding close.</h2><p>Add one wedding app for the invitation and your family access.</p><ol>${ios()?'<li>Open this page in <strong>Safari</strong>.</li><li>Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</li><li>Tap <strong>Add</strong> to keep it on your home screen.</li>':'<li>Open your browser’s <strong>menu</strong>.</li><li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li><li>Follow the browser’s instructions to add the wedding app.</li>'}</ol><p class="pwa-help-note">The saved invitation can open offline. Family planning needs an internet connection.</p><button type="button" class="pwa-done">Got it</button>`;
    help.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>help?.close()));
    help.addEventListener('click',event=>{if(event.target===help){const r=help!.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)help!.close();}});
    document.body.append(help);
  }
  help.addEventListener('close',()=>{if(trigger.isConnected)trigger.focus();},{once:true});help.showModal();
}
function notice(kind:'offline'|'update',message:string) {
  if(document.querySelector(`[data-pwa-notice="${kind}"]`))return;
  const element=document.createElement('aside');element.className=`pwa-notice pwa-${kind}`;element.dataset.pwaNotice=kind;element.setAttribute('role','status');
  const text=document.createElement('p');text.textContent=message;element.append(text);
  if(kind==='update'){const close=document.createElement('button');close.type='button';close.className='pwa-close';close.setAttribute('aria-label','Dismiss update notice');close.textContent='×';close.addEventListener('click',()=>element.remove());element.append(close);}
  if(kind==='offline')document.body.prepend(element);else document.body.append(element);
}

/** One install identity for invitation and family; no private offline persistence. */
export function startPwa() {
  if(started||typeof document==='undefined')return;started=true;installationState();
  matchMedia('(display-mode: standalone)').addEventListener('change',installationState);
  addEventListener('appinstalled',()=>{prompt=null;document.body.dataset.pwaInstalled='true';help?.close();});
  addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event as InstallPrompt;document.body.dataset.pwaPrompt='available';});
  document.addEventListener('click',async event=>{
    const trigger=(event.target as Element|null)?.closest<HTMLElement>('[data-pwa-install]');if(!trigger)return;event.preventDefault();
    if(standalone()||document.body.dataset.pwaInstalled==='true')return;
    if(prompt&&!ios()){const current=prompt;prompt=null;try{await current.prompt();await current.userChoice;}catch{showHelp(trigger);}finally{delete document.body.dataset.pwaPrompt;}}
    else showHelp(trigger);
  });
  const saved=document.querySelector<HTMLMetaElement>('meta[name="wedding-offline"]')?.content;
  if(saved) {
    const time=new Date(saved);const label=Number.isFinite(time.getTime())?new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit',timeZone:'Asia/Kolkata'}).format(time)+' IST':'earlier';
    notice('offline',`Saved invitation · ${label}. Reconnect to check the latest details.`);
    navigator.serviceWorker?.controller?.postMessage({type:'WEDDING_OFFLINE_DOCUMENT'});
  }
  if(!import.meta.env.PROD||!('serviceWorker' in navigator))return;
  void navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(registration=>{
    const waiting=()=>{if(registration.waiting&&navigator.serviceWorker.controller)notice('update','A wedding update is ready. It will apply after all wedding windows are closed.');};
    waiting();registration.addEventListener('updatefound',()=>{registration.installing?.addEventListener('statechange',waiting);});
    document.body.dataset.pwaState='registered';
  }).catch(()=>{document.body.dataset.pwaState='unavailable';});
}
