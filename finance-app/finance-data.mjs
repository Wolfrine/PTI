import { firebaseConfig, planningUrl } from './firebase-config.mjs';
import { dateValid } from './values.mjs';

export const PAGE_SIZE = 25;
const LIMIT = 100;

export function readFinancialEvidence(planning) {
  if (!planning?.ok) return { ok: false, data: null, error: planning?.error ?? 'read_failed' };
  const evidence = planning.data?.financialEvidence;
  if (evidence == null) return { ok: false, data: null, error: 'not_available' };
  const position = evidence.position;
  if (evidence.schemaVersion !== 1 || !dateValid(evidence.asOf) || !Array.isArray(evidence.ledgerMonths)
    || !Array.isArray(position?.cashSnapshots) || !Array.isArray(position?.investmentSnapshots)
    || !Array.isArray(position?.debtSnapshots) || !Array.isArray(evidence.quality?.findings)
    || !Array.isArray(evidence.quality?.missingDimensions)) {
    return { ok: false, data: null, error: 'unsupported_response' };
  }
  return { ok: true, data: evidence };
}

export async function connectFinance() {
  const [firebase, identity, store] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js'),
  ]);
  const app = firebase.initializeApp(firebaseConfig);
  const auth = identity.getAuth(app);
  // Persist the verified Google session, not financial documents. Explicit sign-out still clears identity.
  try { await identity.setPersistence(auth, identity.browserLocalPersistence); }
  catch { await identity.setPersistence(auth, identity.browserSessionPersistence); }
  const firestore = store.initializeFirestore(app, { localCache: store.memoryLocalCache() });
  const workspace = (uid) => store.doc(firestore, 'users', uid, 'financeData', 'workspace');
  const collection = (uid, name) => store.collection(workspace(uid), name);
  const fromDocument = (snapshot) => snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null;

  async function rows(uid, name, ...constraints) {
    const snapshot = await store.getDocsFromServer(store.query(collection(uid, name), ...constraints));
    return snapshot.docs;
  }

  async function planningRequest(user, options) {
    const response = await fetch(planningUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read', ...options }),
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok !== true) {
      throw Object.assign(new Error('Finance publications and evidence could not load.'), { code: data?.error?.code });
    }
    return data;
  }

  return {
    watchIdentity(callback) { return identity.onAuthStateChanged(auth, callback); },
    async signIn() {
      const google = new identity.GoogleAuthProvider();
      await identity.signInWithPopup(auth, google);
    },
    signOut() { return identity.signOut(auth); },
    async verifyOwner(uid) {
      await store.getDocFromServer(workspace(uid));
    },
    async detail(uid, name, id) {
      return fromDocument(await store.getDocFromServer(store.doc(collection(uid, name), id)));
    },
    async monthRange(uid, from, to) {
      const snapshot = await rows(uid, 'months',
        store.orderBy(store.documentId()), store.startAt(from), store.endAt(to), store.limit(37),
      );
      return snapshot.map(fromDocument);
    },
    async collection(uid, name, latestBy) {
      const order = latestBy ? [store.orderBy(latestBy, 'desc')] : [];
      const snapshot = await rows(uid, name, ...order, store.limit(LIMIT + 1));
      return { list: snapshot.slice(0, LIMIT).map(fromDocument), more: snapshot.length > LIMIT };
    },
    async sourceWindows(uid, month) {
      const snapshot = await rows(uid, 'sourceWindows', store.where('months', 'array-contains', month), store.limit(LIMIT + 1));
      return { list: snapshot.slice(0, LIMIT).map(fromDocument), more: snapshot.length > LIMIT };
    },
    async page(uid, name, period, cursor, pageSize = PAGE_SIZE) {
      const snapshot = await rows(uid, name,
        store.where('occurredOn', '>=', period.from),
        store.where('occurredOn', '<=', period.to),
        store.orderBy('occurredOn', 'desc'),
        ...(cursor ? [store.startAfter(cursor)] : []),
        store.limit(pageSize + 1),
      );
      const page = snapshot.slice(0, pageSize);
      return { list: page.map(fromDocument), cursor: page.at(-1), more: snapshot.length > pageSize };
    },
    async planning(user, { includeEvidence = true, publicationId } = {}) {
      if (includeEvidence && !publicationId) return planningRequest(user, {});
      try {
        return await planningRequest(user, { includeEvidence: includeEvidence ? undefined : false, publicationId });
      } catch (error) {
        if (error.code !== 'invalid_request') throw error;
      }
      // During rollout, an older revision may support ID lookup but not the evidence switch.
      if (!includeEvidence && publicationId) {
        try {
          return await planningRequest(user, { publicationId });
        } catch (error) {
          if (error.code !== 'invalid_request') throw error;
        }
      }
      return planningRequest(user, {});
    },
  };
}
