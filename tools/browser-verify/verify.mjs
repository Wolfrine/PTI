import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const runtime = 'H:\\Workspace\\Runtimes\\PTI\\browser-verify';
const temp = 'H:\\Workspace\\Temp\\PTI\\browser-verify';
const reports = 'H:\\Workspace\\Reports\\PTI\\browser-verify';
const origins = {
  pti: ['https://pti-app-2ab59.web.app'],
  taleweald: ['https://taleweald.web.app', 'https://taleweald.firebaseapp.com'],
  gtop: ['https://gtop-app.web.app'],
};
const viewports = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};
const timeout = 20_000;
const usage = 'node tools/browser-verify/verify.mjs --app pti|taleweald|gtop|local --url URL [--view desktop|mobile|both] [--ready LOCATOR] [--click LOCATOR [--after LOCATOR]] [--webgl]';

function options() {
  const { values } = parseArgs({ options: {
    app: { type: 'string' }, url: { type: 'string' },
    view: { type: 'string', default: 'both' }, ready: { type: 'string' },
    click: { type: 'string' }, after: { type: 'string' }, webgl: { type: 'boolean' },
    help: { type: 'boolean' },
  } });
  if (values.help) return values;
  if (!values.app || !values.url || (values.after && !values.click)) throw new Error(usage);
  if (values.view !== 'both' && !Object.hasOwn(viewports, values.view)) throw new Error('Unknown viewport.');
  const url = new URL(values.url);
  const local = values.app === 'local';
  const allowed = local
    ? /^http:\/\/127\.0\.0\.1:\d+(?:\/|$)/.test(values.url) && Number(url.port) >= 1024
    : url.protocol === 'https:' && Object.hasOwn(origins, values.app) && origins[values.app].includes(url.origin);
  if (!allowed || url.username || url.password || url.search || url.hash || !appPath(url)) {
    throw new Error('Use an approved app origin or explicit loopback port and a path without credentials, query, or fragment.');
  }
  return { ...values, local, url, views: values.view === 'both' ? Object.keys(viewports) : [values.view] };
}

function appPath(url) {
  try {
    const path = decodeURIComponent(url.pathname);
    return !path.split('/').includes('__') && !path.includes('\\'); // Firebase reserved authentication endpoints.
  } catch {
    return false;
  }
}

function staticAsset(url, resourceType) {
  return (url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2' && resourceType === 'stylesheet')
    || (url.origin === 'https://fonts.gstatic.com' && resourceType === 'font')
    || (url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/') && resourceType === 'script');
}

async function configureNetworking(context, page, settings, result) {
  const count = (reason) => { result.blocked[reason] = (result.blocked[reason] ?? 0) + 1; };
  await context.routeWebSocket('**/*', async (socket) => {
    count('websocket');
    await socket.close();
  });
  await context.route('**/*', async (route, request) => {
    const url = new URL(request.url());
    const navigation = request.isNavigationRequest();
    let ownFrame = false;
    if (navigation) {
      try { ownFrame = request.frame() === page.mainFrame(); } catch { /* New popup without a frame. */ }
    }
    const abort = async (reason) => {
      count(reason);
      if (ownFrame) result.blockedNavigation = reason;
      await route.abort('blockedbyclient');
    };
    if (!['GET', 'HEAD'].includes(request.method())) return abort('method');
    if (url.username || url.password || !appPath(url)) return abort('reserved-url');
    const sameOrigin = url.protocol === settings.url.protocol && url.origin === settings.url.origin;
    if (navigation && (!ownFrame || !sameOrigin)) return abort('navigation-scope');
    if (!sameOrigin && (settings.local || !staticAsset(url, request.resourceType()))) return abort('origin');

    // Browser routing alone only inspects the first URL of an HTTP redirect.
    // Fetch exactly one response and stop before any redirect target is fetched.
    let response;
    try {
      response = await route.fetch({ maxRedirects: 0, timeout });
    } catch {
      return abort('upstream-error');
    }
    try {
      if (response.status() >= 300 && response.status() < 400 && response.headers().location) {
        return await abort('http-redirect');
      }
      await route.fulfill({ response });
    } finally {
      await response.dispose();
    }
  });
}

function pageUrl(page, allowed) {
  const url = new URL(page.url());
  if (url.protocol !== allowed.protocol || url.origin !== allowed.origin || !appPath(url)) {
    throw new Error('Page left its approved origin or path.');
  }
  return url.origin + url.pathname;
}

async function measure(page, webgl) {
  return page.evaluate((probeGraphics) => {
    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0);
    const layout = {
      viewport: { width: innerWidth, height: innerHeight }, documentWidth,
      horizontalOverflow: Math.max(0, documentWidth - document.documentElement.clientWidth),
      scrollY,
      touchPoints: navigator.maxTouchPoints,
      canvases: Array.from(document.querySelectorAll('canvas'), (canvas) => {
        const { width, height } = canvas.getBoundingClientRect();
        return { width, height, bufferWidth: canvas.width, bufferHeight: canvas.height };
      }),
    };
    if (probeGraphics) {
      layout.webgl = Object.fromEntries(['webgl', 'webgl2'].map((version) => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext(version);
        if (!gl) return [version, { available: false }];
        gl.clearColor(1, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const pixel = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
        const result = { available: true, renderer, pixel: [...pixel], redPixel: pixel.join(',') === '255,0,0,255' };
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return [version, result];
      }));
    }
    return layout;
  }, webgl);
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

async function capture(page, settings, folder, name) {
  const url = pageUrl(page, settings.url);
  const layout = await measure(page, settings.webgl);
  const file = `${name}.png`;
  const image = await page.screenshot({ path: join(folder, file), timeout });
  return { url, layout, file, sha256: sha256(image) };
}

async function verifyView(browser, settings, folder, view) {
  const result = { view, blocked: {}, pageErrors: 0, popupsClosed: 0 };
  const context = await browser.newContext({ ...viewports[view], acceptDownloads: false, serviceWorkers: 'block' });
  let stage = 'context';
  try {
    const page = await context.newPage();
    context.on('page', (popup) => {
      result.popupsClosed += 1;
      void popup.close().catch(() => {});
    });
    page.on('pageerror', () => { result.pageErrors += 1; });
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout + 5_000);
    await configureNetworking(context, page, settings, result);
    stage = 'navigation';
    const response = await page.goto(settings.url.href, { waitUntil: 'load' });
    result.httpStatus = response?.status();
    if (!response?.ok()) throw new Error('Navigation did not return HTTP success.');
    stage = 'ready';
    if (settings.ready) await page.locator(settings.ready).waitFor({ state: 'visible' });
    stage = 'capture';
    result.before = await capture(page, settings, folder, view);
    if (settings.click) {
      stage = 'interaction';
      const target = page.locator(settings.click);
      const expected = settings.after && page.locator(settings.after);
      const expectedVisibleBefore = expected ? await expected.isVisible() : undefined;
      const popupsBeforeClick = result.popupsClosed;
      if (view === 'mobile') await target.tap();
      else await target.click();
      if (expected) await expected.waitFor({ state: 'visible' });
      if (result.blockedNavigation || result.popupsClosed > popupsBeforeClick) {
        throw new Error('Interaction attempted a blocked navigation.');
      }
      result.after = await capture(page, settings, folder, `${view}-after`);
      result.interaction = {
        action: view === 'mobile' ? 'tap' : 'click', locator: settings.click,
        expectedVisibleBefore, visibleAfter: settings.after,
      };
    }
    if (result.blockedNavigation) throw new Error('Blocked navigation.');
    result.status = 'captured';
  } catch (error) {
    result.status = 'incomplete';
    // Browser error messages can include page content or query parameters.
    result.failure = { stage, timeout: error.name === 'TimeoutError' };
  } finally {
    await context.close();
  }
  return result;
}

async function main() {
  const settings = options();
  if (settings.help) return console.log(usage);
  process.env.TEMP = temp;
  process.env.TMP = temp;
  process.env.PLAYWRIGHT_BROWSERS_PATH = join(runtime, 'chromium');
  await mkdir(temp, { recursive: true });
  await mkdir(reports, { recursive: true });
  const require = createRequire(join(runtime, 'package.json'));
  const { chromium } = require('playwright');
  const folder = await mkdtemp(join(reports, `${new Date().toISOString().slice(0, 10)}-${settings.app}-`));
  const receipt = {
    schema: 1, startedAt: new Date().toISOString(), app: settings.app,
    requestedUrl: settings.url.href, scriptSha256: sha256(await readFile(new URL(import.meta.url))),
    playwright: require('playwright/package.json').version, ready: settings.ready, views: [],
  };
  try {
    const browser = await chromium.launch({
      channel: 'chromium', headless: true, chromiumSandbox: true,
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: temp, TMP: temp },
    });
    try {
      receipt.chromium = browser.version();
      for (const view of settings.views) receipt.views.push(await verifyView(browser, settings, folder, view));
    } finally {
      await browser.close();
    }
  } catch (error) {
    receipt.failure = receipt.chromium ? 'browser-operation-failed' : 'chromium-launch-failed';
    console.error(error.message);
  }
  const file = join(folder, 'receipt.json');
  await writeFile(file, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(file);
  if (receipt.failure || receipt.views.some(({ status }) => status !== 'captured')) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.code === 'MODULE_NOT_FOUND' ? 'Install the pinned Playwright runtime using the README.' : error.message);
  process.exitCode = 1;
});
