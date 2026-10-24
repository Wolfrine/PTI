import { readFile, access } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = new URL('../../../', import.meta.url);
const read = file => readFile(new URL(file, root), 'utf8');
for (const file of ['README.md', 'AGENTS.md']) {
  const text = await read(file);
  assert(text.includes('/home') && text.includes('retirement archive'), `${file} must identify Home and the archive`);
  assert(!/PTI is the CEO COE|canonical ecosystem registry and refresh rules live/i.test(text), `${file} revives retired active instructions`);
}
const home = await read('pti-app/src/app/components/new-home/new-home.component.ts');
assert(!/id:\s*'(pti-dashboard|ceo-command)'/.test(home), 'Retired apps must not reappear in the curated directory');
const routes = await read('pti-app/src/app/app.routes.ts');
assert(!/import.*(?:DashboardComponent|NewCodexCommandComponent|CodexProjectDetailComponent)/.test(routes), 'Retired UI must not be imported');
const design = await read('pti-app/design/home-direction-2026-10-18.md');
assert(design.slice(0, 1000).includes('Historical design record, superseded'), 'Historical design directions need a visible current-contract pointer');
await access(new URL('docs/archive/retired-dashboards.md', root));
console.log('PASS current dashboard contract: Home, active navigation, retired routes and historical guidance');
