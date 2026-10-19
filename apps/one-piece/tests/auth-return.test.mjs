import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { buildDedicatedArtifact } from '../scripts/build.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transform } from 'esbuild';
const source = await readFile(new URL('../../../pti-app/src/app/services/login-return.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const { safeLoginReturn, navigateAfterLogin, onePieceEntry, loginPresentation } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('One Piece sign-in keeps its identity and episode return while PTI retains its own login', () => {
  const bookmark='/one-piece/watch?episode=1001#player';
  for(const origin of ['https://pti-app-2ab59-one-piece.web.app','https://pti-app-2ab59-one-piece.firebaseapp.com']) {
    assert.deepEqual(loginPresentation(origin,bookmark),{onePiece:true,returnPath:bookmark});
    for(const raw of [null,'/home','https://evil.invalid/','//evil.invalid/'])assert.deepEqual(loginPresentation(origin,raw),{onePiece:true,returnPath:'/one-piece/'});
  }
  assert.deepEqual(loginPresentation('https://pti-app-2ab59.web.app','/home'),{onePiece:false,returnPath:'/home'});
  assert.deepEqual(loginPresentation('https://pti-app-2ab59.web.app',bookmark),{onePiece:true,returnPath:bookmark});
});

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

test('dedicated app sign-in stays on its own origin and retains the bookmarked episode',async()=>{
 const {loginUrl}=await import('../web/src/views.mjs');
 const previous=Object.getOwnPropertyDescriptor(globalThis,'location');
 try{
  const bookmark=new URL('https://pti-app-2ab59-one-piece.web.app/one-piece/?episode=1001#player');
  Object.defineProperty(globalThis,'location',{configurable:true,value:bookmark});
  const signIn=new URL(loginUrl(),bookmark);
  assert.equal(signIn.origin,bookmark.origin);assert.equal(signIn.pathname,'/login');
  assert.equal(signIn.searchParams.get('redirect'),bookmark.pathname+bookmark.search+bookmark.hash);
  assert.deepEqual(safeLoginReturn(signIn.searchParams.get('redirect')),{path:'/one-piece/?episode=1001#player',fullPage:true});
 }finally{if(previous)Object.defineProperty(globalThis,'location',previous);else delete globalThis.location;}
});

test('dedicated artifact has its own manifest during Angular login while legacy and auth code stay intact',async()=>{
 const scratch=await mkdtemp(path.join(os.tmpdir(),'one-piece-identity-'));
 try{
  const destination=path.join(scratch,'browser');await mkdir(path.join(destination,'one-piece'),{recursive:true});
  const index='<!doctype html><head><title>PTI</title><link rel="icon" type="image/x-icon" href="favicon.ico"><link rel="manifest" href="manifest.webmanifest"></head><script src="main-unchanged.js"></script>';
  const manifest=JSON.parse(await readFile(new URL('../web/manifest.webmanifest',import.meta.url),'utf8'));
  await writeFile(path.join(destination,'index.html'),index);
  await writeFile(path.join(destination,'one-piece/manifest.webmanifest'),JSON.stringify(manifest));
  await writeFile(path.join(destination,'manifest.webmanifest'),'original PTI manifest');
  await writeFile(path.join(destination,'main-unchanged.js'),'existing authentication code');
  await writeFile(path.join(destination,'ngsw.json'),JSON.stringify({hashTable:{'/index.html':'old-index','/manifest.webmanifest':'old-manifest','/main-unchanged.js':'must-remain'}}));
  const dedicated=await buildDedicatedArtifact(destination);
  const html=await readFile(path.join(dedicated,'index.html'),'utf8'),ownManifest=await readFile(path.join(dedicated,'manifest.webmanifest'),'utf8');
  assert.equal(JSON.parse(ownManifest).scope,'/');assert.equal(JSON.parse(ownManifest).id,'/one-piece/');
  assert.equal(JSON.parse(await readFile(path.join(destination,'one-piece/manifest.webmanifest'),'utf8')).scope,'/one-piece/');
  assert.match(html,/<title>One Piece · Sign in<\/title>/);assert.match(html,/href="\/one-piece\/manifest.webmanifest"/);assert.match(html,/type="image\/svg\+xml" href="\/one-piece\/icons\/icon.svg"/);
  assert.equal(await readFile(path.join(destination,'index.html'),'utf8'),index);
  assert.equal(await readFile(path.join(dedicated,'main-unchanged.js'),'utf8'),'existing authentication code');
  const ngsw=JSON.parse(await readFile(path.join(dedicated,'ngsw.json'),'utf8'));
  assert.equal(ngsw.hashTable['/index.html'],createHash('sha1').update(html).digest('hex'));
  assert.equal(ngsw.hashTable['/manifest.webmanifest'],createHash('sha1').update(ownManifest).digest('hex'));
  assert.equal(ngsw.hashTable['/main-unchanged.js'],'must-remain');
  await writeFile(path.join(dedicated,'stale.js'),'old release');await buildDedicatedArtifact(destination);
  await assert.rejects(readFile(path.join(dedicated,'stale.js')),/ENOENT/);
  await assert.rejects(buildDedicatedArtifact(dedicated),/Invalid dedicated Hosting artifact path/);
 }finally{assert.equal(path.dirname(path.resolve(scratch)),path.resolve(os.tmpdir()));assert.ok(path.basename(scratch).startsWith('one-piece-identity-'));await rm(scratch,{recursive:true,force:true});}
});
