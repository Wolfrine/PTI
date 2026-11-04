import { describe, expect, it } from 'vitest';
import { chooseVelumPrompt, registerVelumPromptTools } from './velum-prompts.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

class MemoryDb {
  rows = new Map<string, Record<string, any>>();
  doc(path: string): any {
    return { path, collection: (name: string) => this.collection(`${path}/${name}`) };
  }
  collection(path: string): any {
    return {
      doc: (id: string) => this.doc(`${path}/${id}`),
      orderBy: () => ({ limit: (count: number) => ({ get: async () => {
        const docs = [...this.rows.entries()].filter(([key]) => key.startsWith(`${path}/`))
          .slice(0, count).map(([id, data]) => ({ id: id.split('/').at(-1), data: () => data, get: (field: string) => data[field] }));
        return { docs, size: docs.length };
      } }) }),
    };
  }
  snapshot(path: string) {
    const value = this.rows.get(path);
    return { exists: Boolean(value), data: () => value };
  }
  async runTransaction(fn: (tx: any) => Promise<void>) {
    const writes: Array<[string, Record<string, any>, boolean]> = [];
    await fn({
      get: async (ref: any) => this.snapshot(ref.path),
      create: (ref: any, value: Record<string, any>) => writes.push([ref.path, value, false]),
      update: (ref: any, value: Record<string, any>) => writes.push([ref.path, value, true]),
    });
    for (const [path, value, merge] of writes) this.rows.set(path, merge ? { ...this.rows.get(path), ...value } : value);
  }
}

describe('Velum prompt random selection', () => {
  const ids = ['vp-001', 'vp-002', 'vp-003', 'vp-004'];

  it('selects uniformly over candidates using a random integer', () => {
    expect(chooseVelumPrompt(ids, [], [], () => 0)).toBe('vp-001');
    expect(chooseVelumPrompt(ids, [], [], max => max - 1)).toBe('vp-004');
  });

  it('avoids recent prompts and exclusions until candidates are exhausted', () => {
    expect(chooseVelumPrompt(ids, ['vp-001', 'vp-002'], ['vp-003'], () => 0)).toBe('vp-004');
    expect(chooseVelumPrompt(ids, ids, [], () => 1)).toBe('vp-002');
  });

  it('rejects no candidates, invalid ids, and invalid draws', () => {
    expect(() => chooseVelumPrompt(['nope'])).toThrow('No Velum prompts');
    expect(() => chooseVelumPrompt(ids, [], ids)).toThrow('Every available');
    expect(() => chooseVelumPrompt(ids, [], [], max => max)).toThrow('Invalid random draw');
  });

  it('deduplicates identifiers before choosing', () => {
    expect(chooseVelumPrompt(['vp-001', 'vp-001', 'vp-002'], [], [], () => 1)).toBe('vp-002');
  });
});

describe('Velum MCP contract', () => {
  it('picks two different prompts, saves explicit image feedback and rejects overwrites/cross-owner calls', async () => {
    const db = new MemoryDb();
    const base = 'users/owner/velumPromptData/workspace';
    db.rows.set(base, { promptIds: ['vp-001', 'vp-002'], recentPromptIds: [] });
    for (const id of ['vp-001', 'vp-002']) {
      db.rows.set(`${base}/prompts/${id}`, { id, title: id, category: 'wardrobe-tension', prompt: `Actual ${id} scenario`, version: 1, enabled: true });
    }
    const server = new McpServer({ name: 'velum-test', version: '1' });
    registerVelumPromptTools(server, db as any, 'owner');
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1' });
    await Promise.all([server.connect(a), client.connect(b)]);
    const call = async (name: string, args: Record<string, unknown>) => {
      const raw = await client.callTool({ name, arguments: args });
      return { error: raw.isError === true, value: raw.isError ? null : JSON.parse((raw.content as any[])[0].text) };
    };
    try {
      const first = await call('velum_prompt_pick', {});
      const second = await call('velum_prompt_pick', {});
      expect(first.error).toBe(false);
      expect(second.error).toBe(false);
      expect(first.value.promptId).not.toBe(second.value.promptId);
      expect(first.value.prompt).toMatch(/Actual vp-00[12] scenario/);
      const args = { selectionId: first.value.selectionId, rating: 5, feedback: 'Natural contours', imageRef: 'drive-image-id' };
      expect((await call('velum_prompt_rate', args)).value.alreadySaved).toBe(false);
      expect((await call('velum_prompt_rate', args)).value.alreadySaved).toBe(true);
      expect((await call('velum_prompt_rate', { ...args, rating: 2 })).error).toBe(true);
      const history = await call('velum_prompt_feedback', {});
      expect(history.value.count).toBe(1);
      expect(history.value.ratings[0]).toMatchObject({ promptId: first.value.promptId, rating: 5, feedback: 'Natural contours' });
      expect((await call('velum_prompt_pick', { uid: 'other' })).error).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
