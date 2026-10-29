// Read-only release check. Private records are never requested by this script.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
(async () => {
  const origin = 'https://pti-app-2ab59.web.app';
  const appRoot = path.resolve(__dirname, '../..');
  const expected = JSON.parse(await fs.readFile(path.join(appRoot, 'public/atlas-release.json'), 'utf8'));
  async function get(relative) {
    const response = await fetch(origin + relative, { signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200, relative);
    return response;
  }
  const observed = await (await get('/atlas-release.json?source=' + expected.sourceFingerprint)).json();
  assert.deepEqual(observed, expected, 'Production release marker does not match the reviewed source');
  const html = await (await get('/atlas?release=' + expected.release)).text();
  const build = path.join(appRoot, 'dist/pti-app/browser');
  const localHtml = await fs.readFile(path.join(build, 'index.html'), 'utf8');
  const scripts = [...localHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
  for (const script of scripts) assert(html.includes(script), 'Production HTML references another build');
  const names = (await fs.readdir(build)).filter(name => /^(main-|chunk-|styles-|polyfills-).+\.(js|css)$/.test(name));
  for (const name of names) {
    const local = await fs.readFile(path.join(build, name));
    const live = Buffer.from(await (await get('/' + name)).arrayBuffer());
    assert.equal(createHash('sha256').update(live).digest('hex'), createHash('sha256').update(local).digest('hex'), 'Production asset differs: ' + name);
  }
  console.log(JSON.stringify({ release: expected.release, sourceFingerprint: expected.sourceFingerprint, exactProductionAssetsVerified: names.length,
    scope: 'Read-only public asset identity; no claim of signed-in owner browser inspection.' }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
