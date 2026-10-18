import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root = 'H:/PTI-OnePiece/home-integration-qa';
const repo = 'F:/Workspace/Worktrees/PTI/one-piece-family';
const evidence = path.join(repo,'docs/one-piece/evidence/home-integration');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const binding = JSON.parse(await fs.readFile(path.join(evidence,'source-binding.json'),'utf8'));
for (const r of binding.sourceRecords) assert.equal(sha(await fs.readFile(path.join(repo,r.path))),r.sha256,`source drift ${r.path}`);
const cssSource = await fs.readFile(path.join(repo,'pti-app/public/assets/styles/pti-home.css'));
const cssResponse = await fetch('http://127.0.0.1:8917/assets/styles/pti-home.css');
assert.equal(cssResponse.status,200);
const cssBytes = Buffer.from(await cssResponse.arrayBuffer());
assert(cssBytes.equals(cssSource));
const prodCssPath = 'pti-app/dist/pti-app/browser/assets/styles/pti-home.css';
const prodCss = await fs.readFile(path.join(repo,prodCssPath));
assert(prodCss.equals(cssSource));
const prodIndex = await fs.readFile(path.join(repo,'pti-app/dist/pti-app/browser/index.html'),'utf8');
assert(prodIndex.includes('href="/assets/styles/pti-home.css"'));
const requests = JSON.parse(await fs.readFile(path.join(root,'document-requests.json'),'utf8'));
const events = JSON.parse(await fs.readFile(path.join(root,'events.json'),'utf8'));
assert.equal(requests.length,5);
assert(requests.every(r=>r.url==='/one-piece/?ngsw-bypass=true'&&r.secFetchDest==='document'&&r.secFetchMode==='navigate'));
assert(events.some(e=>e.ctrlKey&&e.defaultPrevented===false));
assert(events.some(e=>e.kind==='auxclick'&&e.button===1&&e.defaultPrevented===false));
assert.equal(events.filter(e=>e.kind==='click'&&e.button===0&&!e.ctrlKey&&e.defaultPrevented).length,3);
const captures=JSON.parse(await fs.readFile(path.join(evidence,'captures.json'),'utf8'));
for (const c of captures) {
  const bytes=await fs.readFile(path.join(evidence,c.label+'.png'));
  assert.equal(sha(bytes),c.pngSha256);
  const ax=await fs.readFile(path.join(evidence,c.label+'.ax.txt'));
  assert.equal(sha(ax),c.axSha256);
  c.pngWidth=bytes.readUInt32BE(16);c.pngHeight=bytes.readUInt32BE(20);
}
await fs.writeFile(path.join(evidence,'captures.json'),JSON.stringify(captures,null,2));
const observations=JSON.parse(await fs.readFile(path.join(evidence,'browser-observations.json'),'utf8'));
assert(observations.observations.every(o=>o.dom.scrollWidth===o.dom.clientWidth&&o.dom.bodyScrollWidth<=o.dom.clientWidth&&o.dom.brokenImages.length===0));
await fs.writeFile(path.join(evidence,'document-requests.json'),JSON.stringify(requests,null,2));
await fs.writeFile(path.join(evidence,'click-events.json'),JSON.stringify(events,null,2));
for (const [from,to] of [['setup.mjs','harness-setup.mjs'],['server.mjs','harness-server.mjs'],['src/main.ts','harness-bootstrap.ts'],['angular.json','harness.angular.json']]) await fs.copyFile(path.join(root,from),path.join(evidence,to));
const result={
  at:new Date().toISOString(), reviewer:'/root/home_integration_qa',
  scope:'Independent deterministic launcher integration QA; no production source edits or formal new design acceptance.',
  central:{version:'0.1.0',baseRevision:'ba1235fe7b220842778414f3f70fca38e7df4c53'},
  candidate:binding.sourceRecords[0],
  sourcePreservation:{normalizedUnchanged:6,inspectedFiles:7,onlyChanged:'NewHomeComponent TypeScript: optional documentNavigation, canonical One Piece HubApp, full document dispatch branch, removed superseded workbench placeholder'},
  angularCompile:{start:'2026-10-18T12:58:57.5100576Z',end:'2026-10-18T12:59:17.6698107Z',generationSeconds:16.963,exitCode:0,execSession:86848},
  asset:{url:'http://127.0.0.1:8917/assets/styles/pti-home.css',status:200,bytes:cssBytes.length,sha256:sha(cssBytes),matchesProductionSource:true,productionArtifactPath:prodCssPath,productionArtifactSha256:sha(prodCss),productionIndexReferencesAbsoluteCss:true,appliedCssRulesObserved:133},
  visual:{verdict:'pass-scoped-render-check',newDesignAcceptance:false,viewports:[{width:1440,height:1000,cssClientWidth:1425},{width:390,height:844,cssClientWidth:375}],findings:['Existing warm-light upstream composition and asset preserved.','One Piece fits the existing directory card without wrapping or clipping its label.','Mobile search, Personal category, recent-launch card, and seven-item pinned grid remain readable.','No horizontal overflow, broken image, or visible overlap in inspected states.'],captures:captures.map(c=>({label:c.label,pngSha256:c.pngSha256})),ownerAcceptance:'not assessed'},
  functional:{verdict:'pass-scoped-fixture',documentRequests:5,plainDesktopDirectory:true,plainMobilePinned:true,plainMobileRecent:true,ctrlClickNativeNewTab:true,middleClickNativeNewTab:true,ctrlAndMiddleDefaultNotPrevented:true,allHref:'/one-piece/?ngsw-bypass=true',queryPreserved:true,onePieceNeverRoutedViaMock:true,pinPersistsAcrossDocumentLoad:true,searchAndPersonalCategory:true,consoleWarningsOrErrorsObserved:0},
  automationAttempt:{at:'2026-10-18T13:01:28.310Z',finding:'A batched category action immediately after smooth directory scrolling activated Dashboard via the mock router. The trace is retained. After a fresh snapshot and settled scroll, the Personal category action passed. This is not counted as a category pass or established production app defect.'},
  limitations:['DEV-ONLY isolated Angular bootstrap uses the exact production NewHomeComponent and assets but a Router mock, no Firebase.','The /one-piece/ target is a clearly labelled document-navigation proof page, not the production One Piece app.','No real sign-in, deep-link auth flow, service-worker upgrade, installed PWA, physical Android, media, Cast, or deployed Hosting check was performed in this lane.','Meta/Shift modifier behavior inspected in source but not physically exercised on this Windows Chrome fixture.','This check does not renew upstream personal-hub visual acceptance or One Piece app design acceptance.'],
  cleanup:{onlyOwnBrowserTabsClosed:['1189485138','1189485139','1189485140'],viewportOverrideReset:true,oldLivePtiWorkerTabsUntouched:true,engineGpuTvMediaUntouched:true}
};
await fs.writeFile(path.join(evidence,'integration-verdict.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({passed:true,sourceStable:true,captures:captures.length,documentRequests:requests.length,cssSha256:sha(cssBytes)}));
