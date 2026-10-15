import { spawn } from 'node:child_process';
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
  await page.goto(origin);
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content:
      '.skip-link,.public-header,.public-celebration,.guest-footer,.countdown{display:none!important}body{margin:0!important}.guest-main{max-width:none!important;padding:0!important}.garden-hero{height:630px!important}.invitation-copy{max-width:59%!important;padding:83px 30px 35px 45px!important}.invitation-copy h1{font-size:66px!important}.invitation-copy>.eyebrow{font-size:12px!important}.hero-date{font-size:31px!important}.guest-welcome{font-size:23px!important}',
  });
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${cwd}/public/share.png` });
  console.log(
    'Generated public/share.png from the reviewed invitation, with approved names and planned dates.',
  );
} finally {
  if (browser) await browser.close();
  server.kill();
}
