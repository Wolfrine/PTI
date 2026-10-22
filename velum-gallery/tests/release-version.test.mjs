import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  releaseVersion, stampRelease, RELEASE_MARKER,
  REVISION_MARKER, CACHE_MARKER
} from '../../.github/scripts/velum-release.mjs';

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const SHA = 'a123456789abcdef0123456789abcdef01234567';

test('release version is IST date and time, independent of runner timezone', () => {
  assert.equal(releaseVersion(new Date('2026-10-22T10:30:45Z')), '2026.10.22.160045');
  assert.equal(releaseVersion(new Date('2026-10-22T19:45:02Z')), '2026.10.23.011502');
  assert.throws(() => releaseVersion(new Date('not a date')), /valid release instant/);
});

test('release label is in index HTML, not looked up against a newer server release', () => {
  const html = source('index.html');
  assert.match(html, /id="velumRelease" class="release-stamp"/);
  assert.match(html, /aria-label="Velum release __VELUM_RELEASE__"/);
  assert.match(html, /title="Released __VELUM_RELEASE__ IST · commit __VELUM_REV__"/);
  assert.match(html, /v__VELUM_RELEASE__<\/output>/);
  assert.doesNotMatch(html, /release\.json|fetch\(.*version/i);
});

test('CI stamps the same immutable release into HTML and a fresh service worker', () => {
  const html = source('index.html');
  const worker = source('sw.js');
  assert.match(worker, /velum-shell-__VELUM_CACHE__/);
  const stamp = stampRelease({
    html, worker, date: new Date('2026-10-22T10:30:45Z'),
    sha: SHA, runId: '123456789', attempt: '1'
  });
  assert.equal(stamp.version, '2026.10.22.160045');
  assert.match(stamp.html, /v2026\.10\.22\.160045<\/output>/);
  assert.match(stamp.html, /commit a1234567/);
  assert.doesNotMatch(stamp.html, /__VELUM_RELEASE__|__VELUM_REV__/);
  assert.match(stamp.worker, /const CACHE='velum-shell-20261022160045-a1234567-123456789-1';/);
  assert.doesNotMatch(stamp.worker, /__VELUM_CACHE__/);
});

test('distinct deploy attempts and repeated same-day releases never share worker cache', () => {
  const values = { html: source('index.html'), worker: source('sw.js'), sha: SHA };
  const a = stampRelease({ ...values, date: new Date('2026-10-22T10:30:45Z'), runId: '100', attempt: '1' });
  const b = stampRelease({ ...values, date: new Date('2026-10-22T10:30:45Z'), runId: '100', attempt: '2' });
  const c = stampRelease({ ...values, date: new Date('2026-10-22T10:31:03Z'), runId: '101', attempt: '1' });
  assert.notEqual(a.releaseId, b.releaseId);
  assert.notEqual(a.releaseId, c.releaseId);
  assert.notEqual(a.version, c.version);
});

test('stamping fails closed instead of publishing an invented version', () => {
  const html = source('index.html');
  const worker = source('sw.js');
  const opts = { html, worker, date: new Date(), sha: SHA };
  assert.ok(html.includes(RELEASE_MARKER));
  assert.ok(html.includes(REVISION_MARKER));
  assert.ok(worker.includes(CACHE_MARKER));
  assert.throws(() => stampRelease({ ...opts, sha: 'invalid' }), /commit SHA/);
  assert.throws(() => stampRelease({ ...opts, html: html.replaceAll(RELEASE_MARKER, '') }), /placeholders/);
  assert.throws(() => stampRelease({ ...opts, worker: worker.replaceAll(CACHE_MARKER, '') }), /worker cache/);
});

test('version sits below navigation buttons inside a dedicated footer row, not on the image', () => {
  const html = source('index.html');
  const css = source('styles.css');
  const interaction = source('interaction-upgrades.js');
  const navStart = html.indexOf('<nav class="bottom-nav"');
  const stamp = html.indexOf('id="velumRelease"');
  const navEnd = html.indexOf('</nav>', navStart);
  assert.ok(navStart >= 0 && stamp > navStart && stamp < navEnd);
  assert.match(html, /<nav class="bottom-nav"[\s\S]*id="velumRelease"[\s\S]*<\/nav>/);

  const rule = css.match(/\.release-stamp\{([^}]+)\}/)?.[1];
  assert.ok(rule, 'release CSS must be present');
  assert.match(rule, /left:50%;bottom:calc\(3px \+ var\(--safe-bottom\)\)/);
  assert.match(rule, /pointer-events:none/);
  assert.doesNotMatch(rule, /background:|border:|backdrop-filter:|z-index:|padding:/);

  assert.match(css, /\.bottom-nav\{[^}]*height:calc\(76px \+ var\(--safe-bottom\)\);padding-bottom:calc\(17px \+ var\(--safe-bottom\)\)/);
  assert.match(css, /\.main-content\{[^}]*inset:0 0 calc\(76px \+ var\(--safe-bottom\)\) 0/);
  assert.doesNotMatch(css, /\.release-stamp\{[^}]*bottom:calc\(77px/);

  // Immersive Drift used to force 58px/64px nav height, which would move the
  // version outside its reserved row on mobile. Both states must agree.
  assert.doesNotMatch(interaction, /height:calc\((?:58|64)px \+ env\(safe-area-inset-bottom/);
  assert.match(interaction, /height:calc\(76px \+ env\(safe-area-inset-bottom,0px\)\)!important/);
  assert.match(interaction, /padding-bottom:calc\(17px \+ env\(safe-area-inset-bottom,0px\)\)!important/);
});
