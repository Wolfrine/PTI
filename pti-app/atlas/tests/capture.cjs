// Capture only the local synthetic harness, not a signed-in user's records.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const [base = 'http://127.0.0.1:4206/', destination] = process.argv.slice(2);
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
assert(destination, 'An output directory is required');
const states = [
  { id: 'overview-desktop', width: 1440, params: '', marker: 'THE KNOWN LANDSCAPE' },
  { id: 'overview-mobile', width: 390, params: '', marker: 'THE KNOWN LANDSCAPE' },
  { id: 'subject-desktop', width: 1440, params: '?subject=software-engineering', marker: 'Your place' },
  { id: 'subject-mobile', width: 390, params: '?subject=software-engineering', marker: 'Your place' },
  { id: 'linked-mobile', width: 390, params: '?fixture=reviewed&subject=software-engineering', marker: 'Linked' },
  { id: 'outline-desktop', width: 1440, params: '?subject=physics', marker: 'No source references have been mapped' },
  { id: 'review-desktop', width: 1440, params: '?view=review', marker: 'Make the connection.' },
  { id: 'sources-desktop', width: 1440, params: '?view=sources', mode: 'source-form', marker: 'Approve and enable source' },
  { id: 'source-success-mobile', width: 390, params: '?view=sources', mode: 'source-success', marker: 'Paused · enable' },
  { id: 'long-source-mobile', width: 390, params: '?fixture=long&view=sources', mode: 'long-source', marker: 'long-human-readable-source-context-' },
  { id: 'inspect-mobile', width: 390, params: '?subject=software-engineering', mode: 'inspect', marker: 'Make the connection.' },
  { id: 'history-mobile', width: 390, params: '?view=history', marker: 'Capture receipts' },
  { id: 'error-mobile', width: 320, params: '?fixture=error&subject=software-engineering', marker: 'Evidence is not loaded' },
  { id: 'partial-mobile', width: 390, params: '?fixture=partial&subject=software-engineering', marker: 'Review not loaded' },
  { id: 'loading-mobile', width: 320, params: '?fixture=loading&subject=software-engineering', marker: 'Loading your private evidence' },
  { id: 'empty-desktop', width: 1440, params: '?fixture=empty&view=work', marker: 'Your progression starts with evidence.' },
  { id: 'empty-search-mobile', width: 320, params: '', mode: 'search-empty', marker: 'No subjects match this search.' },
];
(async () => {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, headless: true,
    args: ['--no-sandbox'], proxy: proxyUrl ? { server: proxyUrl, bypass: '127.0.0.1,localhost' } : undefined });
  await fs.mkdir(destination, { recursive: true });
  const evidence = [];
  try {
    // Two independent tabs at a time bound renderer memory and preserve each state.
    for (let index = 0; index < states.length; index += 2) {
      await Promise.all(states.slice(index, index + 2).map(async state => {
        const page = await browser.newPage({ viewport: { width: state.width, height: state.width < 760 ? 844 : 1000 }, deviceScaleFactor: 1 });
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        try {
          await page.goto(base + state.params, { waitUntil: 'networkidle' });
          assert.match(await page.locator('body').innerText(), /LOCAL SYNTHETIC FIXTURE/);
          if (state.mode === 'source-form' || state.mode === 'source-success') await page.getByRole('button', { name: 'Approve a source', exact: true }).click();
          if (state.mode === 'source-success') {
            await page.getByLabel('Source ID', { exact: true }).fill('qa-approved-source');
            await page.getByLabel('Source label or locator', { exact: true }).fill('Synthetic example repository');
            await page.getByLabel(/Bounded prefixes/).fill('https://github.com/example/qa-reference/');
            await page.getByRole('button', { name: 'Approve and enable source', exact: true }).click();
            await page.getByRole('button', { name: 'Pause qa-approved-source', exact: true }).click();
          }
          if (state.mode === 'long-source') await page.getByText('Inspect exact approval', { exact: true }).click();
          if (state.mode === 'inspect') {
            await page.getByRole('button', { name: 'Inspect evidence →', exact: true }).first().click();
            await page.waitForFunction(() => document.activeElement?.id?.startsWith('evidence-'));
          }
          if (state.mode === 'search-empty') await page.getByRole('searchbox').fill('no-matching-subject-in-this-fixture');
          await page.waitForTimeout(150);
          const body = await page.locator('body').innerText();
          assert(body.includes(state.marker), `${state.id}: wrong visible state`);
          if (state.id === 'outline-desktop') assert(!body.includes('Public references last checked'));
          const checks = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            broken_images: [...document.images].some(image => !image.complete || !image.naturalWidth),
          }));
          assert(!checks.overflow && !checks.broken_images && !errors.length, `${state.id}: failed render checks`);
          const filename = `final-${state.id}.png`, target = path.join(destination, filename);
          await page.screenshot({ path: target, fullPage: true });
          const hash = createHash('sha256').update(await fs.readFile(target)).digest('hex');
          evidence.push({ state: state.id, marker: state.marker, viewport: state.width >= 760 ? 'desktop' : 'mobile', width: state.width,
            path: filename, sha256: hash, checks: { state_identity: true, ...checks, page_errors: false }, url: page.url() });
          console.log(state.id + ': rendered and checked');
        } finally { await page.close(); }
      }));
    }
    evidence.sort((a, b) => states.findIndex(s => s.id === a.state) - states.findIndex(s => s.id === b.state));
    await fs.writeFile(path.join(destination, 'capture-manifest.json'), JSON.stringify(evidence, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
