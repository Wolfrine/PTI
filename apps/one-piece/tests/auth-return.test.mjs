import { readFile, readdir, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { buildDedicatedArtifact, safeAppReturnPath, canonicalAppUrl, redirectDocument, angularRetirementWorker } from '../scripts/build.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transform } from 'esbuild';

const canonical='https://pti-app-2ab59-one-piece.web.app';
const returnSource=await readFile(new URL('../../../pti-app/src/app/services/login-return.ts',import.meta.url),'utf8');
const returns=await transform(returnSource,{loader:'ts',format:'esm'});
const {safeLoginReturn,onePieceLoginAlias,navigateAfterLogin}=await import(`data:text/javascript;base64,${Buffer.from(returns.code).toString('base64')}`);

test('old PTI login links go directly to the native app without carrying credentials',()=>{
 const raw='/one-piece/watch?episode=one-piece-1001&from=continue&range=1001&token=secret&ticket=secret#player';
 assert.equal(onePieceLoginAlias(raw),`${canonical}/one-piece/?episode=one-piece-1001&from=continue&range=1001#player`);
 assert.equal(onePieceLoginAlias('/one-piece/watch/944#player'),`${canonical}/one-piece/?episode=944#player`);
 for(const input of [null,'','/home','/login','https://evil.invalid','//evil.invalid','/one-piece/../home','/one-piece/%252e%252e/home'])assert.equal(onePieceLoginAlias(input),null,String(input));
 const calls=[];
 navigateAfterLogin('/domains?from=home',{navigateByUrl:url=>calls.push(['router',url])},{assign:url=>calls.push(['document',url])});
 navigateAfterLogin(raw,{navigateByUrl:url=>calls.push(['router',url])},{assign:url=>calls.push(['document',url])});
 assert.deepEqual(calls,[['router','/domains?from=home'],['document',`${canonical}/one-piece/?episode=one-piece-1001&from=continue&range=1001#player`]]);
 for(const route of ['/home','/domains','/activities'])assert.deepEqual(safeLoginReturn(route),{path:route,fullPage:false});
 for(const route of ['/dashboard','/new-dashboard','/codex-command','/codex-command/projects/project-1?tab=notes#recent'])assert.deepEqual(safeLoginReturn(route),{path:'/home',fullPage:false});
});

test('current PTI login stays available and legacy family handoff happens before Auth',async()=>{
 const base=new URL('../../../pti-app/src/app/',import.meta.url);
 const source=await readFile(new URL('components/login/login.component.ts',base),'utf8');
 const compiled=await transform(source.replace(/^import .*;\r?\n/gm,''),{loader:'ts',format:'cjs',target:'es2022'});
 for(const [redirect,expected] of [['/one-piece/?episode=500#player','alias'],['/home','pti']]){
  const calls=[],module={exports:{}};
  vm.runInNewContext(compiled.code,{module,exports:module.exports,Component:()=>type=>type,CommonModule:Symbol('common'),DestroyRef:Symbol('destroy'),inject:()=>({}),takeUntilDestroyed:()=>source=>source,onePieceLoginAlias,safeLoginReturn,navigateAfterLogin,window:{location:{replace:url=>calls.push(['replace',url])}}});
  const auth={getUser:()=>{calls.push(['getUser']);const user={subscribe:handler=>handler(null),pipe:operator=>operator(user)};return user;},initGoogleOneTap:()=>calls.push(['google'])};
  new module.exports.LoginComponent(auth,{}, {snapshot:{queryParamMap:{get:()=>redirect}}}).ngOnInit();
  if(expected==='alias')assert.deepEqual(calls,[['replace',`${canonical}/one-piece/?episode=500#player`]]);
  else assert.deepEqual(calls,[['getUser'],['google']]);
 }
 const html=await readFile(new URL('components/login/login.component.html',base),'utf8');
 const styles=await readFile(new URL('components/login/login.component.scss',base),'utf8');
 assert.match(html,/All your worlds\./);assert.match(html,/Continue with Google/);assert.match(html,/\(click\)="login\(\)"/);assert.doesNotMatch(html,/one-piece-login|onePiece|family sign in/i);assert.doesNotMatch(styles,/one-piece-login/);
});

test('PTI root keeps its update banner and suppresses only the old family-login Auth timer',async()=>{
 const source=await readFile(new URL('../../../pti-app/src/app/app.component.ts',import.meta.url),'utf8');
 const compiled=await transform(source.replace(/^import .*;\r?\n/gm,''),{loader:'ts',format:'cjs',target:'es2022'});
 for(const [pathname,search,timers] of [['/login','?redirect=%2Fone-piece%2F%3Fepisode%3D500',0],['/','?redirect=%2Fone-piece%2F',0],['/login','?redirect=%2Fhome',1],['/home','?redirect=%2Fone-piece%2F',1]]){
  const scheduled=[],module={exports:{}};
  vm.runInNewContext(compiled.code,{module,exports:module.exports,Component:()=>type=>type,RouterOutlet:Symbol('router'),NgIf:Symbol('if'),onePieceLoginAlias,URLSearchParams,setTimeout:callback=>scheduled.push(callback),window:{location:{pathname,search}}});
  const component=new module.exports.AppComponent({}, {events:{subscribe:()=>{}}}, {isEnabled:false});
  component.ngOnInit();assert.equal(scheduled.length,timers,pathname+search);assert.equal(component.appName,'PTI');
 }
 assert.match(source,/VERSION_READY/);assert.match(source,/updates\.activateUpdate\(\)/);
});
test('native One Piece welcome signs in here without navigating to the PTI login',async()=>{
 const {page}=await import('../web/src/views.mjs');
 const html=page({booting:false,user:null,network:'online',profile:{},appIdentity:{dedicated:true}});
 assert.match(html,/data-action="sign-in"/);
 assert.doesNotMatch(html,/href="[^"\n]*\/login|Sign in to PTI|Keep your momentum/i);
 const account=await readFile(new URL('../web/src/account.mjs',import.meta.url),'utf8');
 const app=await readFile(new URL('../web/src/app.mjs',import.meta.url),'utf8');
 assert.match(account,/signInWithPopup/);assert.match(app,/signInToOnePiece/);
});

test('redirects retain valid episode intent and discard every unapproved field',()=>{
 assert.equal(safeAppReturnPath('/one-piece/watch?episode=one-piece-1001&from=continue#player'),'/one-piece/?episode=one-piece-1001&from=continue#player');
 assert.equal(safeAppReturnPath('/one-piece/watch/944#player'),'/one-piece/?episode=944#player');
 assert.equal(safeAppReturnPath('/one-piece?episode=1085&range=1001#episodes'),'/one-piece/?episode=1085&range=1001#episodes');
 assert.equal(safeAppReturnPath('/one-piece/index.html?episode=1&ticket=secret&token=secret&id_token=secret&redirect=https://evil.invalid#access_token=secret'),'/one-piece/?episode=1');
 assert.equal(safeAppReturnPath('/one-piece/?episode=9999&from=secret&range=9999'),'/one-piece/');
 const legacy=new URL('https://pti-app-2ab59.web.app/one-piece/?episode=1001&access_token=secret#player');
 assert.equal(canonicalAppUrl(legacy.href),`${canonical}/one-piece/?episode=1001#player`);
 const login=new URL('/login',canonical);login.searchParams.set('redirect','/one-piece/watch?episode=500&from=continue#player');login.searchParams.set('token','secret');
 assert.equal(canonicalAppUrl(login.href),`${canonical}/one-piece/?episode=500&from=continue#player`);
 assert.equal(canonicalAppUrl(`${canonical}/login?redirect=https%3A%2F%2Fevil.invalid`),`${canonical}/one-piece/`);
});

test('external, traversal, encoded separators and malformed returns fail closed',()=>{
 for(const raw of [null,'','https://evil.invalid','//evil.invalid','/\\evil.invalid','/one-piece/../home','/one-piece/%2e%2e/home','/one-piece/%252e%252e/home','/one-piece%2fwatch','/one-piece/%5cwatch','/one-piece/watch?episode=%0a','/one-piece/watch?episode=%250a','/one-piece/%','/one-piece-other/','/one-piece/watch?x=hello world','/one-piece\n/watch','/home','/login'])assert.equal(safeAppReturnPath(raw),'/one-piece/',String(raw));
});

test('redirect-only HTML executes the same safe redirect without auth or storage migration',()=>{
 const html=redirectDocument(),script=html.match(/<script>([\s\S]*?)<\/script>/)[1],calls=[],link={};
 const href='https://pti-app-2ab59.web.app/one-piece/watch?episode=944&ticket=secret#player';
 vm.runInNewContext(script,{URL,location:{href,replace:target=>calls.push(target)},document:{getElementById:()=>link}});
 assert.deepEqual(calls,[`${canonical}/one-piece/?episode=944#player`]);assert.equal(link.href,calls[0]);
 assert.doesNotMatch(html,/rel="manifest"|app\.js|localStorage|indexedDB|firebase\/auth/);
});

test('dedicated artifact contains only One Piece assets and retirement entries; PTI is preserved',async()=>{
 const scratch=await mkdtemp(path.join(os.tmpdir(),'one-piece-identity-'));
 try{
  const destination=path.join(scratch,'browser');await mkdir(path.join(destination,'one-piece'),{recursive:true});
  const index='<!doctype html><head><title>PTI</title></head><app-root></app-root><script src="main-unchanged.js"></script>';
  const manifest=JSON.parse(await readFile(new URL('../web/manifest.webmanifest',import.meta.url),'utf8'));
  await writeFile(path.join(destination,'index.html'),index);
  await writeFile(path.join(destination,'one-piece/index.html'),'<!doctype html><head><title>One Piece</title></head><script src="/one-piece/app.js"></script>');
  await writeFile(path.join(destination,'one-piece/manifest.webmanifest'),JSON.stringify(manifest));
  await writeFile(path.join(destination,'one-piece/app.js'),'own native Google sign-in');
  await writeFile(path.join(destination,'manifest.webmanifest'),'original PTI manifest');
  await writeFile(path.join(destination,'main-unchanged.js'),'existing PTI authentication code');
  await writeFile(path.join(destination,'ngsw.json'),JSON.stringify({hashTable:{'/index.html':'old-index'}}));
  const dedicated=await buildDedicatedArtifact(destination);
  assert.deepEqual((await readdir(dedicated)).sort(),['index.html','manifest.webmanifest','ngsw-worker.js','one-piece']);
  const ownManifest=JSON.parse(await readFile(path.join(dedicated,'manifest.webmanifest'),'utf8'));
  assert.equal(ownManifest.scope,'/');assert.equal(ownManifest.id,'/one-piece/');
  assert.equal(JSON.parse(await readFile(path.join(destination,'one-piece/manifest.webmanifest'),'utf8')).scope,'/one-piece/');
  assert.equal(await readFile(path.join(destination,'index.html'),'utf8'),index);
  assert.equal(await readFile(path.join(dedicated,'index.html'),'utf8'),redirectDocument());
  assert.match(await readFile(path.join(dedicated,'one-piece/index.html'),'utf8'),/getRegistrations/);
  assert.equal(await readFile(path.join(dedicated,'one-piece/app.js'),'utf8'),'own native Google sign-in');
  await assert.rejects(readFile(path.join(dedicated,'main-unchanged.js')),/ENOENT/);
  await assert.rejects(readFile(path.join(dedicated,'ngsw.json')),/ENOENT/);
  await writeFile(path.join(dedicated,'stale.js'),'old release');await buildDedicatedArtifact(destination);
  await assert.rejects(readFile(path.join(dedicated,'stale.js')),/ENOENT/);
  await assert.rejects(buildDedicatedArtifact(dedicated),/Invalid dedicated Hosting artifact path/);
 }finally{assert.equal(path.dirname(path.resolve(scratch)),path.resolve(os.tmpdir()));assert.ok(path.basename(scratch).startsWith('one-piece-identity-'));await rm(scratch,{recursive:true,force:true});}
});

test('dedicated Angular worker retirement clears only Angular caches and never reloads a client',async()=>{
 const listeners=new Map(),deleted=[],calls=[];
 const self={addEventListener:(type,handler)=>listeners.set(type,handler),skipWaiting:()=>calls.push('skipWaiting'),clients:{claim:async()=>calls.push('claim')},registration:{unregister:async()=>calls.push('unregister')}};
 vm.runInNewContext(angularRetirementWorker(),{self,caches:{keys:async()=>['ngsw:/:old:assets','one-piece-shell-current','other-app'],delete:async key=>deleted.push(key)}});
 for(const type of ['install','activate']){let work;listeners.get(type)({waitUntil:promise=>work=promise});await work;}
 assert.deepEqual(deleted,['ngsw:/:old:assets']);assert.deepEqual(calls,['skipWaiting','claim','unregister']);
 assert.equal(listeners.has('fetch'),false);
});
