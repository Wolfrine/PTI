import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The only project accepted here is deliberately a demo project, never PTI live.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const cli = fileURLToPath(new URL('../node_modules/firebase-tools/lib/bin/firebase.js', import.meta.url));
const command = 'node --test apps/one-piece/tests/rules.test.mjs wedding-planner/tests/rules.test.mjs venture-lab/tests/rules.test.mjs tools/codex-usage-monitor/test/rules.mjs';
const child = spawn(process.execPath, [cli, 'emulators:exec', '--only', 'firestore', '--project', 'demo-one-piece-tests', '--config', 'firebase.one-piece-tests.json', command], {
  cwd: root, stdio: 'inherit', env: { ...process.env, JAVA_TOOL_OPTIONS: '-Duser.language=en' }
});
child.on('exit', code => { process.exitCode = code ?? 1; });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
