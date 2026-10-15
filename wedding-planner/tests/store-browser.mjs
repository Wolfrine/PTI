import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,deleteDoc} from 'firebase/firestore';
const cwd=fileURLToPath(new URL('..',import.meta.url)),origin='http://127.0.0.1:4181';
const owner='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2',root=`users/${owner}/weddingData/workspace`,at='2026-10-15T10:00:00Z';
const env=await initializeTestEnvironment({projectId:'demo-wedding-tests',firestore:{host:'127.0.0.1',port:8085,rules:await readFile(new URL('../../personal-harness/firestore.rules',import.meta.url),'utf8')}});
if(process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')throw Error('Auth emulator must be explicitly configured.');
const require=createRequire(new URL('../../personal-functions/package.json',import.meta.url));
const {initializeApp:initializeAdmin,deleteApp:deleteAdmin}=require('firebase-admin/app');
const {getAuth:getAdminAuth}=require('firebase-admin/auth');
const admin=initializeAdmin({projectId:'demo-wedding-tests'},'wedding-store-tests');
const token=(uid,email)=>{const encoded=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),now=Math.floor(Date.now()/1000);return `${encoded({alg:'none',typ:'JWT'})}.${encoded({iss:'firebase-adminsdk-test@demo-wedding-tests.iam.gserviceaccount.com',sub:'firebase-adminsdk-test@demo-wedding-tests.iam.gserviceaccount.com',aud:'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',iat:now,exp:now+3600,uid,claims:{email,email_verified:true,name:'Synthetic test account'}})}.`;};
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4181','--strictPort'],{cwd,env:{...process.env,VITE_USE_EMULATORS:'1'},stdio:'pipe'});let browser;
try {
 for(let i=0;i<60;i++){try{if((await fetch(origin)).ok)break;}catch{}await pause(500);if(i===59)throw Error('Emulator fixture dev server did not start.');}
 await env.withSecurityRulesDisabled(async context=>{const db=context.firestore();await setDoc(doc(db,root),{schemaVersion:1});await setDoc(doc(db,root+'/members/member@example.test'),{email:'member@example.test',name:'Synthetic member',role:'editor',invitedAt:at,invitedBy:owner});});
 for(const [uid,email] of [[owner,'owner@example.test'],['member','member@example.test']])await getAdminAuth(admin).createUser({uid,email,emailVerified:true,displayName:'Synthetic test account'});
 browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
 const a=await browser.newContext(),b=await browser.newContext(),pageA=await a.newPage(),pageB=await b.newPage();
 async function login(page,uid,email){await page.goto(origin+'/tests/store-fixture.html');await page.waitForFunction(()=>!!window.fixture);await page.evaluate(t=>window.fixture.signIn(t),token(uid,email));try{await page.waitForFunction(()=>window.fixtureState?.access==='ready');}catch{throw Error('Store login did not become ready: '+await page.evaluate(()=>JSON.stringify(window.fixtureState)));}}
 await login(pageA,owner,'owner@example.test');await login(pageB,'member','member@example.test');
 const id=await pageA.evaluate(()=>window.fixture.store.save('decisions',{title:'Synthetic shared decision',proposal:'Discuss arrival',status:'unresolved'}));
 await pageB.waitForFunction(id=>window.fixtureState.records.decisions.some(d=>d.id===id),id);
 const revision=await pageB.evaluate(id=>window.fixtureState.records.decisions.find(d=>d.id===id).revision,id);
 await pageA.evaluate(({id,revision})=>window.fixture.store.save('decisions',{title:'Owner revision',proposal:'Discuss arrival',status:'unresolved'},id,revision),{id,revision});
 const conflict=await pageB.evaluate(async({id,revision})=>{try{await window.fixture.store.save('decisions',{title:'Stale overwrite',status:'unresolved'},id,revision);return false;}catch(error){return /updated/.test(error.message);}},{id,revision});assert.equal(conflict,true,'A competing editor must see a conflict.');
 await pageA.evaluate(({id,revision})=>window.fixture.store.archive('decisions',id,revision+1),{id,revision});
 const exported=JSON.parse(await pageA.evaluate(()=>window.fixture.store.exportData()));assert.ok(exported.decisions.find(d=>d.id===id)?.archived);assert.equal(exported.history.filter(h=>h.recordId===id).length,3);
 // An actual family editor stays open while membership is revoked; no focus event or data change is needed.
 await pageB.goto(origin+'/family/');await pageB.getByRole('heading',{name:'Making it a celebration.'}).waitFor();
 await pageB.locator('[data-add="decisions"]').click();await pageB.locator('dialog [name="title"]').fill('Private unsaved text');
 await env.withSecurityRulesDisabled(async context=>deleteDoc(doc(context.firestore(),root+'/members/member@example.test')));
 await pageB.getByRole('heading',{name:/A little planning/}).waitFor({timeout:10000});
 assert.equal(await pageB.locator('dialog[open]').count(),0);assert.equal(await pageB.locator('dialog').textContent(),'');assert.ok(!(await pageB.locator('body').textContent()).includes('Private unsaved text'));
 for(const width of [1440,390]){await pageB.setViewportSize({width,height:900});await pageB.screenshot({path:`${cwd}/design/cycle5-denied-${width}.png`,fullPage:true});}
 // Signing out immediately clears a second open private editor as well.
 await pageA.goto(origin+'/family/');await pageA.getByRole('heading',{name:'Making it a celebration.'}).waitFor();
 await pageA.locator('[data-add="decisions"]').click();await pageA.locator('dialog [name="title"]').fill('Owner private draft');await pageA.locator('dialog [data-close]').first().click();
 await pageA.locator('.account-menu > summary').click();await pageA.locator('[data-action="sign-out"]').click();await pageA.getByRole('heading',{name:/A little planning/}).waitFor();assert.ok(!(await pageA.locator('body').textContent()).includes('Owner private draft'));
 await mkdir('.wedding-qa',{recursive:true});await writeFile('.wedding-qa/store-integration.json',JSON.stringify({status:'pass',checks:['two-account collaboration','competing-revision conflict','export includes archive and history','focused open-editor revocation clears private UI','sign-out clears private UI'],backend:'Firebase Auth + Firestore emulators; synthetic data only'},null,2));
 console.log('PASS emulator-backed store/browser: collaboration, conflicts, archive export, active revocation, sign-out.');
} finally {if(browser)await browser.close();server.kill();await env.cleanup();await deleteAdmin(admin);}
