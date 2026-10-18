import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transform } from 'esbuild';
const source = await readFile(new URL('../../../pti-app/src/app/services/login-return.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const { safeLoginReturn, navigateAfterLogin, onePieceEntry } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

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
