import { createHash, randomBytes } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';

export type RecordValue = Record<string, unknown>;
export interface AuthStore {
  get(kind: string, key: string): Promise<RecordValue | undefined>;
  put(kind: string, key: string, value: RecordValue): Promise<void>;
  // Mutations are committed together, and the source is consumed exactly once.
  consume(kind: string, key: string, validate: (value: RecordValue) => void,
    writes: { kind: string; key: string; value: RecordValue }[]): Promise<RecordValue>;
}
export const secret = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const now = () => Math.floor(Date.now() / 1000);
export class FirestoreAuthStore implements AuthStore {
  constructor(private db: Firestore) {}
  private ref(kind: string, key: string) {
    return this.db.doc(`_ptiMcpAuth/${kind}/items/${digest(key)}`);
  }
  async get(kind: string, key: string) { return (await this.ref(kind, key).get()).data(); }
  async put(kind: string, key: string, value: RecordValue) {
    await this.ref(kind, key).set(JSON.parse(JSON.stringify(value)));
  }
  async consume(kind: string, key: string, validate: (value: RecordValue) => void,
    writes: { kind: string; key: string; value: RecordValue }[]) {
    return this.db.runTransaction(async tx => {
      const ref = this.ref(kind, key);
      const value = (await tx.get(ref)).data();
      if (!value) throw new Error('Unknown or consumed authorization grant');
      validate(value);
      tx.delete(ref);
      for (const write of writes) tx.set(this.ref(write.kind, write.key), JSON.parse(JSON.stringify(write.value)));
      return value;
    });
  }
}

