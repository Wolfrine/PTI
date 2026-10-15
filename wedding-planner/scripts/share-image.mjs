import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import { chromium } from '@playwright/test';
const cwd = fileURLToPath(new URL('..', import.meta.url)),
  origin = 'http://127.0.0.1:4184';
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    '--host',
    '127.0.0.1',
    '--port',
    '4184',
    '--strictPort',
  ],
  { cwd, stdio: 'pipe' },
);
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    await pause(300);
  }
  browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  );
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  await page.goto(origin + '/design/illustrated-pwa/share-card.html');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await mkdir(`${cwd}/public/share`, { recursive: true });
  await page.screenshot({ path: `${cwd}/public/share/wedding-invitation-v2.jpg`, type: 'jpeg', quality: 85 });
  console.log(
    'Generated the 1200×630 versioned social image with names and planned dates; no live countdown or private details.',
  );
} finally {
  if (browser) await browser.close();
  server.kill();
}
