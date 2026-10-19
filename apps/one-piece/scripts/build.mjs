import { build } from 'esbuild';
import { readFile, writeFile, mkdir, cp, readdir, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const appRoot = fileURLToPath(new URL('../', import.meta.url));
export const repoRoot = path.resolve(appRoot, '../..');
export function publicCatalog(source) {
  const clean = episode => ({ id: episode.id, episodeNumber: episode.episodeNumber, availability: episode.availability,
    title: episode.title ?? null, titleProvenance: episode.titleProvenance ?? null });
  return { schemaVersion: source.schemaVersion, summary: source.summary, episodes: source.episodes.map(clean), endBoundary: clean(source.endBoundary) };
}

// A redirect may carry viewing intent, never credentials or arbitrary URLs.
export function safeAppReturnPath(raw) {
  if(typeof raw!=='string'||raw.length>2048||!raw.startsWith('/')||raw.startsWith('//')||/[\\\u0000-\u0020\u007f]/.test(raw))return '/one-piece/';
  let decoded;
  try{decoded=decodeURIComponent(raw);}catch{return '/one-piece/';}
  if(/%[0-9a-f]{2}|[\\\u0000-\u001f\u007f]/i.test(decoded))return '/one-piece/';
  const pathname=raw.split(/[?#]/,1)[0];
  if(!/^\/one-piece(?:\/(?:index\.html|watch(?:\/(?:\d{1,4}|one-piece-\d{4}))?)?)?$/.test(pathname))return '/one-piece/';
  const input=new URL(raw,'https://one-piece.invalid'),target=new URL('/one-piece/','https://one-piece.invalid');
  const episode=input.searchParams.get('episode')??pathname.match(/\/watch\/(\d{1,4}|one-piece-\d{4})$/)?.[1];
  if(/^(?:\d{1,4}|one-piece-\d{4})$/.test(episode??'')){
    const number=Number(episode.replace('one-piece-',''));
    if(number>=1&&number<=1085)target.searchParams.set('episode',episode);
  }
  const from=input.searchParams.get('from'),range=input.searchParams.get('range');
  if(/^(?:continue|library|watch|bookmark)$/.test(from??''))target.searchParams.set('from',from);
  if(/^\d{1,4}$/.test(range??'')&&Number(range)>=1&&Number(range)<=1085)target.searchParams.set('range',range);
  if(/^#(?:player|main-content|episodes|episode-\d{1,4})$/.test(input.hash))target.hash=input.hash;
  return target.pathname+target.search+target.hash;
}

export function canonicalAppUrl(raw) {
  let input;
  try{input=new URL(raw);}catch{return 'https://pti-app-2ab59-one-piece.web.app/one-piece/';}
  const requested=input.pathname==='/login'?input.searchParams.get('redirect'):input.pathname+input.search+input.hash;
  return 'https://pti-app-2ab59-one-piece.web.app'+safeAppReturnPath(requested);
}

export function redirectDocument() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex"><title>Opening One Piece</title></head><body><p>Opening One Piece…</p><p><a id="open-app" href="https://pti-app-2ab59-one-piece.web.app/one-piece/">Open One Piece</a></p><script>${safeAppReturnPath.toString()}\n${canonicalAppUrl.toString()}\nconst destination=canonicalAppUrl(location.href);document.getElementById('open-app').href=destination;location.replace(destination);</script></body></html>`;
}

export function legacyRedirectWorker() {
  // Claim without navigating clients: an already-playing episode keeps running.
  return `const REDIRECT=${JSON.stringify(redirectDocument())};
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('one-piece-shell-'))await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method==='GET'&&event.request.mode==='navigate'&&url.origin===self.location.origin&&/^\\/one-piece(?:\\/|$)/.test(url.pathname))event.respondWith(Promise.resolve(new Response(REDIRECT,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));});\n`;
}

export function angularRetirementWorker() {
  // This file exists only on the dedicated origin. Never clear identity/progress
  // storage or navigate clients, and leave the /one-piece/ registration alone.
  return `self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('ngsw:'))await caches.delete(key);await self.clients.claim();await self.registration.unregister();})()));\n`;
}

export async function buildDedicatedArtifact(destination){
  // One canonical app: this target contains no Angular login, PTI hub or sibling assets.
  const complete=path.resolve(destination),production=path.resolve(repoRoot,'pti-app/dist/pti-app/browser');
  // Angular nests its browser artifact one level below dist/pti-app. Firebase's
  // dedicated target is dist/one-piece-app. Scratch builds stay beside their
  // caller-supplied fixture rather than ever cleaning the production directory.
  const parent=complete===production?path.resolve(repoRoot,'pti-app/dist'):path.dirname(complete);
  const dedicated=path.resolve(parent,'one-piece-app');
  if(dedicated===complete||path.basename(dedicated)!=='one-piece-app'||path.dirname(dedicated)!==parent||dedicated.startsWith(complete+path.sep))throw new Error('Invalid dedicated Hosting artifact path');
  await stat(path.join(complete,'index.html'));
  await rm(dedicated,{recursive:true,force:true});
  await mkdir(dedicated,{recursive:true});
  await cp(path.join(complete,'one-piece'),path.join(dedicated,'one-piece'),{recursive:true});
  const manifestPath=path.join(dedicated,'one-piece/manifest.webmanifest');
  let manifest;
  try{manifest=JSON.parse(await readFile(manifestPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(manifest){
    manifest.scope='/';
    const manifestBytes=JSON.stringify(manifest,null,2)+'\n';
    await writeFile(manifestPath,manifestBytes);
    await writeFile(path.join(dedicated,'manifest.webmanifest'),manifestBytes);
  }
  await writeFile(path.join(dedicated,'index.html'),redirectDocument());
  await writeFile(path.join(dedicated,'ngsw-worker.js'),angularRetirementWorker());
  const ownIndex=path.join(dedicated,'one-piece/index.html');
  try{
    const html=await readFile(ownIndex,'utf8');
    const retireRoot="<script>if('serviceWorker'in navigator)navigator.serviceWorker.getRegistrations().then(list=>Promise.all(list.filter(r=>r.scope===location.origin+'/').map(r=>r.update().catch(()=>{})))).catch(()=>{});</script>";
    await writeFile(ownIndex,html.replace('</head>',retireRoot+'</head>'));
  }catch(error){if(error.code!=='ENOENT')throw error;}
  return dedicated;
}

export async function buildOnePiece({ destination = path.join(repoRoot, 'pti-app/dist/pti-app/browser'), webRoot = path.join(appRoot, 'web') } = {}) {
  // A missing PTI build is a hard error. This script only extends that complete artifact.
  await stat(path.join(destination, 'index.html'));
  const index = await readFile(path.join(webRoot, 'index.html'), 'utf8');
  const entry = path.join(webRoot, 'src/main.mjs');
  await stat(entry);
  const output = path.join(destination, 'one-piece');
  if(path.dirname(path.resolve(output))!==path.resolve(destination)||path.basename(output)!=='one-piece')throw new Error('Invalid One Piece build path');
  await rm(output,{recursive:true,force:true});
  await mkdir(output, { recursive: true });
  for (const item of await readdir(webRoot, { withFileTypes: true })) {
    if (['src', 'index.html', 'node_modules'].includes(item.name) || item.name.startsWith('.')) continue;
    await cp(path.join(webRoot, item.name), path.join(output, item.name), { recursive: true });
  }
  const result = await build({ entryPoints: [entry], outfile: path.join(output, 'app.js'), bundle: true, minify: true,
    format: 'esm', platform: 'browser', target: ['es2022'], define: { __DEV__: 'false' }, sourcemap: false, metafile: true,
    loader: { '.woff2': 'file', '.woff': 'file', '.svg': 'file', '.webp': 'file', '.png': 'file', '.jpg': 'file' }, assetNames: 'assets/[name]-[hash]' });
  const catalog = JSON.parse(await readFile(path.join(repoRoot, 'docs/one-piece/evidence/sources/catalog.json'), 'utf8'));
  await writeFile(path.join(output, 'catalog.json'), JSON.stringify(publicCatalog(catalog)));
  // Version bootstrap URLs as well as the worker. Already-installed workers serve
  // navigations from the network but cache unversioned app.js/css indefinitely.
  // Their query-string bypass lets the new index load this release immediately,
  // without activating a waiting worker or interrupting an existing player.
  const hash=createHash('sha256').update('index.html').update(index);
  for(const asset of ['app.js','app.css','catalog.json','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/icon.svg','sw.js']){
    try{hash.update(asset);hash.update(await readFile(path.join(output,asset)));}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const buildId=hash.digest('hex').slice(0,20);
  let html = index.replace(/(<script\b[^>]*\bsrc=["'])(?:\.\/|\/one-piece\/)?src\/main\.mjs(["'])/g, `$1/one-piece/app.js?v=${buildId}$2`);
  if (!html.includes(`/one-piece/app.js?v=${buildId}`)) throw new Error('web/index.html must load src/main.mjs as a module');
  if (Object.keys(result.metafile.outputs).some(file => file.endsWith('app.css')) && !html.includes('app.css')) html = html.replace('</head>', `<link rel="stylesheet" href="/one-piece/app.css?v=${buildId}"></head>`);
  await writeFile(path.join(output, 'index.html'), html);
  // Identical public inputs retain identical URLs and worker bytes.
  const workerPath=path.join(output,'sw.js');
  try {
    const worker=await readFile(workerPath,'utf8');
    if(!worker.includes('__BUILD_ID__'))throw new Error('The shell worker requires a build content identifier');
    await writeFile(workerPath,worker.replaceAll('__BUILD_ID__',buildId));
  } catch(error){if(error.code!=='ENOENT')throw error;}
  const dedicatedArtifact=await buildDedicatedArtifact(destination);
  // Old links remain usable, but this origin no longer hosts a second app.
  // Compatibility JS/CSS/assets stay available for already-open playback tabs.
  await writeFile(path.join(output,'index.html'),redirectDocument());
  await writeFile(path.join(output,'sw.js'),legacyRedirectWorker());
  await writeFile(path.join(output,'manifest.webmanifest'),'{}\n');
  return { output, dedicatedArtifact, episodeCount: catalog.summary.listedEpisodes, production: true, completePtiArtifact: destination };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await buildOnePiece(), null, 2));
}
