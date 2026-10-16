// Synthetic mechanism only: validates the evaluator, not an experience concept.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const runner = fileURLToPath(new URL('../run.mjs', import.meta.url));
const adapter = `import assert from 'node:assert/strict';
export default {
  name: 'Synthetic evaluator fixture', outcomes: { a: 'output A', b: 'output B' },
  async ready(p) { await p.locator('output').waitFor({state:'visible'}); },
  async assertInitial(p) { assert.equal(await p.locator('output').textContent(), 'initial'); },
  async act(p, { input, variant }) { await this.press(p, input, variant.toUpperCase()); },
  async press(p, input, label) {
    if(input === 'keyboard') {
      for(let i=0;i<5;i++) {
        await p.keyboard.press('Tab');
        if(await p.evaluate(() => document.activeElement.textContent) === label) {
          await p.keyboard.press('Enter'); return;
        }
      }
      throw new Error('normal keyboard focus could not reach control');
    }
    const control = p.getByRole('button', { name: label, exact: true });
    if(input === 'touch') await control.tap(); else await control.click();
  },
  async assertOutcome(p, {variant}) { assert.equal(await p.locator('output').textContent(), variant.toUpperCase()); },
  async recover(p, {input}) { await this.press(p, input, 'Reset'); }
};`;

function run(url, adapterPath, dir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runner, url, adapterPath, dir], { cwd: dirname(runner), timeout: 180000 });
    let log = '';
    child.stdout.on('data', x => { log += x; process.stdout.write(x); });
    child.stderr.on('data', x => { log += x; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, log }));
  });
}

test('browser runner passes a working mechanism and catches overflow, wrong outcomes and runtime errors', { timeout: 240000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'visual-evals-'));
  const server = createServer((req, res) => {
    if (req.url === '/missing') { res.writeHead(404); res.end('deliberately missing'); return; }
    const bad = req.url.includes('broken');
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Evaluator fixture</title><style>output{display:block;min-width:60px;min-height:30px}button{width:64px;height:40px}</style></head><body>
      <p>Synthetic evaluator fixture</p><button>A</button><button>B</button><button>Reset</button><output>initial</output>
      <script>for(const b of document.querySelectorAll('button')) b.onclick=()=>{
        document.querySelector('output').textContent=b.textContent==='Reset'?'initial':${bad ? "'wrong'" : 'b.textContent'};
      };${bad ? "console.error('fixture runtime failure');document.body.style.width='3000px';fetch('/missing');" : ''}</script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const adapterPath = join(dir, 'scenario.mjs');
    await writeFile(adapterPath, adapter);
    const git = args => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
    git(['init']); git(['add', 'scenario.mjs']);
    git(['-c', 'user.name=Eval Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Synthetic fixture']);
    const url = `http://127.0.0.1:${server.address().port}`;
    const goodDir = join(dir, 'good'), badDir = join(dir, 'bad');
    const good = await run(url, adapterPath, goodDir);
    const goodReport = JSON.parse(await readFile(join(goodDir, 'report.json')));
    assert.equal(good.code, 0, good.log + JSON.stringify(goodReport.checks.filter(c => c.status !== 'pass')));
    assert.equal(goodReport.automatedVerdict, 'pass');
    assert.equal(goodReport.humanReview, 'not_run');
    assert.equal(Object.keys(goodReport.trials).length, 2);
    assert(Object.keys(goodReport.evidenceSHA256).some(p => p.endsWith('.webm')));
    assert(goodReport.checks.some(c => c.id === 'reduced-keyboard/A2-A3' && c.status === 'pass'));
    const bad = await run(`${url}/broken`, adapterPath, badDir);
    assert.equal(bad.code, 1, bad.log);
    const badReport = JSON.parse(await readFile(join(badDir, 'report.json')));
    assert.equal(badReport.automatedVerdict, 'fail');
    assert(badReport.checks.some(c => /overflow/.test(c.reason ?? '')));
    assert(badReport.checks.some(c => c.errors?.some(e => e.message === 'fixture runtime failure')));
    assert(badReport.checks.some(c => c.errors?.some(e => e.status === 404)));
    assert(badReport.checks.some(c => c.id.includes('A4-trial') && c.status === 'fail'));
    assert(badReport.checks.some(c => c.id.includes('A4-budget') && c.status === 'blocked'));
    const overwritten = await run(url, adapterPath, goodDir);
    assert.equal(overwritten.code, 2, 'Existing evidence must not be overwritten');
    const placeholder = await run(url, fileURLToPath(new URL('../scenario.template.mjs', import.meta.url)), join(dir, 'placeholder'));
    assert.equal(placeholder.code, 2, 'Unimplemented scenario must not pass');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
