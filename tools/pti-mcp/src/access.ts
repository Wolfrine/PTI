import { FINANCE_CHECKPOINT, FINANCE_OWNER } from './finance-contract.js';

const financeReadable = new Set([
  'projects', 'months', 'transactions', 'reviews', 'balances', 'recurring',
  'sourceStatus', 'sourceWindows', 'scanStatus', 'scanRuns', 'reports', 'monthlyAnalyses',
  'mailPartReceipts', 'mailProgress', 'sourceAudits', 'sourceIndexes',
]);
const financeCommands = new Set(['mcpIntake', 'mcpScans', 'mcpClosures', 'mcpAnalysis']);

export function assertUser(value: string, owner?: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error('Invalid Firebase uid.');
  if (owner && value !== owner) throw new Error('Another account is outside this connection.');
  return value;
}
export function assertPath(value: string, kind: 'document' | 'collection', owner?: string, operation = 'get'): string {
  const parts = value.split('/');
  if (!value || value !== value.trim() || parts.some(p => !p || p === '.' || p === '..') ||
      parts.length % 2 !== (kind === 'document' ? 0 : 1)) throw new Error(`Invalid ${kind} path.`);
  if (parts.some(p => p === '_ptiMcpAuth' || p === '_ptiLocalServices' || p === 'agentKeys') || parts[0] === 'mcpAuditLog')
    throw new Error('Authentication and audit records are not exposed through data tools.');
  if (owner && (parts[0] !== 'users' || parts[1] !== owner)) throw new Error('Path is outside the connected account.');
  if (parts[0] === 'users' && parts[2] === 'financeData') {
    // Owner-only Finance projections are accessible through existing PTI generic
    // reads. The *only* generic creates are virtual commands routed to the
    // canonical Finance engine; ledger/month records are never directly writable.
    const verifiedOwner = owner === FINANCE_OWNER && parts[1] === FINANCE_OWNER &&
      parts[3] === 'workspace';
    const checkpoint = kind === 'document' && parts.length === 6 &&
      parts[4] === 'projects' && parts[5] === FINANCE_CHECKPOINT;
    const readable = parts.length === (kind === 'document' ? 6 : 5) &&
      financeReadable.has(parts[4]);
    const command = kind === 'document' && parts.length === 6 &&
      financeCommands.has(parts[4]);
    const permitted = verifiedOwner && (
      (checkpoint && ['get', 'update'].includes(operation)) ||
      (readable && operation === 'get') ||
      (command && operation === 'create') ||
      (kind === 'document' && parts.length === 4 && operation === 'list')
    );
    if (!permitted) throw new Error('Finance ledger mutations require validated intake commands.');
  }
  return value;
}
export const assertDocumentPath = (value: string) => assertPath(value, 'document');
export const assertCollectionPath = (value: string) => assertPath(value, 'collection');
export function assertWritablePath(value: string, kind: 'document' | 'collection', owner?: string, operation='update'): string {
  const path = assertPath(value, kind, owner, operation), parts = path.split('/');
  if (parts[0] === 'users' && parts[2] === 'atlasData')
    throw new Error('Atlas data requires its specialized tools or owner client transactions; generic writes are disabled.');
  if (parts[0] === 'users' && parts[2] === 'foodData' && parts[3] === 'workspace' && ['purchases', 'purchaseSyncRuns', 'purchaseSyncState'].includes(parts[4]))
    throw new Error('Blinkit purchase data requires its specialized tools; generic writes cannot bypass pause, revisions or counters.');
  if(parts[2]==='foodData'&&parts[3]==='workspace'&&(parts[4]==='purchaseWorkerState'||parts[4]==='purchaseEvents'&&(operation!=='create'||parts.length!==6)))throw Error('Payment events are create-only; worker state requires specialized tools.');
  return path;
}
