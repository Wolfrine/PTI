import { correctionUrl, firebaseConfig } from './firebase-config.mjs';

export const PAGE_SIZE = 25;
const LIMIT = 100;

export async function connectFinance() {
  const [firebase, identity, store] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js'),
  ]);
  const app = firebase.initializeApp(firebaseConfig);
  const auth = identity.getAuth(app);
  await identity.setPersistence(auth, identity.browserSessionPersistence);
  const firestore = store.initializeFirestore(app, { localCache: store.memoryLocalCache() });
  const workspace = (uid) => store.doc(firestore, 'users', uid, 'financeData', 'workspace');
  const collection = (uid, name) => store.collection(workspace(uid), name);
  const fromDocument = (snapshot) => snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null;

  async function rows(uid, name, ...constraints) {
    const snapshot = await store.getDocsFromServer(store.query(collection(uid, name), ...constraints));
    return snapshot.docs;
  }

  return {
    watchIdentity(callback) { return identity.onAuthStateChanged(auth, callback); },
    async signIn() {
      const google = new identity.GoogleAuthProvider();
      google.setCustomParameters({ prompt: 'select_account' });
      await identity.signInWithPopup(auth, google);
    },
    signOut() { return identity.signOut(auth); },
    async verifyOwner(uid) {
      await store.getDocFromServer(workspace(uid));
    },
    async detail(uid, name, id) {
      return fromDocument(await store.getDocFromServer(store.doc(collection(uid, name), id)));
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
    async page(uid, name, month, cursor, pageSize = PAGE_SIZE) {
      const snapshot = await rows(uid, name,
        store.where('occurredOn', '>=', `${month}-01`),
        store.where('occurredOn', '<=', `${month}-31`),
        store.orderBy('occurredOn', 'desc'),
        ...(cursor ? [store.startAfter(cursor)] : []),
        store.limit(pageSize + 1),
      );
      const page = snapshot.slice(0, pageSize);
      return { list: page.map(fromDocument), cursor: page.at(-1), more: snapshot.length > pageSize };
    },
    async correct(user, decision, signal) {
      const response = await fetch(correctionUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(decision),
        credentials: 'omit',
        cache: 'no-store',
        signal,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) {
        throw Object.assign(new Error('The correction was not confirmed.'), { code: result?.error?.code });
      }
      return result;
    },
  };
}
