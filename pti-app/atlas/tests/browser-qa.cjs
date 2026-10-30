// Synthetic preview only: never authenticates or mutates a deployed account.
// NODE_PATH can supply Playwright; CHROME_BIN can select an installed Chromium.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.argv[2] || 'http://127.0.0.1:4206/';
const output = process.argv[3];
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Only a loopback synthetic preview is allowed');

(async () => {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, headless: true,
    args: ['--no-sandbox'], proxy: proxyUrl ? { server: proxyUrl, bypass: '127.0.0.1,localhost' } : undefined });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const runtimeErrors = [], results = [], contrast = [], layout = [], focus = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  async function visit(params = '', width = 1440, height = width < 760 ? 844 : 1000) {
    await page.setViewportSize({ width, height });
    await page.goto(base + params, { waitUntil: 'networkidle' });
    assert.match(await page.locator('body').innerText(), /LOCAL SYNTHETIC FIXTURE/);
    assert.equal(await page.locator('app-new-atlas').count(), 1);
  }
  async function check(name, fn) { await fn(); results.push({ name, status: 'passed' }); }
  async function tab(name) { await page.getByRole('button', { name, exact: true }).click(); }
  async function measure(state, width) {
    const measurement = await page.evaluate(() => {
      const rgb = text => (text.match(/[\d.]+/g) || []).map(Number);
      const luminance = c => c.slice(0, 3).reduce((sum, v, i) => { v /= 255; return sum + (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i]; }, 0);
      const background = element => { for (let node = element; node; node = node.parentElement) { const color = rgb(getComputedStyle(node).backgroundColor); if (color.length === 3 || color[3] >= .99) return color; } return [255, 255, 255]; };
      const text = [], overflow = [];
      for (const element of document.querySelectorAll('app-new-atlas *')) {
        const rect = element.getBoundingClientRect(), css = getComputedStyle(element);
        if (!rect.width || !rect.height || css.visibility === 'hidden' || css.display === 'none' || element.classList.contains('sr-only') || element.classList.contains('skip-link')) continue;
        if (rect.left < -.5 || rect.right > innerWidth + .5) overflow.push({ tag: element.tagName, class: element.className, left: rect.left, right: rect.right });
        if (element.matches(':disabled') || element.closest('[disabled]') || Number(css.opacity) < .99) continue;
        const ownText = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim();
        if (!ownText) continue;
        const color = rgb(css.color), bg = background(element), l1 = luminance(color), l2 = luminance(bg);
        const ratio = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
        const size = parseFloat(css.fontSize), weight = parseFloat(css.fontWeight) || 400;
        const threshold = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
        if (ratio + .01 < threshold) text.push({ text: ownText.slice(0, 100), tag: element.tagName, class: element.className, color: css.color, background: bg, size, ratio: +ratio.toFixed(2), threshold });
      }
      return { viewport: innerWidth, document: document.documentElement.scrollWidth,
        viewportHeight: innerHeight, documentHeight: document.documentElement.scrollHeight,
        overflow, contrastFailures: text };
    });
    layout.push({ state, width, documentWidth: measurement.document, documentHeight: measurement.documentHeight,
      viewportHeight: measurement.viewportHeight, outOfBounds: measurement.overflow });
    contrast.push({ state, width, failures: measurement.contrastFailures });
    assert.equal(measurement.document <= width + 1, true, `${state}: document overflow`);
    assert.equal(measurement.overflow.length, 0, `${state}: content/control clipped outside viewport`);
  }
  try {
    await check('12 radial fields retain real subjects and working drill-downs', async () => {
      await visit();
      assert.equal(await page.locator('.radial-wedge').count(), 12);
      assert.equal(await page.locator('.radial-status').count(), 36);
      await page.locator('.radial-label').filter({ hasText: 'Engineering & materials' }).click();
      assert.match(await page.locator('.subject-list').innerText(), /Robotics/);
      assert.equal(await page.locator('.subject-row').count(), 3);
      await tab('All sectors');
      assert.equal(await page.locator('.radial-wedge').count(), 12);
    });
    await check('Compact radial landing fits 1366 × 590 without a page scrollbar', async () => {
      await visit('', 1366, 590);
      const fit = await page.evaluate(() => ({
        page: document.documentElement.scrollHeight, viewport: innerHeight,
        wheel: document.querySelector('.radial-canvas')?.getBoundingClientRect().height,
      }));
      assert(fit.wheel >= 365, 'The radial wheel must remain usable');
      assert(fit.page <= fit.viewport + 1, `Overview scroll: ${fit.page}px > ${fit.viewport}px`);
    });
    await check('Subject drill, self-report and history', async () => {
      await visit('?subject=software-engineering');
      await page.getByLabel('Current position').selectOption({ label: 'Learning' });
      await page.getByLabel('Your context').fill('Synthetic browser QA self-report.');
      await tab('Save my position');
      assert.match(await page.locator('[role=status]').first().innerText(), /self-reported progression was saved/);
      await tab('History'); assert.match(await page.locator('.history-list').innerText(), /Learning · self-reported/);
    });
    await check('Linking evidence does not create mastery or progression', async () => {
      await visit('?view=review');
      await page.locator('.evidence-record').first().getByRole('button', { name: 'Link evidence', exact: true }).click();
      assert.match(await page.locator('.message.success').innerText(), /does not certify personal understanding/);
      await page.getByLabel('Show', { exact: true }).selectOption('accepted');
      assert.equal(await page.locator('.evidence-record').count(), 1);
      await tab('History'); assert.match(await page.locator('.history-list').innerText(), /Linked/);
      assert.doesNotMatch(await page.locator('.history-list').innerText(), /Learning · self-reported/);
    });
    await check('Dismissed evidence remains reviewable but does not imply current work', async () => {
      await visit('?view=review');
      const record = page.locator('.evidence-record').filter({ hasText: 'A short scene' });
      await record.getByRole('button', { name: 'Dismiss', exact: true }).click();
      await page.getByLabel('Show', { exact: true }).selectOption('rejected');
      assert.match(await page.locator('.evidence-record').innerText(), /A short scene/);
      await tab('Our work'); assert.doesNotMatch(await page.locator('.work-list').innerText(), /Creative writing/);
    });
    await check('Pause, enable and bounded source approval validation', async () => {
      await visit('?view=sources');
      await page.getByRole('button', { name: 'Pause synthetic-repo', exact: true }).click();
      await page.getByRole('button', { name: 'Enable synthetic-repo', exact: true }).click();
      await tab('Approve a source');
      await page.getByLabel('Source ID', { exact: true }).fill('qa-synthetic-source');
      await page.getByLabel('Source label or locator', { exact: true }).fill('QA synthetic bounded repository');
      await page.getByLabel(/Bounded prefixes/).fill('https://github.com/');
      await tab('Approve and enable source');
      assert.equal(await page.locator('.form-error').count(), 1);
      await page.getByLabel(/Bounded prefixes/).fill('https://github.com/example/qa-fixture/');
      await tab('Approve and enable source');
      assert.equal(await page.locator('.source-row').count(), 2);
      assert.equal(await page.getByRole('button', { name: 'Pause qa-synthetic-source', exact: true }).count(), 1);
    });
    await check('Export produces only the loaded synthetic snapshot', async () => {
      await visit('?fixture=partial');
      const downloadEvent = page.waitForEvent('download'); await tab('Export');
      const download = await downloadEvent, parsed = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
      assert.equal(parsed.synthetic, true); assert.equal(parsed.evidence.length, 8); assert.equal(parsed.hasMore.evidence, true);
      assert.match(await page.locator('.message.success').innerText(), /More records remain/);
    });
    await check('Unknown personal position and pending review are not guessed on partial reads', async () => {
      await visit('?fixture=partial&subject=software-engineering', 390);
      assert.equal(await page.getByLabel('Current position').isDisabled(), true);
      assert.match(await page.locator('.evidence-mini').first().innerText(), /Review not loaded/);
      await page.getByRole('button', { name: 'Inspect evidence →', exact: true }).first().click();
      assert.equal(await page.locator('.evidence-record').first().getByRole('button', { name: 'Link evidence', exact: true }).isDisabled(), true);
      assert.match(await page.evaluate(() => document.activeElement.id), /^evidence-/);
    });
    await check('Mobile drill replaces the index and offers sector return', async () => {
      await visit('', 390);
      await page.locator('.mobile-grid button').filter({ hasText: 'Engineering & materials' }).click();
      assert.equal(await page.locator('.mobile-fields').count(), 0);
      assert.equal(await page.locator('.subject-row').count(), 3);
      await tab('All sectors'); assert.equal(await page.locator('.mobile-grid button').count(), 12);
    });
    await check('Capture receipts have an explicit route to load remaining pages', async () => {
      await visit('?fixture=partial&view=history');
      assert.match(await page.locator('main').innerText(), /Capture receipts/);
      const loadRuns = page.getByRole('button', { name: /Load more (capture )?(runs|receipts)/i });
      assert.equal(await loadRuns.count(), 1);
      await loadRuns.click();
      assert.equal(await loadRuns.count(), 0);
    });
    await check('Keyboard search and explicit subject jump focus', async () => {
      await visit('?subject=software-engineering', 390);
      await page.keyboard.press('/'); assert.equal(await page.getByRole('searchbox').evaluate(el => el === document.activeElement), true);
      await page.getByRole('searchbox').press('Tab');
      await page.getByRole('button', { name: 'Our position', exact: true }).click();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'atlas-position');
      await visit();
      for (let index = 0; index < 13; index++) {
        await page.keyboard.press('Tab');
        focus.push(await page.evaluate(() => { const e = document.activeElement, s = getComputedStyle(e); return { tag: e.tagName, text: (e.textContent || '').trim().slice(0, 65), outline: s.outlineStyle, outlineWidth: s.outlineWidth, visible: e.matches(':focus-visible') }; }));
      }
      assert(focus.some(item => item.visible && item.outline !== 'none' && parseFloat(item.outlineWidth) >= 2));
    });
    const states = [
      ['overview', '', [1440, 390, 320]], ['subject', '?subject=software-engineering', [1440, 390, 320]],
      ['review', '?view=review', [1440, 390, 320]], ['sources', '?view=sources', [1440, 390, 320]],
      ['history', '?view=history', [1440, 320]], ['work', '?view=work', [1440, 320]],
      ['empty', '?fixture=empty', [390]], ['loading', '?fixture=loading&subject=software-engineering', [320]],
      ['error', '?fixture=error&subject=software-engineering', [320]], ['partial', '?fixture=partial&subject=software-engineering', [390]],
      ['long-review', '?fixture=long&view=review', [320]], ['long-source', '?fixture=long&view=sources', [390]],
    ];
    for (const [state, params, widths] of states) for (const width of widths) { await visit(params, width); await measure(state, width); }
    assert.equal(runtimeErrors.length, 0);
    const allFailures = contrast.flatMap(item => item.failures.map(f => ({ state: item.state, width: item.width, ...f })));
    const report = { scope: 'synthetic local preview; no authentication or production mutations', results, runtimeErrors, layout, focus, contrast, contrastFailures: allFailures.length,
      limitations: ['Computed solid-colour text contrast is a bounded audit, not WCAG certification.', 'Disabled controls are excluded from text-contrast checks.', 'Browser interactions use a synthetic service; production persistence has separate rules and integration tests.'] };
    if (output) { await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, JSON.stringify(report, null, 2)); }
    console.log(JSON.stringify({ interactions: results.length, responsiveStates: layout.length, runtimeErrors, contrastFailures: allFailures.length, examples: allFailures.slice(0, 24), output }, null, 2));
    if (allFailures.length) process.exitCode = 2;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
