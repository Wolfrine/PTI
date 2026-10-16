import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import assert from 'node:assert/strict';
import { VERSION, PROFILES, BUDGET, gradePerformance, validateScenario, verdict } from './policy.mjs';

const require = createRequire(import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const [url, adapterArg, outputArg] = process.argv.slice(2);
if (!url || !adapterArg || !outputArg) {
  console.error('Usage: node run.mjs <candidate-url> <scenario.mjs> <new-evidence-directory>');
  process.exit(2);
}
const adapterPath = resolve(adapterArg), output = resolve(outputArg), suite = dirname(fileURLToPath(import.meta.url));
const report = { evalVersion: VERSION, startedUTC: new Date().toISOString(), url, checks: [], trials: {},
  humanReview: 'not_run', manualChecks: 'not_run', environment: { node: process.version,
    os: `${os.platform()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model, logicalCPUs: os.cpus().length },
  budgets: BUDGET, profiles: PROFILES,
  caveat: 'Browser lab proxies; automated pass does not establish exceptional quality or device validation' };
let browser, outputCreated = false;
const check = async (id, fn) => {
  try { const detail = await fn(); report.checks.push({ id, status: 'pass', ...(detail ? { detail } : {}) }); return true; }
  catch (error) { report.checks.push({ id, status: error.infrastructure ? 'blocked' : 'fail', reason: String(error.message) }); return false; }
};
const infrastructure = async fn => {
  try { return await fn(); } catch (error) { error.infrastructure = true; throw error; }
};
const bounded = async (fn) => {
  let timer;
  try { return await Promise.race([fn(), new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Scenario hook exceeded 15 seconds')), 15000);
  })]); } finally { clearTimeout(timer); }
};
function observe() {
  const m = window.__visualEval = { frames: [], collecting: false, last: null };
  function frame(time) {
    if (m.collecting && m.last !== null) m.frames.push(time - m.last);
    m.last = m.collecting ? time : null;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
async function evidenceHashes(dir, prefix = '') {
  const files = {};
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const key = join(prefix, e.name), path = join(dir, e.name);
    if (e.isDirectory()) Object.assign(files, await evidenceHashes(path, key));
    else if (e.isFile() && key !== 'report.json') files[key] = hash(await readFile(path));
  }
  return files;
}
try {
  assert(['http:', 'https:'].includes(new URL(url).protocol), 'Use an HTTP(S) candidate URL');
  const scenario = (await import(pathToFileURL(adapterPath).href)).default;
  validateScenario(scenario);
  report.scenario = { path: adapterPath, name: scenario.name, outcomes: scenario.outcomes,
    sha256: hash(await readFile(adapterPath)) };
  report.evalFiles = {};
  for (const file of ['README.md', 'review-template.md', 'scenario.template.mjs', 'policy.mjs', 'run.mjs', 'package.json', 'package-lock.json']) {
    report.evalFiles[file] = hash(await readFile(join(suite, file)));
  }
  const git = (...args) => execFileSync('git', args, { cwd: dirname(adapterPath), encoding: 'utf8' }).trim();
  const root = git('rev-parse', '--show-toplevel');
  report.source = { commit: git('rev-parse', 'HEAD'), adapterRelativePath: relative(root, adapterPath),
    dirtyPaths: git('status', '--porcelain', '--untracked-files=all', '--', '.', `:(exclude)${relative(dirname(adapterPath), output)}/**`) };
  report.source.finalReviewEligible = report.source.dirtyPaths === '';
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output); // Refuse to overwrite previous evidence.
  outputCreated = true;
  const { chromium } = await import('playwright');
  report.environment.playwright = require('playwright/package.json').version;
  const executablePath = process.env.EVAL_CHROMIUM_EXECUTABLE;
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  report.environment.executable = executablePath || 'Playwright bundled Chromium';
  report.environment.chromium = browser.version();
  // Prove video tooling works before attributing any failure to the candidate.
  const preflightDir = join(output, '_preflight');
  const preflight = await browser.newContext({ recordVideo: { dir: preflightDir } });
  await preflight.newPage();
  await preflight.close();
  await rm(preflightDir, { recursive: true, force: true });

  async function session(profile, name, throttled, work) {
    const dir = join(output, name);
    await mkdir(dir);
    const context = await infrastructure(() => browser.newContext({ viewport: { width: profile.width, height: profile.height },
      hasTouch: profile.input === 'touch', isMobile: profile.input === 'touch', deviceScaleFactor: 1,
      reducedMotion: profile.reducedMotion ? 'reduce' : 'no-preference', serviceWorkers: 'block',
      recordVideo: { dir, size: { width: profile.width, height: profile.height } } }));
    await infrastructure(() => context.tracing.start({ screenshots: true, snapshots: true, sources: true }));
    await context.addInitScript(observe);
    const page = await infrastructure(() => context.newPage()), errors = [];
    page.setDefaultTimeout(10000);
    page.setDefaultNavigationTimeout(15000);
    page.on('pageerror', e => errors.push({ type: 'exception', message: e.message }));
    page.on('console', m => { if (m.type() === 'error') errors.push({ type: 'console', message: m.text() }); });
    page.on('requestfailed', r => errors.push({ type: 'request', url: r.url(), message: r.failure()?.errorText }));
    page.on('response', r => { if (r.status() >= 400) errors.push({ type: 'http', url: r.url(), status: r.status() }); });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (throttled) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150,
        downloadThroughput: 1600000 / 8, uploadThroughput: 750000 / 8 });
    }
    const opts = { input: profile.input, reducedMotion: !!profile.reducedMotion };
    const hook = (key, extra = {}) => bounded(() => scenario[key](page, { ...opts, ...extra }));
    const shot = label => page.screenshot({ path: join(dir, `${label}.png`), fullPage: true });
    const layout = async () => {
      const size = await page.evaluate(() => ({ viewport: innerWidth,
        document: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0) }));
      assert.equal(size.viewport, page.viewportSize().width, 'Effective layout viewport must match the tested width');
      assert(size.document <= size.viewport + 1, `Horizontal overflow: ${JSON.stringify(size)}`);
    };
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
      assert(response && response.status() < 400, 'Candidate navigation failed');
      await hook('ready');
      const readyMs = await page.evaluate(() => performance.now());
      await hook('assertInitial');
      await work({ page, hook, shot, layout, readyMs });
    } catch (error) {
      await shot('failure').catch(() => {});
      throw error;
    } finally {
      await writeFile(join(dir, 'runtime.json'), JSON.stringify(errors, null, 2));
      await context.tracing.stop({ path: join(dir, 'trace.zip') });
      await context.close();
      report.checks.push({ id: `${name}/A1-runtime`, status: errors.length ? 'fail' : 'pass', errors });
    }
  }

  for (const profile of PROFILES) {
    await check(`${profile.id}/A2-A3`, () => session(profile, profile.id, false, async ({ page, hook, shot, layout }) => {
      await layout(); await shot('initial');
      for (const variant of ['a', 'b']) {
        await hook('act', { variant }); await hook('assertOutcome', { variant });
        await layout(); await shot(`outcome-${variant}`);
        await hook('recover'); await hook('assertInitial'); await layout();
      }
      for (let i = 0; i < 10; i++) await hook('act', { variant: i % 2 ? 'b' : 'a' });
      await hook('assertOutcome', { variant: 'b' }); await layout(); await shot('repeated-input');
      if (profile.id === 'desktop-pointer') {
        for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
          await page.setViewportSize(viewport); await hook('assertOutcome', { variant: 'b' });
          await layout(); await shot(`resize-${viewport.width}`);
        }
      }
      await hook('recover'); await hook('assertInitial'); await layout(); await shot('recovered');
    }));
    console.log(`Recorded ${profile.id}`);
  }
  for (const profile of [PROFILES[0], PROFILES[2]]) {
    const mobile = profile.input === 'touch', trials = [];
    report.trials[profile.id] = { settings: mobile ? { cpuSlowdown: 4, downBps: 1600000, upBps: 750000, latencyMs: 150 }
      : { cpuSlowdown: 1, network: 'unthrottled' }, cache: 'fresh context; HTTP cache disabled; service workers blocked; DNS/GPU not reset', samples: trials };
    for (let n = 1; n <= BUDGET.trials; n++) {
      const trial = { status: 'blocked' };
      const ok = await check(`${profile.id}/A4-trial-${n}`, () => session(profile, `${profile.id}-cold-${n}`, mobile,
        async ({ page, hook, shot, readyMs }) => {
          trial.readyMs = readyMs;
          await page.evaluate(() => { window.__visualEval.frames = []; window.__visualEval.last = null;
            window.__visualEval.collecting = true; window.__visualEval.start = performance.now(); });
          for (const variant of ['a', 'b', 'a']) { await hook('act', { variant }); await hook('assertOutcome', { variant }); }
          const elapsed = await page.evaluate(() => performance.now() - window.__visualEval.start);
          await page.waitForTimeout(Math.max(0, BUDGET.sampleMs - elapsed) + 25);
          Object.assign(trial, await page.evaluate(() => {
            const m = window.__visualEval; m.collecting = false;
            return { frames: m.frames, durationMs: performance.now() - m.start };
          }));
          await shot('sample-end');
        }));
      trial.status = ok ? 'pass' : 'fail'; trials.push(trial);
      console.log(`Recorded ${profile.id} cold trial ${n}`);
    }
    report.checks.push({ id: `${profile.id}/A4-budget`, ...gradePerformance(trials) });
  }
} catch (error) {
  report.checks.push({ id: 'setup-or-infrastructure', status: 'blocked', reason: String(error.message) });
} finally {
  if (browser) await browser.close().catch(() => {});
  report.finishedUTC = new Date().toISOString();
  report.automatedVerdict = verdict(report.checks);
  if (outputCreated) {
    report.evidenceSHA256 = await evidenceHashes(output);
    await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  } else console.error(JSON.stringify(report, null, 2));
  console.log(`Automated: ${report.automatedVerdict}; human/manual: not_run${outputCreated ? `; ${output}/report.json` : ''}`);
  process.exitCode = report.automatedVerdict === 'pass' ? 0 : report.automatedVerdict === 'fail' ? 1 : 2;
}
