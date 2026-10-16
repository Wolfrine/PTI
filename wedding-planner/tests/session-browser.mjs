import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
import {chromium,expect} from '@playwright/test';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,deleteDoc} from 'firebase/firestore';
import {recordFixture} from './fixtures.mjs';

if(process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')throw Error('Explicit Auth emulator required.');
const cwd=fileURLToPath(new URL('..',import.meta.url)),origin='http://127.0.0.1:4183',evidence=resolve(cwd,'../.wedding-qa/motion-session');
const owner='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2',root=`users/${owner}/weddingData/workspace`,id='session-'+randomUUID().slice(0,8),email=id+'@example.test',eventId=id+'-event',at=new Date().toISOString();
const env=await initializeTestEnvironment({projectId:'demo-wedding-tests',firestore:{host:'127.0.0.1',port:8085,rules:await readFile(new URL('../../personal-harness/firestore.rules',import.meta.url),'utf8')}});
const require=createRequire(new URL('../../personal-functions/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth');
const admin=initializeApp({projectId:'demo-wedding-tests'},id),auth=getAuth(admin);
const member={email,name:'Synthetic remembered family',role:'family',invitedAt:at,invitedBy:owner};
const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url'),now=Math.floor(Date.now()/1000);
const token=`${encoded({alg:'none',typ:'JWT'})}.${encoded({iss:'firebase-adminsdk-test@demo-wedding-tests.iam.gserviceaccount.com',sub:'firebase-adminsdk-test@demo-wedding-tests.iam.gserviceaccount.com',aud:'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',iat:now,exp:now+3600,uid:id,claims:{email,email_verified:true,name:member.name}})}.`;
await mkdir(evidence,{recursive:true});
const profile=await mkdtemp(resolve(evidence,'browser-profile-')),results=[];
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4183','--strictPort'],{cwd,env:{...process.env,VITE_USE_EMULATORS:'1'},stdio:'pipe'});
let context,customTokenSignIns=0,createdUser=false;
async function openBrowser(){
  context=await chromium.launchPersistentContext(profile,{headless:true,viewport:{width:360,height:844},reducedMotion:'reduce',...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  context.on('request',request=>{if(request.url().includes('127.0.0.1:9099')&&request.url().includes('accounts:signInWithCustomToken'))customTokenSignIns++;});
  return context.pages()[0]||await context.newPage();
}
async function fixture(page,access){
  await page.goto(origin+'/tests/store-fixture.html');await page.waitForFunction(()=>!!window.fixture);
  if(access)await page.waitForFunction(expected=>window.fixtureState?.access===expected,access);
}
async function familyHome(page){
  await page.goto(origin+'/family/#/home');await expect(page.locator('.account-menu > summary')).toBeVisible();await expect(page.locator('.login-main')).toHaveCount(0);await expect(page.getByRole('heading',{name:'Welcome, family.',exact:true})).toBeVisible();
  await expect(page.locator('[data-action="sign-in"]')).toHaveCount(0);
}
try{
  for(let i=0;i<60;i++){try{if((await fetch(origin)).ok)break;}catch{}if(i===59)throw Error('Session test server did not start.');await pause(500);}
  await auth.createUser({uid:id,email,emailVerified:true,displayName:member.name});createdUser=true;
  const sample=(await recordFixture(owner)).events[0];
  await env.withSecurityRulesDisabled(async context=>{const db=context.firestore(),workspace=doc(db,root);if(!(await getDoc(workspace)).exists())await setDoc(workspace,{schemaVersion:1,ownerEmail:'owner@example.test',ownerUid:owner});await setDoc(doc(db,root+'/members/'+email),member);const {id:ignored,...event}=sample;await setDoc(doc(db,root+'/events/'+eventId),{...event,title:'Synthetic session check'});});
  let page=await openBrowser();await fixture(page,'signed-out');
  // Model a still-open session from the previous release, then let the new store migrate it.
  await page.evaluate(()=>window.fixture.useLegacySession());await page.evaluate(value=>window.fixture.signIn(value),token);
  await page.waitForFunction(()=>window.fixtureState?.access==='ready');
  await page.reload();await page.waitForFunction(()=>window.fixtureState?.access==='ready');
  assert.equal(await page.evaluate(()=>window.fixtureState.user.uid),id);await context.close();context=undefined;
  page=await openBrowser();await fixture(page,'ready');assert.equal(await page.evaluate(()=>window.fixtureState.user.uid),id);
  results.push('An open legacy session migrates to persistent Auth; an actual closed/reopened Chromium process restores it without another sign-in.');
  await familyHome(page);
  for(const width of[1440,360]){
    await page.setViewportSize({width,height:width===1440?1000:844});const invitation=page.locator('a.invitation-link[href="/"]').first();await expect(invitation).toBeVisible();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:resolve(evidence,'authenticated-navigation-'+width+'.png'),fullPage:true});
    await invitation.click();await expect(page.locator('#couple-names')).toContainText('Mahima Mishra');await page.locator('a.family-access').click();await expect(page.locator('.account-menu > summary')).toBeVisible();await expect(page.getByRole('heading',{name:'Welcome, family.',exact:true})).toBeVisible();
  }
  results.push('Authenticated desktop/mobile Invitation→public landing→Family round trip opens the approved plan without another Google sign-in.');
  await context.close();context=undefined;
  await env.withSecurityRulesDisabled(async context=>deleteDoc(doc(context.firestore(),root+'/members/'+email)));
  page=await openBrowser();await fixture(page,'pending');assert.equal(await page.evaluate(()=>window.fixtureState.user.uid),id);assert.equal(await page.evaluate(()=>window.fixtureState.records.events.length),0);
  await page.goto(origin+'/family/');await expect(page.getByText('Awaiting approval',{exact:true})).toBeVisible();await expect(page.locator('[data-action="sign-in"]')).toHaveCount(0);await expect(page.locator('[data-edit], [data-add]')).toHaveCount(0);
  await env.withSecurityRulesDisabled(async context=>setDoc(doc(context.firestore(),root+'/members/'+email),member));await expect(page.locator('.account-menu > summary')).toBeVisible();await expect(page.getByRole('heading',{name:'Welcome, family.',exact:true})).toBeVisible();
  results.push('Restored identity still checks current membership: revoked access restores as pending with no private records, and reapproval works without another sign-in.');
  const other=await context.newPage();await familyHome(other);await other.goto(origin+'/family/#/tasks');await other.locator('[data-add="decisions"]').click();await other.locator('dialog [name="title"]').fill('Synthetic private sign-out draft');
  await page.locator('.account-menu > summary').click();await page.locator('[data-action="sign-out"]').click();
  for(const tab of[page,other]){await expect(tab.getByRole('button',{name:/Continue with Google/})).toBeVisible();await expect(tab.locator('dialog[open]')).toHaveCount(0);await expect(tab.locator('body')).not.toContainText('Synthetic private sign-out draft');await expect(tab.locator('.account-menu')).toHaveCount(0);}
  await context.close();context=undefined;page=await openBrowser();await fixture(page,'signed-out');assert.equal(await page.evaluate(()=>window.fixtureState.user),null);
  await page.goto(origin+'/family/');await expect(page.getByRole('button',{name:/Continue with Google/})).toBeVisible();
  assert.equal(customTokenSignIns,1,'Restoration and navigation must not submit a fresh sign-in.');
  results.push('Manual sign-out clears both open tabs/private editor and survives another full browser restart; exactly one initial emulator sign-in was used.');
  // Also keep the just-migrated legacy document open: its SDK listener began on session storage.
  await fixture(page,'signed-out');await page.evaluate(()=>window.fixture.useLegacySession());await page.evaluate(value=>window.fixture.signIn(value),token);await page.waitForFunction(()=>window.fixtureState?.access==='ready');
  await page.reload();await page.waitForFunction(()=>window.fixtureState?.access==='ready');
  const migratedOther=await context.newPage();await familyHome(migratedOther);await migratedOther.locator('.account-menu > summary').click();await migratedOther.locator('[data-action="sign-out"]').click();
  await page.waitForFunction(()=>window.fixtureState?.access==='signed-out',null,{timeout:5000});assert.equal(await page.evaluate(()=>window.fixtureState.records.events.length),0);
  await expect(migratedOther.getByRole('button',{name:/Continue with Google/})).toBeVisible();assert.equal(customTokenSignIns,2,'Only the two deliberate test sign-ins are allowed.');
  results.push('A still-open document migrating legacy session storage also clears when another tab manually signs out. The second sign-in deliberately sets up this separate migration regression.');
  await writeFile(resolve(evidence,'session-results.json'),JSON.stringify({checkedAt:new Date().toISOString(),results,customTokenSignIns,browser:'Actual persistent Chromium profile across process restarts',backend:'Firebase Auth/Firestore emulators; synthetic account and private record only',limits:'Google popup and physical installed-app restart are not exercised; browser storage and Firebase credential validity still apply.'},null,2));
  console.log('PASS '+results.length+' persistent-session and authenticated invitation journeys');
}catch(error){
  for(const tab of context?.pages()||[])console.error('Session failure state',tab.url(),await tab.locator('body').innerText());
  throw error;
}finally{
  await context?.close();server.kill();
  await env.withSecurityRulesDisabled(async context=>{const db=context.firestore();for(const path of['members/'+email,'accessRequests/'+id,'events/'+eventId])await deleteDoc(doc(db,root+'/'+path));});
  if(createdUser)await auth.deleteUser(id);await env.cleanup();await deleteApp(admin);
  const target=resolve(profile);if(!target.startsWith(resolve(evidence)+sep)||!target.split(sep).at(-1).startsWith('browser-profile-'))throw Error('Unsafe test profile cleanup target');
  await rm(target,{recursive:true,force:true});
}
