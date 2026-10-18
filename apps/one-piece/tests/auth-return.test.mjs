import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transform } from 'esbuild';
const source = await readFile(new URL('../../../pti-app/src/app/services/login-return.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const { safeLoginReturn, navigateAfterLogin, onePieceEntry } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('the actual PWA sign-in link resolves to PTI login and preserves the bookmarked episode', async () => {
  const routesSource = await readFile(new URL('../../../pti-app/src/app/app.routes.ts', import.meta.url), 'utf8');
  // Evaluate the owning route table with inert component identities; no Firebase or production auth bypass.
  const names = [...routesSource.matchAll(/^import \{ (\w+) \} from '\.\/[^']+';/gm)].map(match => match[1]);
  const routeCode = await transform(names.map(name => `const ${name}=Symbol('${name}');`).join('\n') + '\n' + routesSource.replace(/^import .*;\r?\n/gm, ''), { loader: 'ts', format: 'esm' });
  const { routes } = await import(`data:text/javascript;base64,${Buffer.from(routeCode.code).toString('base64')}`);
  const { loginUrl } = await import('../web/src/views.mjs');
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
  try {
    const bookmark = '/one-piece/watch?episode=one-piece-1001&from=continue#player';
    const url = new URL(bookmark, 'https://pti.invalid');
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { pathname: url.pathname, search: url.search, hash: url.hash } });
    const signIn = new URL(loginUrl(), url.origin);
    const matched = routes.find(route => '/' + route.path === signIn.pathname);
    assert.ok(matched, 'the generated sign-in path must exist in the actual PTI route table');
    assert.equal(matched.component, routes.find(route => route.path === '').component);
    assert.equal(signIn.searchParams.get('redirect'), bookmark);
    assert.deepEqual(safeLoginReturn(signIn.searchParams.get('redirect')), { path: bookmark, fullPage: true });
  } finally {
    if (previous) Object.defineProperty(globalThis, 'location', previous);
    else delete globalThis.location;
  }
});

test('all existing PTI login routes preserve query strings and use Angular navigation', () => {
  for (const route of ['/home','/dashboard','/new-dashboard','/domains','/domains/domain-1','/activities','/codex-command','/codex-command/projects/project-1?tab=notes#recent']) {
    assert.deepEqual(safeLoginReturn(route), { path: route, fullPage: false });
  }
});
test('One Piece episode links use a full-page same-origin sibling return', () => {
  const route = '/one-piece/watch?episode=one-piece-1001&from=continue#player';
  assert.deepEqual(safeLoginReturn(route), { path: route, fullPage: true });
  const calls = [];
  navigateAfterLogin(route, { navigateByUrl: url => calls.push(['router', url]) }, { assign: url => calls.push(['document', url]) });
  navigateAfterLogin('/domains?from=home', { navigateByUrl: url => calls.push(['router', url]) }, { assign: url => calls.push(['document', url]) });
  assert.deepEqual(calls, [['document', '/one-piece/watch?episode=one-piece-1001&from=continue&ngsw-bypass=true#player'], ['router', '/domains?from=home']]);
  assert.equal(onePieceEntry('/one-piece'),'/one-piece/?ngsw-bypass=true');
  assert.equal(onePieceEntry('//evil.test'),'/home');
});
test('external, protocol-relative, separator, traversal and layered-encoding returns fail closed', () => {
  for (const bad of [null, '', 'https://evil.test', '//evil.test', '/\\evil.test', '/one-piece\\evil', '/one-piece/../home', '/one-piece/./watch',
    '/one-piece/%2e%2e/home', '/one-piece/%252e%252e/home', '/one-piece%2f..%2fhome', '/one-piece/%5c../home',
    '/%2fevil.test', '/one-piece/%3F/../home', '/one-piece/%23/../home', '/one-piece?episode=%250a', '/one-piece?episode=%0a', '/one-piece/%',
    '/one-piece?x=hello world', '/one-piece\n/watch', '/one-piece-other/', '/unknown', '/login', '/']) {
    assert.deepEqual(safeLoginReturn(bad), { path: '/home', fullPage: false }, String(bad));
  }
});
