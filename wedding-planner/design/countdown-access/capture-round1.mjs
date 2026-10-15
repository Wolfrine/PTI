import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ executablePath: 'C:/Users/Sachit Tewary/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe', headless: true });
const states = [];
try {
  for (const width of [1440, 390, 360]) {
    for (const mode of ['live', ...(width === 390 ? ['no-js', 'complete'] : [])]) {
      const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 1000 : 844 }, javaScriptEnabled: mode !== 'no-js', reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      if (mode === 'complete') await page.clock.install({ time: new Date('2027-01-18T00:00:01+05:30') });
      await page.goto('http://127.0.0.1:5177/');
      await page.locator('.countdown').waitFor();
      if (mode !== 'no-js') await page.locator(mode === 'complete' ? '.countdown-complete' : '[data-countdown] b').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      const screenshot = `design/countdown-access/round1-${mode}-${width}.png`;
      await page.screenshot({ path: screenshot, fullPage: true });
      const checks = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, brokenImages: [...document.images].some(i => !i.complete || i.naturalWidth === 0), centred: Math.abs(document.querySelector('.countdown').getBoundingClientRect().left + document.querySelector('.countdown').getBoundingClientRect().width / 2 - innerWidth / 2) < 1 }));
      states.push({ id: mode, viewport: width, route: page.url(), screenshot, observedMarker: await page.locator('.countdown').innerText(), checks: { ...checks, pageErrors: errors } });
      await page.close();
    }
  }
  await writeFile('design/countdown-access/round1.json', JSON.stringify({ fixture: 'Completion uses a synthetic browser clock only; no-JS checks static public HTML.', states }, null, 2));
  console.log(JSON.stringify(states.map(s => ({ id: s.id, viewport: s.viewport, checks: s.checks }))));
} finally { await browser.close(); }
