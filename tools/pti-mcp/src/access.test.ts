import { describe, expect, it } from 'vitest';
import { assertPath, assertUser } from './access.js';
import { appCatalog } from './apps.js';
import { createMcpServer } from './index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
describe('Shared PTI account boundary', () => {
  it('rejects cross-account, root, malformed and secret paths', () => {
    for (const path of ['users/other', 'users/owner/../secrets', 'users//owner', '_ptiMcpAuth/access/items/key', 'users/owner/personalData/workspace/agentKeys/key', 'mcpAuditLog/key'])
      expect(() => assertPath(path, 'document', 'owner')).toThrow();
    expect(assertPath('users/owner/luminaryData/observations/items/a', 'document', 'owner')).toContain('/owner/');
    expect(() => assertUser('other', 'owner')).toThrow();
  });
  it('discovers all seven apps without misrepresenting browser/Drive data', () => {
    const apps = appCatalog('owner');
    expect(apps.map(x => x.id)).toEqual(['pti', 'luminary', 'personal', 'sefpo', 'venture', 'food', 'tracker', 'velum']);
    expect(apps.find(x => x.id === 'velum')?.access).toBe('external-connection-required');
    expect(apps.find(x => x.id === 'personal')?.root).toBe('users/owner/personalData/workspace');
    expect(apps.find(x => x.id === 'tracker')?.root).toBe('users/owner/trackerData/workspace');
    expect(apps.find(x => x.id === 'venture')?.root).toBe('users/owner/ventureData/workspace');
  });
  it('lists the real server tools, calls discovery and rejects cross-user data before Firestore', async () => {
    const [a, b] = InMemoryTransport.createLinkedPair();
    const server = createMcpServer({ uid: 'owner', transport: 'streamable-http' });
    const client = new Client({ name: 'test', version: '1' });
    await Promise.all([server.connect(a), client.connect(b)]);
    try {
      const names = (await client.listTools()).tools.map(x => x.name);
      expect(names).toEqual(expect.arrayContaining(['pti_apps_list', 'pti_app_context', 'personal_context', 'personal_publish', 'sefpo_search', 'firestore_update_document']));
      const discovery = await client.callTool({ name: 'pti_apps_list', arguments: {} });
      expect(discovery.isError).not.toBe(true);
      for (const [name, args] of [
        ['firestore_get_document', { path: 'users/other' }],
        ['firestore_create_document', { path: 'users/other/sefpoData/workspace', data: {} }],
        ['personal_context', { uid: 'other' }],
        ['pti_app_context', { appId: 'personal', uid: 'other' }],
      ] as const) expect((await client.callTool({ name, arguments: args })).isError).toBe(true);
    } finally { await client.close(); await server.close(); }
  });
});
