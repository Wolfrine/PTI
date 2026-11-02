export function assertUser(value: string, owner?: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error('Invalid Firebase uid.');
  if (owner && value !== owner) throw new Error('Another account is outside this connection.');
  return value;
}
export function assertPath(value: string, kind: 'document' | 'collection', owner?: string): string {
  const parts = value.split('/');
  if (!value || value !== value.trim() || parts.some(p => !p || p === '.' || p === '..') ||
      parts.length % 2 !== (kind === 'document' ? 0 : 1)) throw new Error(`Invalid ${kind} path.`);
  if (parts.some(p => p === '_ptiMcpAuth' || p === '_ptiLocalServices' || p === 'agentKeys') || parts[0] === 'mcpAuditLog')
    throw new Error('Authentication and audit records are not exposed through data tools.');
  if (owner && (parts[0] !== 'users' || parts[1] !== owner)) throw new Error('Path is outside the connected account.');
  return value;
}
export const assertDocumentPath = (value: string) => assertPath(value, 'document');
export const assertCollectionPath = (value: string) => assertPath(value, 'collection');
export function assertWritablePath(value: string, kind: 'document' | 'collection', owner?: string, operation='update'): string {
  const path = assertPath(value, kind, owner), parts = path.split('/');
  if (parts[0] === 'users' && parts[2] === 'atlasData')
    throw new Error('Atlas data requires its specialized tools or owner client transactions; generic writes are disabled.');
  if (parts[0] === 'users' && parts[2] === 'foodData' && parts[3] === 'workspace' && ['purchases', 'purchaseSyncRuns', 'purchaseSyncState'].includes(parts[4]))
    throw new Error('Blinkit purchase data requires its specialized tools; generic writes cannot bypass pause, revisions or counters.');
  if(parts[2]==='foodData'&&parts[3]==='workspace'&&(parts[4]==='purchaseWorkerState'||parts[4]==='purchaseEvents'&&(operation!=='create'||parts.length!==6)))throw Error('Payment events are create-only; worker state requires specialized tools.');
  return path;
}
