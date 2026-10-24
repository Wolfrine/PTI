import path from 'node:path';
import { CredentialStore, refreshSession, publish } from './credentials.mjs';
import { readJson, atomicJson, acquireLease, logEvent } from './store.mjs';
import { collect, resolveCodex } from './rpc.mjs';
import { createSnapshot, fingerprint, accountIdFingerprint, shouldPublish, retry, safeCode, MonitorError } from './core.mjs';

export async function runOnce({ root, credentials = new CredentialStore(root), resolve = resolveCodex, read = collect,
  refresh = refreshSession, write = publish, now = () => new Date().toISOString(), deadlineMs = 150_000 } = {}) {
  await credentials.initialize();
  const lease = await acquireLease(root); if (!lease) return { outcome: 'already-running' };
  const file = path.join(root, 'runtime.json'); let server; let timeout; let expired = false;
  const active = () => { if (expired) throw new MonitorError('run-timeout'); };
  try {
    return await Promise.race([(async () => {
      const credential = await credentials.load();
      active();
      if (!credential.privacyVerifiedAt) throw new MonitorError('private-rules-not-verified');
      const state = await readJson(file, {}); let binary; let results;
      try {
        binary = await resolve({ preferred: state.binary?.executable });
        const unchanged = binary.version === state.binary?.version && binary.executable === state.binary?.executable;
        results = await read(binary.executable, { previousCapability: unchanged ? state.usageCapability : undefined,
          onServer: async child => { server = child; await lease.child(child); } });
        active();
        if (fingerprint(results.account, results.allowanceResult) !== credential.codexFingerprint ||
            credential.codexAccountIdFingerprint && accountIdFingerprint(results.allowanceResult) && credential.codexAccountIdFingerprint !== accountIdFingerprint(results.allowanceResult)) throw new MonitorError('codex-account-mismatch');
      } catch (error) {
        if (error.code === 'codex-account-mismatch') throw error;
        results = { allowanceError: error, dailyError: error };
      }
      const snapshot = createSnapshot(state.lastSnapshot, results, now());
      active();
      const next = { ...state, binary: binary || state.binary || null,
        usageCapability: results.dailyError?.code === 'unsupported-method' ? 'unsupported' : results.dailyResult ? 'supported' : state.usageCapability || null,
        lastSnapshot: snapshot, pending: snapshot };
      await atomicJson(file, next);
      active();
      if (!shouldPublish(state.lastPublished, snapshot)) {
        await logEvent(root, 'unchanged-failure', { allowance: snapshot.allowance.status, daily: snapshot.daily.status });
        return { outcome: 'unchanged-failure', allowance: snapshot.allowance.status, daily: snapshot.daily.status };
      }
      const session = await retry(() => refresh(credential.refreshToken));
      active();
      if (session.refreshToken !== credential.refreshToken) await credentials.save({ ...credential, refreshToken: session.refreshToken });
      await retry(() => write(session.idToken, snapshot));
      active();
      await atomicJson(file, { ...next, lastPublished: snapshot, publishedAt: now(), pending: null });
      await logEvent(root, 'published', { allowance: snapshot.allowance.status, daily: snapshot.daily.status });
      return { outcome: 'published', allowance: snapshot.allowance.status, daily: snapshot.daily.status };
    })(), new Promise((_, reject) => { timeout = setTimeout(() => { expired = true; void server?.close(); reject(new MonitorError('run-timeout')); }, deadlineMs); })]);
  } catch (error) { await logEvent(root, 'failed', { code: safeCode(error) }); throw error; }
  finally { clearTimeout(timeout); await server?.close(); await lease.release(); }
}
