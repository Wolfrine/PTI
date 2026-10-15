import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import { recordFixture } from './fixtures.mjs';
const cwd = fileURLToPath(new URL('..', import.meta.url)),
  evidence = '.wedding-qa',
  fixture = await recordFixture();
const servers = [],
  results = [],
  errors = [];
let browser;
async function server(port, preview = false) {
  const child = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      ...(preview ? ['preview'] : []),
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    { cwd, env: { ...process.env, VITE_USE_EMULATORS: '' }, stdio: 'pipe' },
  );
  servers.push(child);
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(origin)).ok) return origin;
    } catch {}
    await pause(500);
  }
  throw Error(`QA server ${port} did not start.`);
}
try {
  await mkdir(evidence, { recursive: true });
  const production = await server(4182, true),
    development = await server(4183);
  browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  );
  const noJs = await browser.newContext({ javaScriptEnabled: false }),
    staticPage = await noJs.newPage();
  await staticPage.goto(production);
  await expect(staticPage.locator('#couple-names')).toContainText('Mahima');
  await expect(staticPage.locator('#couple-names')).toContainText('Mayank');
  await expect(staticPage.locator('body')).toContainText('18–20 January 2027');
  assert.match(await staticPage.locator('body').innerText(), /planned/i);
  await expect(staticPage.locator('.countdown-boundary')).toHaveText('18 January 2027 · midnight IST');
  await expect(staticPage.locator('[data-countdown]')).toContainText('first day of our planned celebrations');
  assert.ok(
    !(await staticPage.locator('body').textContent()).includes('Reception'),
  );
  assert.equal(await staticPage.locator('a[href="/family/"]').count(), 1);
  results.push(
    'Static truthful save-the-date and one clear family entrance work without JavaScript',
  );
  const publicContext = await browser.newContext({ reducedMotion: 'reduce' }),
    publicPage = await publicContext.newPage(),
    requests = [];
  publicPage.on('pageerror', (e) => errors.push(e.message));
  publicPage.on('request', (r) => requests.push(r.url()));
  for (const width of [1440, 390, 360]) {
    await publicPage.setViewportSize({ width, height: 900 });
    await publicPage.goto(production);
    await publicPage.evaluate(() => document.fonts.ready);
    await publicPage.waitForLoadState('networkidle');
    await expect(publicPage.locator('[data-countdown] > span')).toHaveCount(4);
    assert.equal(await publicPage.locator('[data-countdown]').getAttribute('data-target'), '2027-01-18T00:00:00+05:30');
    const countdownBox = await publicPage.locator('.countdown').boundingBox();
    assert.ok(Math.abs(countdownBox.x + countdownBox.width / 2 - width / 2) < 2, 'Countdown remains centred.');
    assert.ok(
      await publicPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await publicPage.screenshot({
      path: `${evidence}/invitation-${width}.png`,
      fullPage: true,
    });
  }
  assert.ok(requests.some((url) => /\/art\/.*\.webp/.test(url)));
  const beforeTick = await publicPage.locator('[data-countdown]').innerText();
  await expect.poll(() => publicPage.locator('[data-countdown]').innerText()).not.toBe(beforeTick);
  assert.ok(
    !requests.some((url) =>
      /googleapis\.com|firebaseio\.com|firebaseapp\.com/.test(url),
    ),
  );
  assert.deepEqual(
    await publicPage
      .locator('a[href^="#"]')
      .evaluateAll((links) =>
        links
          .map((a) => a.getAttribute('href'))
          .filter((h) => h.length > 1 && !document.getElementById(h.slice(1))),
      ),
    [],
  );
  await publicPage.reload();
  await publicPage.keyboard.press('Tab');
  await expect(publicPage.locator('.skip-link')).toBeFocused();
  await publicPage.keyboard.press('Enter');
  await publicPage.setViewportSize({ width: 720, height: 900 });
  assert.ok(
    await publicPage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  results.push(
    'Responsive botanical artwork, keyboard skip navigation, valid anchors and zero public Firebase requests',
  );
  const productionFamily = await publicContext.newPage();
  await productionFamily.goto(production + '/family/?demo=1');
  await productionFamily.getByRole('button', { name: /Google/ }).waitFor();
  assert.equal(await productionFamily.locator('.demo-banner').count(), 0);
  assert.equal(await productionFamily.locator('[data-add]').count(), 0);
  results.push('No production demonstration authentication bypass');
  const ctx = await browser.newContext(),
    page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/src/demo.ts*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export function demoRecords(){return ${JSON.stringify(fixture)}}`,
    }),
  );
  const visit = async (route) => {
    await page.goto(`${development}/family/?demo=1#/${route}`);
    await expect(page.locator('.demo-banner')).toBeVisible();
  };
  const save = async () => {
    await page.locator('dialog button[type="submit"]').click();
    await expect(page.locator('dialog')).not.toBeVisible();
  };
  await visit('home');
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#workspace')).toBeFocused();
  assert.equal(new URL(page.url()).hash, '#/home');
  await visit('home');
  for (const route of ['catering', 'guests', 'stays', 'tasks'])
    await expect(page.locator(`a[href="#/${route}"]`).first()).toBeVisible();
  assert.equal(await page.locator('[data-edit="decisions"]').count(), 0);
  const home = await page.locator('#workspace').innerText();
  assert.ok(!home.includes('Breakfast'));
  assert.ok(!home.includes('Carnival'));
  results.push(
    'Family home separates the actual function programme from meals and has no duplicate decision list',
  );
  await page.locator('a[href="#/catering"]').first().click();
  await page.locator('a[href="#/catering/18-1"]').click();
  await page.goBack();
  assert.equal(new URL(page.url()).hash, '#/catering');
  await page.goForward();
  assert.equal(new URL(page.url()).hash, '#/catering/18-1');
  await page.reload();
  await expect(page.locator('#workspace')).toContainText('Breakfast');
  await page.locator('[data-edit="events"][data-section="menu"]').click();
  assert.equal(await page.locator('dialog [name="venue"]').count(), 0);
  assert.equal(await page.locator('dialog [name="status"]').count(), 0);
  await page
    .locator('dialog [name="menuText"]')
    .fill('Synthetic focused menu update');
  await save();
  await page.locator('.account-menu > summary').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-action="export"]').click(),
  ]);
  const exported = JSON.parse(await readFile(await download.path(), 'utf8')),
    updated = exported.events.find((e) => e.id === '18-1');
  for (const key of Object.keys(fixture.events[0]).filter(
    (k) =>
      ![
        'menuText',
        'revision',
        'updatedAt',
        'updatedBy',
        'lastChangeId',
      ].includes(k),
  ))
    assert.deepEqual(
      updated[key],
      fixture.events[0][key],
      `Menu-only update must preserve ${key}`,
    );
  assert.equal(updated.menuText, 'Synthetic focused menu update');
  assert.equal(updated.revision, 2);
  results.push(
    'Deep links and Back work; menu-only editing preserves every unrelated field',
  );
  await visit('catering/compare');
  assert.equal(await page.locator('[data-compare]').count(), 2);
  assert.equal(await page.locator('.comparison-grid>.reading-menu').count(), 2);
  await page.locator('[data-compare="a"]').selectOption('18-1');
  await expect(page.locator('.comparison-grid')).toContainText('Breakfast');
  await visit('tasks');
  await page.getByRole('link', { name: /Responsibilities/ }).click();
  await expect(page.locator('#workspace')).toContainText(
    'Synthetic hospitality arrangement',
  );
  await page.goBack();
  await expect(page.locator('#workspace')).toContainText(
    'Confirm the celebration programme',
  );
  results.push(
    'Responsibilities are directly reachable and menu comparison renders only the selected pair',
  );
  await visit('guests');
  for (const name of ['Synthetic Guest One', 'Synthetic Guest Two']) {
    await page.locator('[data-add="guests"]').first().click();
    await page.locator('dialog [name="name"]').fill(name);
    await page
      .locator('dialog [name="household"]')
      .fill('Synthetic shared household');
    assert.equal(await page.locator('dialog [name="stayFrom"]').count(), 0);
    await save();
  }
  await expect(page.locator('#workspace')).toContainText('Synthetic Guest One');
  await expect(page.locator('#workspace')).toContainText('Synthetic Guest Two');
  await page.locator('#guest-search').fill('Synthetic Guest One');
  await page.locator('a[href^="#/guests/"]').first().click();
  await page.locator('[data-edit="guests"][data-section="food"]').click();
  await page.locator('dialog [name="dietary"]').fill('Synthetic food request');
  assert.equal(await page.locator('dialog [name="accommodation"]').count(), 0);
  await save();
  results.push('Guest basics and food needs use separate short forms');
  await visit('stays/synthetic-person');
  await page.locator('[data-edit="guests"][data-section="stay"]').click();
  await page.locator('dialog [name="stayFrom"]').fill('2027-01-18');
  await page.locator('dialog [name="stayUntil"]').fill('2027-01-20');
  await page
    .locator('dialog [name="accommodation"]')
    .fill('Synthetic stay allocation');
  await save();
  await page.locator('a[href="#/stays"]').first().click();
  await expect(page.locator('#workspace')).toContainText(
    'Synthetic stay allocation',
  );
  await page.locator('a[href="#/stays/synthetic-person"]').click();
  await page.locator('[data-edit="guests"][data-section="travel"]').click();
  await page
    .locator('dialog [name="transport"]')
    .fill('Synthetic station pickup');
  await save();
  await expect(page.locator('#workspace')).toContainText(
    'Synthetic station pickup',
  );
  results.push('Stay and travel are independent focused tasks');
  await visit('tasks');
  await page.locator('a[href="#/tasks/decision/programme"]').click();
  await page
    .locator('[data-edit="decisions"][data-section="decision"]')
    .click();
  assert.deepEqual(
    await page
      .locator('dialog [name]')
      .evaluateAll((fields) => fields.map((f) => f.name)),
    ['resolution', 'status'],
  );
  await page.locator('dialog [name="status"]').selectOption('confirmed');
  await page.locator('dialog button[type="submit"]').click();
  await expect(page.locator('#form-error')).toContainText(
    'Record the decision',
  );
  await page.locator('dialog [data-close]').first().click();
  await page.locator('.breadcrumbs a[href="#/home"]').click();
  await page.locator('a[href="#/guests"]').click();
  assert.ok(
    !(await page.locator('#workspace').innerText()).includes(
      'Record the decision',
    ),
  );
  await page.locator('.breadcrumbs a[href="#/home"]').click();
  await page.locator('a[href="#/tasks"]').click();
  await page.locator('a[href="#/tasks/decision/programme"]').click();
  await page
    .locator('[data-edit="decisions"][data-section="decision"]')
    .click();
  await page.locator('dialog [name="status"]').selectOption('confirmed');
  await page
    .locator('dialog [name="resolution"]')
    .fill('Synthetic recorded agreement');
  await save();
  results.push(
    'Two-field decisions require an agreement; cancelling invalid input leaves no stale error on unrelated routes',
  );
  await visit('guests');
  await page.locator('#guest-search').fill('nonexistent synthetic search');
  await page.getByRole('button', { name: /Clear search/ }).click();
  await expect(page.locator('#guest-search')).toHaveValue('');
  await page.locator('[data-add="guests"]').first().click();
  await page
    .locator('dialog [name="name"]')
    .fill('Private unsaved synthetic guest');
  await ctx.setOffline(true);
  await page.locator('dialog button[type="submit"]').click();
  await expect(page.locator('#form-error')).toContainText('offline');
  await expect(page.locator('dialog [name="name"]')).toHaveValue(
    'Private unsaved synthetic guest',
  );
  await ctx.setOffline(false);
  await page.locator('dialog [data-close]').first().click();
  results.push(
    'Search recovery and offline save failure preserve task continuity',
  );
  await visit('attendance/18-1');
  assert.equal(await page.locator('[name="menuText"]').count(), 0);
  await page.locator('select[data-guest]').first().selectOption('confirmed');
  await expect(page.locator('select[data-guest]').first()).toBeEnabled();
  await ctx.setOffline(true);
  await page.locator('select[data-guest]').first().selectOption('declined');
  await expect(page.locator('select[data-guest]').first()).toHaveValue(
    'confirmed',
  );
  await ctx.setOffline(false);
  results.push(
    'Attendance is separate per person/occasion and a failed save restores the recorded value',
  );
  for (const width of [1440, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      'home',
      'catering',
      'catering/18-1',
      'guests',
      'stays',
      'tasks',
      'attendance/18-1',
    ]) {
      await visit(route);
      await page.evaluate(() => document.fonts.ready);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${route} must fit ${width}px`,
      );
      await page.screenshot({
        path: `${evidence}/family-${route.replaceAll('/', '-')}-${width}.png`,
        fullPage: true,
      });
    }
  }
  async function inspect(path) {
    for (const e of await readdir(path, { withFileTypes: true })) {
      const p = path + '/' + e.name;
      if (e.isDirectory()) await inspect(p);
      else if (/\.(js|html|json)$/.test(e.name)) {
        const text = await readFile(p, 'utf8');
        for (const privateText of [
          '1000154329.jpg',
          'Example guest',
          'WEDDING_RECORD.md',
          'Synthetic preservation venue',
        ])
          assert.ok(
            !text.includes(privateText),
            `Private content leaked in ${e.name}`,
          );
      }
    }
  }
  await inspect(`${cwd}/dist`);
  results.push(
    'Production build excludes source, test fixtures and private catering transcripts',
  );
  assert.deepEqual(errors, []);
  await writeFile(
    `${evidence}/browser-results.json`,
    JSON.stringify(
      {
        status: 'pass',
        checks: results,
        viewports: [1440, 390, 360],
        data: 'Approved public facts; document-derived test menus plus synthetic people/logistics. No live wedding writes.',
      },
      null,
      2,
    ),
  );
  console.log(`PASS ${results.length} botanical browser task scenarios.`);
} finally {
  if (browser) await browser.close();
  for (const child of servers) child.kill();
}
