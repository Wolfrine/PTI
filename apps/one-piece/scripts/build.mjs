import { build } from 'esbuild';
import { readFile, writeFile, mkdir, cp, readdir, stat } from 'node:fs/promises';
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
  let html = index.replace(/(<script\b[^>]*\bsrc=["'])(?:\.\/|\/one-piece\/)?src\/main\.mjs(["'])/g, '$1/one-piece/app.js$2');
  if (!html.includes('/one-piece/app.js')) throw new Error('web/index.html must load src/main.mjs as a module');
  if (Object.keys(result.metafile.outputs).some(file => file.endsWith('app.css')) && !html.includes('app.css')) html = html.replace('</head>', '<link rel="stylesheet" href="/one-piece/app.css"></head>');
  await writeFile(path.join(output, 'index.html'), html);
  const catalog = JSON.parse(await readFile(path.join(repoRoot, 'docs/one-piece/evidence/sources/catalog.json'), 'utf8'));
  await writeFile(path.join(output, 'catalog.json'), JSON.stringify(publicCatalog(catalog)));
  // Content-derived shell versions prevent a constant worker from caching old app.js
  // forever. Reproducible builds with identical public assets keep the same version.
  const workerPath=path.join(output,'sw.js');
  try {
    const worker=await readFile(workerPath,'utf8');
    const hash=createHash('sha256');
    for(const asset of ['index.html','app.js','app.css','catalog.json','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/icon.svg']){
      try{hash.update(asset);hash.update(await readFile(path.join(output,asset)));}catch(error){if(error.code!=='ENOENT')throw error;}
    }
    if(!worker.includes('__BUILD_ID__'))throw new Error('The shell worker requires a build content identifier');
    await writeFile(workerPath,worker.replaceAll('__BUILD_ID__',hash.digest('hex').slice(0,20)));
  } catch(error){if(error.code!=='ENOENT')throw error;}
  return { output, episodeCount: catalog.summary.listedEpisodes, production: true, completePtiArtifact: destination };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await buildOnePiece(), null, 2));
}
