import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium, expect } from '@playwright/test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { recordFixture } from './fixtures.mjs';
const cwd = fileURLToPath(new URL('..', import.meta.url)),
  origin = 'http://127.0.0.1:4181';
const owner = '5PbKbpGf3AbarNrp6pyqJ5C5Ziu2',
  root = `users/${owner}/weddingData/workspace`,
  at = '2026-10-15T10:00:00Z';
const env = await initializeTestEnvironment({
  projectId: 'demo-wedding-tests',
  firestore: {
    host: '127.0.0.1',
    port: 8085,
    rules: await readFile(
      new URL('../../personal-harness/firestore.rules', import.meta.url),
      'utf8',
    ),
  },
});
if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099')
  throw Error('Auth emulator must be explicitly configured.');
const require = createRequire(
  new URL('../../personal-functions/package.json', import.meta.url),
);
const {
  initializeApp: initializeAdmin,
  deleteApp: deleteAdmin,
} = require('firebase-admin/app');
const { getAuth: getAdminAuth } = require('firebase-admin/auth');
const admin = initializeAdmin(
  { projectId: 'demo-wedding-tests' },
  'wedding-store-tests',
);
const token = (uid, email) => {
  const encoded = (v) => Buffer.from(JSON.stringify(v)).toString('base64url'),
    now = Math.floor(Date.now() / 1000);
  return `${encoded({ alg: 'none', typ: 'JWT' })}.${encoded({ iss: 'firebase-adminsdk-test@demo-wedding-tests.iam.gserviceaccount.com', sub: 'firebase-adminsdk-test@demo-wedding-tests.iam.gserviceaccount.com', aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit', iat: now, exp: now + 3600, uid, claims: { email, email_verified: true, name: 'Synthetic test account' } })}.`;
};
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    '--host',
    '127.0.0.1',
    '--port',
    '4181',
    '--strictPort',
  ],
  { cwd, env: { ...process.env, VITE_USE_EMULATORS: '1' }, stdio: 'pipe' },
);
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    await pause(500);
    if (i === 59) throw Error('Emulator fixture dev server did not start.');
  }
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, root), { schemaVersion: 1, ownerEmail: 'owner@example.test' });
    await setDoc(doc(db, root + '/members/owner@example.test'), {
      email: 'owner@example.test', name: 'Workspace owner', role: 'admin', invitedAt: at, invitedBy: owner,
    });
    await setDoc(doc(db, root + '/members/member@example.test'), {
      email: 'member@example.test',
      name: 'Synthetic member',
      role: 'editor',
      invitedAt: at,
      invitedBy: owner,
    });
  });
  const fixture = await recordFixture(owner);
  await env.withSecurityRulesDisabled(async (context) => {
    for (const [name, records] of Object.entries(fixture))
      for (const { id, ...data } of records)
        await setDoc(doc(context.firestore(), `${root}/${name}/${id}`), data);
  });
  for (const [uid, email] of [
    [owner, 'owner@example.test'],
    ['member', 'member@example.test'],
    ['new-family', 'new-family@example.test'],
  ])
    await getAdminAuth(admin).createUser({
      uid,
      email,
      emailVerified: true,
      displayName: 'Synthetic test account',
    });
  browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  );
  const a = await browser.newContext(),
    b = await browser.newContext(),
    pageA = await a.newPage(),
    pageB = await b.newPage();
  async function login(page, uid, email, expectedAccess = 'ready') {
    await page.goto(origin + '/tests/store-fixture.html');
    await page.waitForFunction(() => !!window.fixture);
    await page.evaluate((t) => window.fixture.signIn(t), token(uid, email));
    try {
      await page.waitForFunction((access) => window.fixtureState?.access === access, expectedAccess);
    } catch {
      throw Error(
        'Store login did not become ready: ' +
          (await page.evaluate(() => JSON.stringify(window.fixtureState))),
      );
    }
  }
  await login(pageA, owner, 'owner@example.test');
  await login(pageB, 'member', 'member@example.test');
  await pageA.evaluate(() => window.fixture.store.assignRole('member@example.test', 'viewer', 'editor'));
  await pageB.waitForFunction(() => window.fixtureState.role === 'viewer' && window.fixtureState.access === 'ready');
  const staleRole = await pageA.evaluate(async () => {
    try { await window.fixture.store.assignRole('member@example.test', 'admin', 'family'); return false; }
    catch (error) { return /role changed/.test(error.message); }
  });
  assert.equal(staleRole, true, 'A stale role choice cannot overwrite another assignment.');
  await pageA.evaluate(() => window.fixture.store.assignRole('member@example.test', 'family', 'viewer'));
  await pageB.waitForFunction(() => window.fixtureState.role === 'family' && window.fixtureState.access === 'ready');
  const id = await pageA.evaluate(() =>
    window.fixture.store.save('decisions', {
      title: 'Synthetic shared decision',
      proposal: 'Discuss arrival',
      status: 'unresolved',
    }),
  );
  await pageB.waitForFunction(
    (id) => window.fixtureState.records.decisions.some((d) => d.id === id),
    id,
  );
  const revision = await pageB.evaluate(
    (id) =>
      window.fixtureState.records.decisions.find((d) => d.id === id).revision,
    id,
  );
  await pageA.evaluate(
    ({ id, revision }) =>
      window.fixture.store.save(
        'decisions',
        {
          title: 'Owner revision',
          proposal: 'Discuss arrival',
          status: 'unresolved',
        },
        id,
        revision,
      ),
    { id, revision },
  );
  const conflict = await pageB.evaluate(
    async ({ id, revision }) => {
      try {
        await window.fixture.store.save(
          'decisions',
          { title: 'Stale overwrite', status: 'unresolved' },
          id,
          revision,
        );
        return false;
      } catch (error) {
        return /updated/.test(error.message);
      }
    },
    { id, revision },
  );
  assert.equal(conflict, true, 'A competing editor must see a conflict.');
  await pageA.evaluate(
    ({ id, revision }) =>
      window.fixture.store.archive('decisions', id, revision + 1),
    { id, revision },
  );
  const exported = JSON.parse(
    await pageA.evaluate(() => window.fixture.store.exportData()),
  );
  assert.ok(exported.decisions.find((d) => d.id === id)?.archived);
  assert.equal(exported.history.filter((h) => h.recordId === id).length, 3);
  // Save through the actual focused editor, observe it from another account, and verify every hidden field survives.
  await pageB.goto(origin + '/family/#/catering/18-1');
  await pageB.locator('[data-edit="events"][data-section="menu"]').waitFor();
  await pageB.locator('[data-edit="events"][data-section="menu"]').click();
  assert.equal(await pageB.locator('dialog [name="venue"]').count(), 0);
  await pageB
    .locator('dialog [name="menuText"]')
    .fill('Synthetic emulator menu edit');
  await pageB.locator('dialog button[type="submit"]').click();
  await pageB.locator('dialog').waitFor({ state: 'hidden' });
  await pageA.waitForFunction(
    () =>
      window.fixtureState.records.events.find((e) => e.id === '18-1')
        ?.revision === 2,
  );
  const persisted = await pageA.evaluate(() =>
    window.fixtureState.records.events.find((e) => e.id === '18-1'),
  );
  for (const key of Object.keys(fixture.events[0]).filter(
    (k) =>
      ![
        'menuText',
        'revision',
        'updatedAt',
        'updatedBy',
        'lastChangeId',
      ].includes(k),
  ))
    assert.deepEqual(
      persisted[key],
      fixture.events[0][key],
      `Focused menu save must preserve ${key}`,
    );
  assert.equal(persisted.menuText, 'Synthetic emulator menu edit');
  // A competing live update must not silently replace the draft or permit a stale focused save.
  await pageB.locator('[data-edit="events"][data-section="menu"]').click();
  await pageB
    .locator('dialog [name="menuText"]')
    .fill('Synthetic stale member draft');
  await pageA.evaluate(() => {
    const record = window.fixtureState.records.events.find(
      (e) => e.id === '18-1',
    );
    return window.fixture.store.save(
      'events',
      { ...record, title: 'Synthetic owner concurrent title' },
      record.id,
      record.revision,
    );
  });
  await pageA.waitForFunction(
    () =>
      window.fixtureState.records.events.find((e) => e.id === '18-1')
        ?.revision === 3,
  );
  await pageB.locator('dialog button[type="submit"]').click();
  await expect(pageB.locator('#form-error')).toContainText(/updated|changed/i);
  assert.equal(
    await pageB.locator('dialog [name="menuText"]').inputValue(),
    'Synthetic stale member draft',
  );
  await pageB.locator('dialog [data-close]').first().click();
  // Cancelling a conflict must permit a fresh edit using the latest record revision.
  await pageB.locator('[data-edit="events"][data-section="menu"]').click();
  await expect(pageB.locator('dialog [name="menuText"]')).toHaveValue(
    'Synthetic emulator menu edit',
  );
  await pageB
    .locator('dialog [name="menuText"]')
    .fill('Synthetic recovered member edit');
  await pageB.locator('dialog button[type="submit"]').click();
  await pageB.locator('dialog').waitFor({ state: 'hidden' });
  await pageA.waitForFunction(
    () =>
      window.fixtureState.records.events.find((e) => e.id === '18-1')
        ?.revision === 4,
  );
  const recovered = await pageA.evaluate(() =>
    window.fixtureState.records.events.find((e) => e.id === '18-1'),
  );
  assert.equal(recovered.title, 'Synthetic owner concurrent title');
  assert.equal(recovered.menuText, 'Synthetic recovered member edit');
  // An actual family editor stays open while membership is revoked; no focus event or data change is needed.
  await pageB.goto(origin + '/family/#/tasks');
  await pageB.locator('[data-add="decisions"]').waitFor();
  await pageB.locator('[data-add="decisions"]').click();
  await pageB.locator('dialog [name="title"]').fill('Private unsaved text');
  await env.withSecurityRulesDisabled(async (context) =>
    deleteDoc(doc(context.firestore(), root + '/members/member@example.test')),
  );
  await pageB.getByText('Awaiting approval', { exact: true }).waitFor({ timeout: 10000 });
  assert.equal(await pageB.locator('dialog[open]').count(), 0);
  assert.equal(await pageB.locator('dialog').textContent(), '');
  assert.equal(await pageB.locator('#toast').textContent(), '');
  await expect(pageB.locator('#toast')).toHaveCSS('opacity', '0');
  assert.ok(
    !(await pageB.locator('body').textContent()).includes(
      'Private unsaved text',
    ),
  );
  await mkdir('.wedding-qa/session-access', { recursive: true });
  for (const width of [1440, 390]) {
    await pageB.setViewportSize({ width, height: 900 });
    await pageB.screenshot({
      path: `${cwd}/design/countdown-access/auth-pending-${width}.png`,
      fullPage: true,
    });
  }
  // New verified sign-ins register automatically without gaining private access.
  const c = await browser.newContext(), pageC = await c.newPage();
  await login(pageC, 'new-family', 'new-family@example.test', 'pending');
  assert.equal(await pageC.evaluate(() => window.fixtureState.records.events.length), 0);
  await pageC.goto(origin + '/family/');
  await pageC.getByText('Awaiting approval', { exact: true }).waitFor();
  await pageA.goto(origin + '/family/#/access');
  const ownerRow = pageA.locator('[data-access-email="owner@example.test"]');
  await expect(ownerRow).toContainText('Admin');
  assert.equal(await ownerRow.locator('select').count(), 0, 'Owner role is protected.');
  const row = pageA.locator('[data-access-email="new-family@example.test"]');
  await expect(row).toContainText('Awaiting approval');
  async function assign(email, role, currentRole) {
    const account = pageA.locator(`[data-access-email="${email}"]`);
    await account.locator('[data-role-email]').selectOption(role);
    await account.locator('[data-role-save]').click();
    await expect(account.locator('[data-role-save]')).toBeDisabled();
    if (currentRole) await expect(account.locator('.role-label')).toHaveText(currentRole);
  }
  await assign('new-family@example.test', 'viewer', 'Viewer');
  await pageC.getByText('Viewer access', { exact: true }).waitFor();
  assert.equal(await pageC.locator('[data-add], [data-edit]').count(), 0);
  await pageC.goto(origin + '/family/#/catering/18-1');
  await expect(pageC.locator('body')).toContainText('Synthetic recovered member edit');
  assert.equal(await pageC.locator('[data-edit]').count(), 0);
  await pageC.goto(origin + '/family/#/access');
  await expect(pageC.locator('h2')).toContainText('Admins manage family access.');
  assert.equal(await pageC.locator('[data-access-email]').count(), 0);
  await assign('new-family@example.test', 'family', 'Family');
  await pageC.goto(origin + '/family/#/tasks');
  await pageC.locator('[data-add="decisions"]').waitFor();
  await pageC.locator('[data-add="decisions"]').click();
  await pageC.locator('dialog [name="title"]').fill('Downgraded private draft');
  await assign('new-family@example.test', 'viewer', 'Viewer');
  await pageC.getByText('Viewer access', { exact: true }).waitFor();
  assert.equal(await pageC.locator('dialog[open]').count(), 0, 'Downgrade closes open editor.');
  assert.ok(!(await pageC.locator('body').textContent()).includes('Downgraded private draft'));
  await assign('new-family@example.test', 'admin', 'Admin');
  await pageC.goto(origin + '/family/#/access');
  await pageC.locator('[data-access-email="member@example.test"]').waitFor();
  await expect(pageC.locator('[data-access-email="owner@example.test"]')).toContainText('Admin');
  assert.equal(await pageC.locator('[data-access-email="owner@example.test"] select').count(), 0);
  await assign('new-family@example.test', 'blocked', 'Blocked');
  await pageC.getByRole('heading', { name: 'Family access is paused.', exact: true }).waitFor();
  assert.equal(await pageC.locator('[data-access-email], [data-edit], [data-add]').count(), 0);
  await assign('new-family@example.test', 'pending', 'Awaiting approval');
  await pageC.getByText('Awaiting approval', { exact: true }).waitFor();
  // An already-open pending session gains access when approved again.
  await assign('member@example.test', 'family', 'Family');
  await pageB.locator('[data-add="decisions"]').waitFor();
  for (const width of [1440, 390]) {
    await pageA.setViewportSize({ width, height: 900 });
    await pageA.screenshot({ path: `.wedding-qa/session-access/auth-access-${width}.png`, fullPage: true });
  }
  // Signing out immediately clears a second open private editor as well.
  await pageA.goto(origin + '/family/#/tasks');
  await pageA.locator('[data-add="decisions"]').waitFor();
  await pageA.locator('[data-add="decisions"]').click();
  await pageA.locator('dialog [name="title"]').fill('Owner private draft');
  await pageA.locator('dialog [data-close]').first().click();
  await pageA.locator('.account-menu > summary').click();
  await pageA.locator('[data-action="sign-out"]').click();
  await pageA.getByRole('button', { name: /Google/ }).waitFor();
  assert.ok(
    !(await pageA.locator('body').textContent()).includes(
      'Owner private draft',
    ),
  );
  await mkdir('.wedding-qa', { recursive: true });
  await writeFile(
    '.wedding-qa/store-integration.json',
    JSON.stringify(
      {
        status: 'pass',
        checks: [
          'two-account collaboration',
          'legacy Editor role normalizes to Family and stale role changes are rejected',
          'competing-revision conflict',
          'export includes archive and history',
          'actual focused menu save preserves hidden fields',
          'actual focused edit rejects a competing live revision without losing draft',
          'focused open-editor revocation clears private UI',
          'verified sign-in automatically registers a pending account',
          'admin UI role assignment updates already-open sessions',
          'Viewer hides writes and cannot open access management',
          'Family downgrade clears the open private editor',
          'Admin can manage roles; owner Admin is protected',
          'Blocked then Pending removes private data; reapproval restores access',
          'sign-out clears private UI',
        ],
        backend:
          'Firebase Auth + Firestore emulators; synthetic test copy only',
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS emulator-backed store/browser: collaboration, conflicts, archive export, active revocation, sign-out.',
  );
} finally {
  if (browser) await browser.close();
  server.kill();
  await env.cleanup();
  await deleteAdmin(admin);
}
