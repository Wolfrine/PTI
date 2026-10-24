// A separate process with synthetic dependencies; never contacts Codex or Firebase.
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { runOnce } from '../../src/monitor.mjs';
import { fingerprint } from '../../src/core.mjs';
const root = process.argv[2];
const account = { type: 'chatgpt', email: 'synthetic@example.test' };
const result = { account, allowanceResult: { rateLimits: { primary: { usedPercent: 3, windowDurationMins: 10080, resetsAt: 1893456000 } } },
  dailyResult: { dailyUsageBuckets: [{ startDate: '2026-10-23', tokens: 100 }] } };
const credential = { codexFingerprint: fingerprint(account, result.allowanceResult), refreshToken: 'synthetic-refresh-token', privacyVerifiedAt: '2026-10-24T00:00:00Z' };
const outcome = await runOnce({ root, credentials: { initialize: async () => {}, load: async () => credential, save: async () => {} },
  resolve: async () => ({ executable: 'synthetic-codex.exe', version: 'synthetic1' }), read: async () => result,
  refresh: async () => ({ idToken: 'synthetic-id-token', refreshToken: credential.refreshToken }),
  write: async (_token, data) => writeFile(path.join(root, 'synthetic-cloud-write.json'), JSON.stringify(data)),
});
console.log(JSON.stringify(outcome));
