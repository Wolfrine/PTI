import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { publicCatalog, buildOnePiece } from '../scripts/build.mjs';
const repo = new URL('../../../', import.meta.url);
test('public catalogue derives exact real availability and excludes source paths or media URLs', async () => {
  const real = JSON.parse(await readFile(new URL('docs/one-piece/evidence/sources/catalog.json', repo)));
  const catalog = publicCatalog(real);
  assert.equal(catalog.summary.listedEpisodes, 1084);
  assert.deepEqual(catalog.episodes.filter(e => e.availability === 'listed').map(e => e.episodeNumber), Array.from({ length: 1085 }, (_, i) => i + 1).filter(n => n !== 590));
  assert.equal(catalog.endBoundary.episodeNumber, 1086);
  assert.doesNotMatch(JSON.stringify(catalog), /archive\.org|fileName|checksums|candidates|H:[/\\]/);
});
test('Hosting extends the existing default artifact; worker excludes root and nested sibling paths', async () => {
  const firebase = JSON.parse(await readFile(new URL('firebase.json', repo)));
  const hosting = firebase.hosting.find(h => h.target === 'default');
  assert.equal(hosting.public, 'pti-app/dist/pti-app/browser');
  assert.ok(hosting.rewrites.findIndex(r => r.source === '/one-piece{,/**}') < hosting.rewrites.findIndex(r => r.source === '**'));
  assert.ok(hosting.rewrites.some(r => r.source === '/food{,/**}'));
  const worker = JSON.parse(await readFile(new URL('pti-app/ngsw-config.json', repo)));
  assert.ok(worker.navigationUrls.includes('!/one-piece'));
  assert.ok(worker.navigationUrls.includes('!/one-piece/**'));
  assert.deepEqual(firebase.hosting.map(site => site.target), ['default', 'velum', 'luminary', 'sefpo', 'venture']);
});
test('production build retains PTI and removes guarded development auth paths', async () => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'one-piece-build-'));
  try {
    const destination = path.join(scratch, 'browser'), webRoot = path.join(scratch, 'web');
    await mkdir(destination); await mkdir(path.join(webRoot, 'src'), { recursive: true });
    await writeFile(path.join(destination, 'index.html'), '<!doctype html><title>Existing PTI artifact</title>');
    await writeFile(path.join(destination, 'sibling.txt'), 'preserve');
    await writeFile(path.join(webRoot, 'index.html'), '<!doctype html><head></head><script type="module" src="./src/main.mjs"></script>');
    await writeFile(path.join(webRoot, 'src/main.mjs'), 'if (__DEV__) globalThis.DEV_AUTH_BYPASS = true; console.log("production");');
    await writeFile(path.join(webRoot, 'sw.js'), "const VERSION='one-piece-shell-__BUILD_ID__';");
    await buildOnePiece({ destination, webRoot });
    const initialWorker=await readFile(path.join(destination,'one-piece/sw.js'),'utf8');
    assert.doesNotMatch(initialWorker,/__BUILD_ID__/);
    assert.equal(await readFile(path.join(destination, 'sibling.txt'), 'utf8'), 'preserve');
    assert.match(await readFile(path.join(destination, 'index.html'), 'utf8'), /Existing PTI artifact/);
    assert.doesNotMatch(await readFile(path.join(destination, 'one-piece/app.js'), 'utf8'), /DEV_AUTH_BYPASS|__DEV__/);
    assert.match(await readFile(path.join(destination, 'one-piece/index.html'), 'utf8'), /\/one-piece\/app.js/);
    await writeFile(path.join(webRoot,'src/main.mjs'),'console.log("changed public shell");');
    await buildOnePiece({destination,webRoot});
    assert.notEqual(await readFile(path.join(destination,'one-piece/sw.js'),'utf8'),initialWorker);
    await assert.rejects(buildOnePiece({ destination: path.join(scratch, 'missing'), webRoot }), /ENOENT/);
  } finally { assert.equal(path.dirname(path.resolve(scratch)),path.resolve(os.tmpdir()));assert.ok(path.basename(scratch).startsWith('one-piece-build-'));await rm(scratch, { recursive: true, force: true }); }
});
