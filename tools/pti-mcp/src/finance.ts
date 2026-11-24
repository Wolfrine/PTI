import express, { type ErrorRequestHandler } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CheckUser, UserIdentity } from './oauth.js';
import {
  contextInput, correctionInput, FinanceError, financeOwner, financeRoot, ingestInput, monthKey, scanInput,
  type CorrectionInput,
} from './finance-contract.js';
import { commitScan, correctEvent, financeContext, ingestMail } from './finance-ledger.js';
import { reconcileMonth } from './finance-projection.js';
import { getAnalysisSource, publishMonthlyAnalysis, publishMonthlyAnalysisInput } from './finance-analysis.js';
import { publicationInput, publishFinancePublication } from './finance-publications.js';

const readOnly = { readOnlyHint: true, destructiveHint: false };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: true };
const reply = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }] });
function fail(error: unknown) {
  return error instanceof FinanceError ? error.code : 'service_unavailable';
}
async function call(operation: () => Promise<unknown>) {
  try {
    return reply(await operation());
  } catch (error) {
    return { ...reply({ ok: false, error: { code: fail(error) } }), isError: true };
  }
}

export function registerFinanceTools(server: McpServer, db: Firestore, context: {
  uid?: string; email?: string; actor?: string; transport?: string;
}) {
  if (context.transport !== 'streamable-http' || !financeOwner(context.uid, context.email)) return;
  const root = db.doc(financeRoot(context.uid!));
  const actor = context.actor || 'authenticated PTI MCP';
  server.registerTool('finance_context', {
    title: 'Read PTI Finance',
    description: 'Read bounded verified-owner Finance projections, reviews, source gaps or Gmail operation state. Missing months are unavailable.',
    inputSchema: contextInput,
    annotations: readOnly,
  }, input => call(() => financeContext(root, input)));
  server.registerTool('finance_ingest_email', {
    title: 'Ingest sanitized Finance mail evidence',
    description: 'Capture an owner-scoped Gmail envelope and up to 20 stable physical rows. Use strong payment references only, never mail bodies or documents. Replays keep the same edition, part, source row keys and normalized payload.',
    inputSchema: ingestInput,
    annotations: write,
  }, input => call(() => ingestMail(root, input)));
  server.registerTool('finance_reconcile_month', {
    title: 'Reconcile a PTI Finance month',
    description: 'Reconcile captured ledger arithmetic and return the exact analysisSource binding for finance_publish_monthly_analysis.',
    inputSchema: z.object({ month: monthKey }).strict(),
    annotations: write,
  }, ({ month }) => call(async () => {
    const report = await reconcileMonth(root, month, actor);
    const analysisSource = await getAnalysisSource(root, month, report.reportVersion);
    return { ok: true, month, report, analysisSource };
  }));
  server.registerTool('finance_publish_monthly_analysis', {
    title: 'Publish a PTI Finance monthly analysis',
    description: 'Publish private, evidence-bound monthly findings and coverage gaps. Pass the exact analysisSource from finance_reconcile_month as source, select structured findings, and optionally cite source-window IDs from the same month. The service renders prose and calculates figures. Replay the same source and semantic selections to retrieve the original immutable analysis.',
    inputSchema: publishMonthlyAnalysisInput,
    annotations: write,
  }, input => call(() => publishMonthlyAnalysis(root, input)));
  server.registerTool('finance_publish_publication', {
    title: 'Publish Finance project report, plan, decision or insight',
    description: 'Persist one immutable, cited, owner-only Finance publication created from an authorized Finance project discussion. Use a new ID and supersedes for revisions. No site forms or raw bank identifiers.',
    inputSchema: publicationInput,
    annotations: write,
  }, input => call(() => publishFinancePublication(root,input)));
  server.registerTool('finance_commit_scan', {
    title: 'Record a bounded Finance Gmail scan',
    description: 'Record an immutable processed window. Only a complete, contiguous scan with compare-and-set cursor evidence may advance the watermark.',
    inputSchema: scanInput,
    annotations: write,
  }, input => call(() => commitScan(root, input)));
  server.registerTool('finance_correct_event', {
    title: 'Apply an owner-approved Finance correction',
    description: 'Correct a ledger classification or resolve a duplicate only after the owner explicitly directs the correction. Requires revision and replay-stable request ID.',
    inputSchema: correctionInput,
    annotations: write,
  }, input => call(() => correctEvent(root, input, actor)));
}

const financeOrigins = new Set(['https://pti-app-2ab59-finance.web.app', 'https://pti-app-2ab59-finance.firebaseapp.com']);
export function financeCorrectionRouter(options: {
  verifyIdentity: (token: string) => Promise<UserIdentity>;
  checkUser: CheckUser;
  correct: (uid: string, input: CorrectionInput) => Promise<{ ok: boolean; eventId: string; revision: number }>;
}) {
  const router = express.Router();
  router.use((_req, res, next) => {
    res.vary('Origin').set('Cache-Control', 'no-store');
    next();
  });
  router.use((req, res, next) => {
    const origin = req.get('origin');
    if (!origin || !financeOrigins.has(origin)) { res.status(403).json({ ok: false, error: { code: 'origin_denied' } }); return; }
    res.set('Access-Control-Allow-Origin', origin);
    if (req.method !== 'OPTIONS') { next(); return; }
    const headers = (req.get('access-control-request-headers') || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
    if (req.get('access-control-request-method') !== 'POST' || headers.some(h => !['authorization', 'content-type'].includes(h))) {
      res.status(403).end();
      return;
    }
    res.set({ 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '300' }).status(204).end();
  });
  router.post('/', async (req, res, next) => {
    const bearer = /^Bearer ([^\s]{1,12000})$/.exec(req.get('authorization') || '');
    if (!bearer) { res.status(401).json({ ok: false, error: { code: 'sign_in_required' } }); return; }
    try {
      const identity = await options.verifyIdentity(bearer[1]);
      await options.checkUser(identity.uid, identity.authenticatedAt);
      if (!financeOwner(identity.uid, identity.email) || identity.signInProvider !== 'google.com') throw new Error('denied');
      res.locals.financeOwner = identity.uid;
      next();
    } catch {
      res.status(403).json({ ok: false, error: { code: 'owner_authorization_required' } });
    }
  }, express.json({ limit: '8kb', strict: true }), async (req, res) => {
    const input = correctionInput.safeParse(req.body);
    if (!input.success) { res.status(400).json({ ok: false, error: { code: 'invalid_request' } }); return; }
    try {
      res.json(await options.correct(res.locals.financeOwner, input.data));
    } catch (error) {
      const code = fail(error);
      res.status(code === 'revision_conflict' ? 409 : code === 'not_found' ? 404 : code === 'invalid_request' ? 400 : 503)
        .json({ ok: false, error: { code } });
    }
  });
  router.all('/', (_req, res) => res.set('Allow', 'POST, OPTIONS').status(405).end());
  router.use(((_error, _req, res, _next) => {
    res.status(400).json({ ok: false, error: { code: 'invalid_request' } });
  }) as ErrorRequestHandler);
  return router;
}
