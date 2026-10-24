import path from 'node:path';
import { DEFAULT_ROOT, VERSION } from './config.mjs';
import { resolveCodex, collect } from './rpc.mjs';
import { normalizeRateLimits, normalizeDaily, fingerprint, accountIdFingerprint, safeCode } from './core.mjs';
import { setup } from './setup.mjs';
import { runOnce } from './monitor.mjs';
import { readJson } from './store.mjs';

const command = process.argv[2] || 'status';
const rootIndex = process.argv.indexOf('--root');
const root = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : path.join(DEFAULT_ROOT, 'data');
try {
  if (command === 'probe' || command === 'setup') {
    const binary = await resolveCodex(); const results = await collect(binary.executable);
    if (command === 'setup') {
      await setup(root, { fingerprint: fingerprint(results.account, results.allowanceResult), accountIdFingerprint: accountIdFingerprint(results.allowanceResult) });
      console.log(JSON.stringify({ outcome: 'paired', credentialProtection: 'windows-dpapi-current-user' }));
    } else console.log(JSON.stringify({ source: 'real-account-readings', version: binary.version,
      allowance: results.allowanceError ? { status: safeCode(results.allowanceError) } : normalizeRateLimits(results.allowanceResult),
      daily: results.dailyError ? { status: safeCode(results.dailyError) } : { latest: normalizeDaily(results.dailyResult).latest, reportedDays: results.dailyResult?.dailyUsageBuckets?.length || 0 } }, null, 2));
  } else if (command === 'run') {
    console.log(JSON.stringify(await runOnce({ root })));
  } else if (command === 'status') {
    const state = await readJson(path.join(root, 'runtime.json'), {});
    console.log(JSON.stringify({ version: VERSION, publishedAt: state.publishedAt || null,
      lastAttemptAt: state.lastSnapshot?.lastAttemptAt || null, allowance: state.lastSnapshot?.allowance.status || 'not-connected',
      daily: state.lastSnapshot?.daily.status || 'not-connected', pending: !!state.pending,
      recentEvents: (await readJson(path.join(root, 'events.json'), [])).slice(-5) }, null, 2));
  } else throw new Error('Use probe, setup, run or status.');
} catch (error) { console.error(JSON.stringify({ outcome: 'failed', code: safeCode(error) })); process.exitCode = 1; }
// End short-lived SDK/network handles as well as work after the overall deadline.
if (command === 'run' || command === 'setup') process.exit(process.exitCode || 0);
