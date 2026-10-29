// Read-only release check. Private records are never requested by this script.
// Build runtimes may choose different generated filenames for identical code.
// Permit only a proven one-to-one filename relinking, never changed code bytes.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const GENERATED = '(?:main|chunk|styles|polyfills)-[A-Z0-9]{8}\\.(?:js|css)';
const isGeneratedAssetName = name => new RegExp(`^${GENERATED}$`).test(name);
const referencePattern = () => new RegExp(`(["'])(\\.?/)?(${GENERATED})\\1`, 'g');
const assetReferences = text => [...text.matchAll(referencePattern())].map(match => match[3]);
const replaceReferences = (text, resolve) => text.replace(referencePattern(), (_, quote, prefix, name) => `${quote}${prefix || ''}${resolve(name)}${quote}`);
const assetKind = name => name.replace(/-[A-Z0-9]{8}(?=\.)/, '');
const hash = value => createHash('sha256').update(value).digest('hex');

function assetText(value, name) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const text = bytes.toString('utf8');
  assert(Buffer.from(text, 'utf8').equals(bytes), `Generated asset is not lossless UTF-8: ${name}`);
  return text;
}

function assertCompleteGraph(html, assets) {
  assert(assets instanceof Map && assets.size > 0, 'A nonempty generated asset map is required');
  for (const name of assets.keys()) assert(isGeneratedAssetName(name), 'Unexpected generated asset name');
  const pending = assetReferences(html), visited = new Set();
  assert(pending.length > 0, 'No generated entry assets were found');
  while (pending.length) {
    const name = pending.pop();
    if (visited.has(name)) continue;
    assert(assets.has(name), `Missing or unmapped generated dependency: ${name}`);
    visited.add(name);
    pending.push(...assetReferences(assetText(assets.get(name), name)));
  }
  assert.equal(visited.size, assets.size, 'Unreachable or extra generated assets are not accepted');
}

// Only fixed-origin, validated basenames are passed to the caller's loader.
// Quoted ./name, /name and bare names preserve their original prefix/quotes.
async function collectAssetGraph(html, load, maximumAssets = 200) {
  const pending = assetReferences(html), assets = new Map();
  assert(pending.length > 0, 'No generated entry assets were found');
  while (pending.length) {
    const name = pending.pop();
    if (assets.has(name)) continue;
    assert(isGeneratedAssetName(name), 'Unexpected generated asset name');
    assert(assets.size < maximumAssets, 'Generated dependency graph exceeds the reviewed asset bound');
    const bytes = Buffer.from(await load(name));
    assets.set(name, bytes);
    pending.push(...assetReferences(assetText(bytes, name)));
  }
  return assets;
}

function verifyAssetGraphs(localHtml, localAssets, liveHtml, liveAssets) {
  assert.equal(liveAssets.size, localAssets.size, 'Generated asset counts differ');
  assertCompleteGraph(localHtml, localAssets);
  assertCompleteGraph(liveHtml, liveAssets);
  const describe = (name, bytes) => {
    const text = assetText(bytes, name);
    // Normalize only recognized, quoted generated-file references. All other
    // text, import syntax, path prefixes, source and whitespace remain exact.
    const skeleton = replaceReferences(text, dependency => `__GENERATED_${assetKind(dependency)}__`);
    return { name, text, skeleton, key: `${assetKind(name)}:${hash(skeleton)}` };
  };
  const local = [...localAssets].map(([name, bytes]) => describe(name, bytes));
  const live = [...liveAssets].map(([name, bytes]) => describe(name, bytes));
  const groups = entries => {
    const result = new Map();
    for (const entry of entries) {
      const found = result.get(entry.key) || [];
      found.push(entry); result.set(entry.key, found);
    }
    return result;
  };
  const localGroups = groups(local), liveGroups = groups(live), mapping = new Map();
  for (const entry of local) {
    const candidates = liveGroups.get(entry.key) || [];
    assert(localGroups.get(entry.key).length === 1 && candidates.length === 1, `Missing or ambiguous generated asset match: ${entry.name}`);
    const matched = candidates[0];
    assert(entry.skeleton === matched.skeleton, `Generated asset source differs: ${entry.name}`);
    mapping.set(entry.name, matched.name);
  }
  assert.equal(new Set(mapping.values()).size, liveAssets.size, 'Asset mapping must be one-to-one and complete');
  const resolve = name => {
    assert(mapping.has(name), `Unmapped generated dependency: ${name}`);
    return mapping.get(name);
  };
  let byteIdenticalAssets = 0, filenameRelinkedAssets = 0;
  for (const entry of local) {
    const matchedName = resolve(entry.name), liveBytes = Buffer.from(liveAssets.get(matchedName));
    const relinked = Buffer.from(replaceReferences(entry.text, resolve), 'utf8');
    assert(relinked.equals(liveBytes), `Asset bytes or dependency edges differ beyond proven filename relinking: ${entry.name}`);
    if (Buffer.from(localAssets.get(entry.name)).equals(liveBytes)) byteIdenticalAssets++;
    else filenameRelinkedAssets++;
  }
  // This checks the ordered entry-script/preload graph, attributes and inline
  // code too; an added script or non-filename HTML change is not silently ignored.
  assert(replaceReferences(localHtml, resolve) === liveHtml, 'Entry HTML or entry dependency graph differs beyond proven filename relinking');
  return {
    generatedAssetsVerified: localAssets.size,
    byteIdenticalAssets,
    filenameRelinkedAssets,
    renamedAssetFiles: [...mapping].filter(([left, right]) => left !== right).length,
    entryHtml: localHtml === liveHtml ? 'byte-identical' : 'filename-relinked',
  };
}

async function verifyProduction() {
  const origin = 'https://pti-app-2ab59.web.app';
  const appRoot = path.resolve(__dirname, '../..');
  const expected = JSON.parse(await fs.readFile(path.join(appRoot, 'public/atlas-release.json'), 'utf8'));
  async function get(relative) {
    const response = await fetch(origin + relative, { signal: AbortSignal.timeout(30000), redirect: 'error' });
    assert.equal(response.status, 200, relative);
    return response;
  }
  const observed = await (await get('/atlas-release.json?source=' + expected.sourceFingerprint)).json();
  assert.deepEqual(observed, expected, 'Production release marker does not match the reviewed source');
  const html = await (await get('/atlas?release=' + expected.release)).text();
  const build = path.join(appRoot, 'dist/pti-app/browser');
  const localHtml = await fs.readFile(path.join(build, 'index.html'), 'utf8');
  const names = (await fs.readdir(build)).filter(isGeneratedAssetName);
  const localAssets = new Map(await Promise.all(names.map(async name => [name, await fs.readFile(path.join(build, name))])));
  const liveAssets = await collectAssetGraph(html, async name => Buffer.from(await (await get('/' + name)).arrayBuffer()), names.length);
  const verified = verifyAssetGraphs(localHtml, localAssets, html, liveAssets);
  console.log(JSON.stringify({ release: expected.release, sourceFingerprint: expected.sourceFingerprint, sourceMarkerExact: true, ...verified,
    scope: 'Read-only public generated assets and entry graph; only proven filename relinking may differ. No claim of signed-in owner browser inspection.' }, null, 2));
}

module.exports = { isGeneratedAssetName, assetReferences, collectAssetGraph, verifyAssetGraphs };
if (require.main === module) verifyProduction().catch(error => { console.error(error.message); process.exitCode = 1; });
