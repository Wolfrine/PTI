export function assertUser(value: string, owner?: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error('Invalid Firebase uid.');
  if (owner && value !== owner) throw new Error('Another account is outside this connection.');
  return value;
}
export function assertPath(value: string, kind: 'document' | 'collection', owner?: string): string {
  const parts = value.split('/');
  if (!value || value !== value.trim() || parts.some(p => !p || p === '.' || p === '..') ||
      parts.length % 2 !== (kind === 'document' ? 0 : 1)) throw new Error(`Invalid ${kind} path.`);
  if (parts.some(p => p === '_ptiMcpAuth' || p === 'agentKeys') || parts[0] === 'mcpAuditLog')
    throw new Error('Authentication and audit records are not exposed through data tools.');
  if (owner && (parts[0] !== 'users' || parts[1] !== owner)) throw new Error('Path is outside the connected account.');
  return value;
}
export const assertDocumentPath = (value: string) => assertPath(value, 'document');
export const assertCollectionPath = (value: string) => assertPath(value, 'collection');
