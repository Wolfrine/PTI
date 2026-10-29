// Pure, synthetic asset graphs only: no fetch, credentials or private records.
const assert = require('node:assert/strict');
const test = require('node:test');
const { collectAssetGraph, verifyAssetGraphs } = require('./verify-production.cjs');

function fixture() {
  const localHtml = '<link rel="stylesheet" href="styles-DDDDDDDD.css"><link rel="modulepreload" href="chunk-BBBBBBBB.js"><script src="polyfills-EEEEEEEE.js" type="module"></script><script src="main-AAAAAAAA.js" type="module"></script>';
  const local = new Map([
    ['main-AAAAAAAA.js', 'import{value}from"./chunk-BBBBBBBB.js";import("./chunk-CCCCCCCC.js").then(console.log);console.log(value);'],
    ['chunk-BBBBBBBB.js', 'export const value=42;'],
    ['chunk-CCCCCCCC.js', 'import{value}from"./chunk-BBBBBBBB.js";export const atlas=value+1;'],
    ['styles-DDDDDDDD.css', '.synthetic{color:red}'],
    ['polyfills-EEEEEEEE.js', 'globalThis.syntheticPolyfill=true;'],
  ].map(([name, text]) => [name, Buffer.from(text)]));
  const rename = text => text.replaceAll('main-AAAAAAAA.js', 'main-FFFFFFFF.js').replaceAll('chunk-BBBBBBBB.js', 'chunk-GGGGGGGG.js').replaceAll('chunk-CCCCCCCC.js', 'chunk-HHHHHHHH.js');
  const live = new Map([...local].map(([name, bytes]) => [rename(name), Buffer.from(rename(bytes.toString()))]));
  return { localHtml, local, liveHtml: rename(localHtml), live };
}
const verify = f => verifyAssetGraphs(f.localHtml, f.local, f.liveHtml, f.live);

test('unchanged assets are reported as byte-identical', () => {
  const f = fixture();
  const result = verifyAssetGraphs(f.localHtml, f.local, f.localHtml, f.local);
  assert.equal(result.generatedAssetsVerified, 5);
  assert.equal(result.byteIdenticalAssets, 5);
  assert.equal(result.filenameRelinkedAssets, 0);
  assert.equal(result.entryHtml, 'byte-identical');
});

test('proven filename-only relinking is accepted and counted separately', () => {
  const result = verify(fixture());
  assert.deepEqual(result, { generatedAssetsVerified: 5, byteIdenticalAssets: 3, filenameRelinkedAssets: 2, renamedAssetFiles: 3, entryHtml: 'filename-relinked' });
});

test('changed source bytes fail even when filenames look generated', () => {
  const f = fixture();
  f.live.set('chunk-GGGGGGGG.js', Buffer.from('export const value=43;'));
  assert.throws(() => verify(f), /asset match|source differs/);
});

test('new generated dependencies fail the asset-count check', () => {
  const f = fixture();
  f.live.set('chunk-IIIIIIII.js', Buffer.from('export const extra=true;'));
  f.live.set('main-FFFFFFFF.js', Buffer.concat([f.live.get('main-FFFFFFFF.js'), Buffer.from('import("./chunk-IIIIIIII.js");')]));
  assert.throws(() => verify(f), /counts differ/);
});

test('missing and same-count unmapped dependencies fail closed', () => {
  const f = fixture();
  f.live.delete('chunk-GGGGGGGG.js');
  assert.throws(() => verify(f), /counts differ/);
  f.live.set('chunk-IIIIIIII.js', Buffer.from('export const value=42;'));
  assert.throws(() => verify(f), /Missing or unmapped/);
});

test('rewiring imports between existing chunks cannot pass skeleton matching', () => {
  const f = fixture();
  f.live.set('main-FFFFFFFF.js', Buffer.from(f.live.get('main-FFFFFFFF.js').toString().replace('from"./chunk-GGGGGGGG.js"', 'from"./chunk-HHHHHHHH.js"')));
  assert.throws(() => verify(f), /dependency edges differ/);
});

test('ambiguous identical chunks are rejected instead of guessed', () => {
  const html = '<script src="main-AAAAAAAA.js"></script>';
  const assets = new Map([
    ['main-AAAAAAAA.js', Buffer.from('import"./chunk-BBBBBBBB.js";import"./chunk-CCCCCCCC.js";')],
    ['chunk-BBBBBBBB.js', Buffer.from('export const value=1;')],
    ['chunk-CCCCCCCC.js', Buffer.from('export const value=1;')],
  ]);
  assert.throws(() => verifyAssetGraphs(html, assets, html, assets), /ambiguous/);
});

test('changed entry scripts or non-filename HTML are rejected', () => {
  const f = fixture();
  f.liveHtml += '<script>globalThis.injected=true;</script>';
  assert.throws(() => verify(f), /Entry HTML/);
  const reversed = fixture();
  reversed.liveHtml = reversed.liveHtml.replace('src="main-FFFFFFFF.js" type="module"', 'src="main-FFFFFFFF.js" type="text/javascript"');
  assert.throws(() => verify(reversed), /Entry HTML/);
});

test('lossy text decoding is never used to establish byte identity', () => {
  const f = fixture();
  f.live.set('chunk-GGGGGGGG.js', Buffer.from([0xff, 0xfe]));
  assert.throws(() => verify(f), /lossless UTF-8/);
});

test('recursive discovery reads every synthetic dependency once and obeys its bound', async () => {
  const f = fixture(), reads = [];
  const load = async name => { reads.push(name); assert(f.live.has(name)); return f.live.get(name); };
  const graph = await collectAssetGraph(f.liveHtml, load, f.live.size);
  assert.deepEqual(new Set(reads), new Set(f.live.keys()));
  assert.equal(reads.length, f.live.size);
  assert.equal(verifyAssetGraphs(f.localHtml, f.local, f.liveHtml, graph).filenameRelinkedAssets, 2);
  await assert.rejects(collectAssetGraph(f.liveHtml, load, f.live.size - 1), /reviewed asset bound/);
});
