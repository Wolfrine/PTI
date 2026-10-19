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

export async function buildDedicatedArtifact(destination){
  // This is a sibling of the complete PTI artifact, never a new independent
  // application build. Authentication remains the same Angular /login route.
  const complete=path.resolve(destination),production=path.resolve(repoRoot,'pti-app/dist/pti-app/browser');
  // Angular nests its browser artifact one level below dist/pti-app. Firebase's
  // dedicated target is dist/one-piece-app. Scratch builds stay beside their
  // caller-supplied fixture rather than ever cleaning the production directory.
  const parent=complete===production?path.resolve(repoRoot,'pti-app/dist'):path.dirname(complete);
  const dedicated=path.resolve(parent,'one-piece-app');
  if(dedicated===complete||path.basename(dedicated)!=='one-piece-app'||path.dirname(dedicated)!==parent||dedicated.startsWith(complete+path.sep))throw new Error('Invalid dedicated Hosting artifact path');
  await stat(path.join(complete,'index.html'));
  await rm(dedicated,{recursive:true,force:true});
  await cp(complete,dedicated,{recursive:true});
  const manifestPath=path.join(dedicated,'one-piece/manifest.webmanifest');
  let manifest;
  try{manifest=JSON.parse(await readFile(manifestPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(manifest){
    manifest.scope='/';
    const manifestBytes=JSON.stringify(manifest,null,2)+'\n';
    await writeFile(manifestPath,manifestBytes);
    // A login navigation must not advertise/install the PTI identity on this
    // dedicated origin. Retain Angular code and only change its document metadata.
    await writeFile(path.join(dedicated,'manifest.webmanifest'),manifestBytes);
    const rootIndex=path.join(dedicated,'index.html');
    let html=await readFile(rootIndex,'utf8');
    html=html.replace(/<title>[^<]*<\/title>/i,'<title>One Piece · Sign in</title>')
      .replace(/(<link\b[^>]*\brel=["']manifest["'][^>]*\bhref=["'])[^"']+(["'])/i,'$1/one-piece/manifest.webmanifest$2')
      .replace(/(<link\b[^>]*\brel=["']icon["'][^>]*\bhref=["'])[^"']+(["'])/i,'$1/one-piece/icons/icon.svg$2')
      .replace(/(<link\b[^>]*\brel=["']icon["'][^>]*\btype=["'])image\/x-icon(["'])/i,'$1image/svg+xml$2');
    await writeFile(rootIndex,html);
    const ngswPath=path.join(dedicated,'ngsw.json');
    try{
      const ngsw=JSON.parse(await readFile(ngswPath,'utf8'));
      for(const [url,bytes] of [['/index.html',html],['/manifest.webmanifest',manifestBytes]]){
        if(ngsw.hashTable?.[url])ngsw.hashTable[url]=createHash('sha1').update(bytes).digest('hex');
      }
      await writeFile(ngswPath,JSON.stringify(ngsw,null,2));
    }catch(error){if(error.code!=='ENOENT')throw error;}
  }
  return dedicated;
}

export async function buildOnePiece({ destination = path.join(repoRoot, 'pti-app/dist/pti-app/browser'), webRoot = path.join(appRoot, 'web') } = {}) {
  // A missing PTI build is a hard error. This script only extends that complete artifact.
  await stat(path.join(destination, 'index.html'));
  const index = await readFile(path.join(webRoot, 'index.html'), 'utf8');
  const entry = path.join(webRoot, 'src/main.mjs');
  await stat(entry);
  const output = path.join(destination, 'one-piece');
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
  return { output, dedicatedArtifact, episodeCount: catalog.summary.listedEpisodes, production: true, completePtiArtifact: destination };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await buildOnePiece(), null, 2));
}
