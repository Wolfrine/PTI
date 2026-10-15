import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { recordFixture } from '../../tests/fixtures.mjs';

// The final candidate is supplied by the parent after normalization and build.
// This script never changes app code, fixture records, or the production build.
const directory = 'design/illustrated-pwa';
const binding = JSON.parse(await readFile(`${directory}/build-fingerprint.json`, 'utf8'));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function verifyCandidate() {
  assert.equal(digest(JSON.stringify(binding.entries)), binding.fingerprint, 'Candidate entry digest');
  for (const entry of binding.entries)
    assert.equal(digest(await readFile(entry.path)), entry.sha256, `Candidate changed: ${entry.path}`);
}
await verifyCandidate();
const fixture = await recordFixture();
const fixtureSha256 = digest(JSON.stringify(fixture));
const requiredStates = [
  { id: 'sangeet', width: 1440, marker: 'Sweet corn', surface: 'document-derived proposed menu' },
  { id: 'sangeet', width: 390, marker: 'Sweet corn', surface: 'document-derived proposed menu' },
  { id: 'reception', width: 1440, marker: 'Shahi Patam', surface: 'long and uncertain proposed menu' },
  { id: 'reception', width: 390, marker: 'Shahi Patam', surface: 'long and uncertain proposed menu' },
  { id: 'compare-compact', width: 390, marker: 'Two menus, together.', surface: 'selected-pair menu comparison' },
  { id: 'compare-search', width: 390, marker: 'Paneer', surface: 'selected-pair shared dish search' },
  { id: 'invitation', width: 1440, marker: 'Mahima', surface: 'production public invitation' },
  { id: 'invitation', width: 360, marker: 'Mahima', surface: 'production public invitation' },
  { id: 'install-help', width: 390, marker: 'Keep our wedding close.', surface: 'production install guidance' },
  { id: 'share-fallback', width: 390, marker: 'Share the invitation', surface: 'production share fallback with denied-clipboard browser fixture' },
  { id: 'saved-offline', width: 390, marker: 'Saved invitation', surface: 'actual service-worker saved public invitation' },
  { id: 'private-offline', width: 390, marker: 'Let’s reconnect.', surface: 'actual service-worker private-route fallback' },
  { id: 'social-card', width: 1200, height: 630, marker: '1200×630 decoded public JPEG', surface: 'actual public JPEG rendered in browser' },
];
const files = new Map();
const distRoot = resolve('dist');
async function walk(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const name = resolve(path, entry.name);
    if (entry.isDirectory()) await walk(name);
    else files.set('/' + relative(distRoot, name).replaceAll('\\', '/'), await readFile(name));
  }
}
await walk(distRoot);
const headers = JSON.parse(await readFile('../firebase.wedding.json', 'utf8')).hosting[0].headers[0].headers;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const path = pathname === '/' ? '/index.html' : ['/family', '/family/'].includes(pathname) ? '/family/index.html' : pathname;
  for (const header of headers) response.setHeader(header.key, header.value);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
  if (path === '/sw.js') response.setHeader('Service-Worker-Allowed', '/');
  const body = files.get(path);
  if (!body) { response.statusCode = 404; response.end('No such candidate asset'); }
  else response.end(body);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const states = [];
const pageErrors = new Map();
let browser;
function track(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  pageErrors.set(page, errors);
  return page;
}
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(async (image) => { image.loading = 'eager'; await image.decode(); }));
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
}
async function capture(page, id, width, marker, options = {}) {
  await settle(page);
  const observed = await page.locator('body').innerText();
  assert.ok(observed.includes(marker), `Wrong final state ${id}/${width}: ${marker}`);
  if (options.fullPage !== false) await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  const checks = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    brokenImages: [...document.images].some((image) => !image.complete || !image.naturalWidth),
    activeElement: document.activeElement?.id || document.activeElement?.tagName,
    skipLinkTop: document.querySelector('.skip-link')?.getBoundingClientRect().top ?? null,
    decodedFoodImages: document.querySelectorAll('img.food-art').length,
  }));
  assert.equal(checks.overflow, false, `${id}/${width} overflow`);
  assert.equal(checks.brokenImages, false, `${id}/${width} broken image`);
  assert.deepEqual(pageErrors.get(page), [], `${id}/${width} page errors`);
  const path = `${directory}/final-${id}-${width}.png`;
  await page.screenshot({ path, fullPage: options.fullPage !== false });
  states.push({ id, viewport: page.viewportSize(), path, sha256: digest(await readFile(path)), route: page.url(), observedMarker: marker, checks, pageErrors: [...pageErrors.get(page)], ...options.evidence });
  console.log(`Captured ${id}/${width}`);
}
try {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, headless: true });
  for (const width of [1440, 390]) {
    const page = track(await browser.newPage({ viewport: { width, height: width === 1440 ? 1000 : 844 }, reducedMotion: 'reduce' }));
    await page.route('**/src/demo.ts*', (route) => route.fulfill({ contentType: 'application/javascript', body: `export function demoRecords(){return ${JSON.stringify(fixture)}}` }));
    for (const [id, eventId, marker] of [['sangeet', '18-4', 'Sweet corn'], ['reception', 'reception-undated', 'Shahi Patam']]) {
      await page.goto(`http://127.0.0.1:5177/family/?demo=1#/catering/${eventId}`);
      await page.locator('.dish-name').first().waitFor();
      await capture(page, id, width, marker, { evidence: { fixture: 'DEV document-derived proposed menus; people/logistics are synthetic', fixtureSha256 } });
    }
    if (width === 390) {
      await page.goto('http://127.0.0.1:5177/family/?demo=1#/catering/compare');
      await page.locator('.compare-category').first().waitFor();
      assert.equal(await page.locator('.compare-category[open]').count(), 0);
      await capture(page, 'compare-compact', width, 'Two menus, together.', { evidence: { fixtureSha256, disclosureState: 'categories collapsed' } });
      await page.locator('#menu-search').fill('paneer');
      assert.ok(await page.locator('.compare-category[open]').count());
      await capture(page, 'compare-search', width, 'Paneer', { evidence: { fixtureSha256, query: 'paneer', disclosureState: 'matching categories open' } });
    }
    await page.close();
  }
  for (const width of [1440, 360]) {
    const page = track(await browser.newPage({ viewport: { width, height: width === 1440 ? 1000 : 844 }, reducedMotion: 'reduce' }));
    await page.goto(origin);
    await page.locator('[data-countdown] > span').nth(3).waitFor();
    await page.locator('[data-share-invitation]').waitFor({ state: 'visible' });
    await capture(page, 'invitation', width, 'Mahima', { evidence: { build: 'exact immutable dist', countdownUnits: await page.locator('[data-countdown] > span').count() } });
    await page.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const phone = track(await context.newPage());
  await phone.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw Error('Synthetic denied clipboard'); } }, configurable: true });
  });
  await phone.goto(origin);
  await phone.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await phone.evaluate(() => navigator.serviceWorker.ready);
  await phone.locator('[data-pwa-install]').waitFor({ state: 'visible' });
  await phone.locator('[data-pwa-install]').click();
  await phone.locator('.pwa-help').waitFor();
  await capture(phone, 'install-help', 390, 'Keep our wedding close.', { fullPage: false, evidence: { build: 'exact immutable dist', installation: 'real browser guidance; no native installation attempted' } });
  await phone.locator('.pwa-done').click();
  await phone.locator('[data-share-invitation]').click();
  await phone.locator('#share-link-dialog').waitFor();
  assert.equal(await phone.locator('#invitation-link').inputValue(), 'https://mahima-mayank.web.app/');
  await capture(phone, 'share-fallback', 390, 'Share the invitation', { fullPage: false, evidence: { build: 'exact immutable dist', branch: 'navigator.share unavailable and clipboard denied via browser-only fixture; no invitation sent' } });
  await phone.locator('#share-link-dialog button').click();
  await context.setOffline(true);
  await phone.reload();
  await phone.locator('[data-pwa-notice="offline"]').waitFor();
  await capture(phone, 'saved-offline', 390, 'Saved invitation', { evidence: { build: 'exact immutable dist served by actual service worker offline', countdownUnits: await phone.locator('[data-countdown] > span').count(), fontsLoaded: await phone.evaluate(() => document.fonts.check('16px DM')) } });
  await phone.goto(origin + '/family/');
  await phone.locator('h1').waitFor();
  assert.equal(await phone.locator('h1').innerText(), 'Let’s reconnect.');
  assert.equal(await phone.locator('#workspace, #editor, .guest-list').count(), 0);
  await capture(phone, 'private-offline', 390, 'Let’s reconnect.', { evidence: { build: 'exact immutable dist served by actual service worker offline', privacy: 'neutral offline page; no family record or auth state saved' } });
  await context.close();
  const social = track(await browser.newPage({ viewport: { width: 1200, height: 630 }, reducedMotion: 'reduce' }));
  await social.goto(origin + '/share/wedding-invitation-v2.jpg');
  const image = social.locator('img');
  await image.evaluate(async (element) => { await element.decode(); });
  const dimensions = await image.evaluate((element) => ({ width: element.naturalWidth, height: element.naturalHeight }));
  assert.deepEqual(dimensions, { width: 1200, height: 630 });
  await image.evaluate((element) => {
    document.body.style.margin = '0';
    element.style.width = '1200px'; element.style.height = '630px';
    element.style.maxWidth = 'none'; element.style.maxHeight = 'none';
    element.style.display = 'block'; element.style.margin = '0';
  });
  const path = `${directory}/final-social-card-1200.png`;
  await image.screenshot({ path });
  states.push({ id: 'social-card', viewport: { width: 1200, height: 630 }, path, sha256: digest(await readFile(path)), route: social.url(), observedMarker: '1200×630 decoded public JPEG', checks: { naturalImageDimensions: dimensions, brokenImages: false }, pageErrors: [...pageErrors.get(social)], sourceAsset: 'public/share/wedding-invitation-v2.jpg', sourceAssetSha256: digest(await readFile('public/share/wedding-invitation-v2.jpg')) });
  assert.deepEqual(pageErrors.get(social), []);
  await social.close();
  await verifyCandidate();
  assert.equal(states.length, requiredStates.length);
  for (const required of requiredStates) assert.equal(states.filter((state) => state.id === required.id && state.viewport.width === required.width).length, 1, `Missing/duplicate ${required.id}/${required.width}`);
  await writeFile(`${directory}/final-states.json`, JSON.stringify({ candidate: binding.fingerprint, candidateVerified: 'all source/public/dist/config/fixture/capture entries checked unchanged before and after browser captures', fixtureSha256, description: 'Thirteen required real browser renders, no aesthetic score. Family menu data is document-derived DEV fixture only; public/install/share/offline use exact immutable production build. Clipboard denial is simulated; offline caching and route fallback are actual service-worker behavior.', requiredStates, states }, null, 2) + '\n');
  console.log(`PASS ${states.length} final states bound to ${binding.fingerprint}`);
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
