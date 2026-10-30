import { createHash, randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// Hosted MCP account identity, not caller-supplied UID, chooses the owner namespace.
const chatId = z.string().regex(/^[A-Za-z0-9_-]{10,150}$/);
const turnId = z.string().regex(/^[A-Za-z0-9_-]{6,180}$/);
const sha = (v: unknown) => createHash('sha256').update(JSON.stringify(v), 'utf8').digest('hex');
const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
const dateInIndia = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = (name: string) => parts.find(x => x.type === name)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};
export const chatCaptureInput = z.object({
  recordingPolicy: z.literal('on'),
  harnessConversationId: chatId.optional(),
  newConversation: z.boolean().default(false),
  turnId,
  title: z.string().max(240).default('ChatGPT conversation'),
  userText: z.string().min(1).max(700000),
  assistantText: z.string().min(1).max(700000),
  platformConversationId: z.string().min(6).max(240).nullable().optional(),
  note: z.string().max(1000).default(''),
}).strict();

export function registerChatCaptureTools(server: McpServer, db: Firestore, authenticatedUid?: string) {
  const root = () => {
    if (!authenticatedUid || !/^[A-Za-z0-9_-]{1,128}$/.test(authenticatedUid)) {
      throw new Error('Chat capture requires an authenticated owner connection.');
    }
    return `users/${authenticatedUid}/trackerData/workspace`;
  };
  const readOnly = { readOnlyHint: true, destructiveHint: false };
  const write = { readOnlyHint: false, destructiveHint: false };
  server.registerTool('chat_capture_turn', {
    title: 'Capture ChatGPT turn in PTI Firestore',
    description: 'Atomically and idempotently persist one explicitly recordable ChatGPT user prompt and full prepared assistant reply under the authenticated owner. One chat has many immutable turns. Never call for an opted-out or not-yet-approved chat. No GitHub write.',
    inputSchema: chatCaptureInput.shape,
    annotations: write,
  }, async (input) => {
    const owner = root();
    const bytes = Buffer.byteLength(JSON.stringify({
      user: input.userText, assistant: input.assistantText, note: input.note,
    }), 'utf8');
    // Firestore documents cannot exceed 1 MiB; fail rather than truncate exact text.
    if (bytes > 700000) throw new Error('Exact turn exceeds safe Firestore inline size. Capture blocked; text not truncated.');
    if (!input.harnessConversationId && !input.newConversation) {
      throw new Error('Missing known chat ID. Use newConversation only for the first capture of a genuinely new chat; never guess a match.');
    }
    if (input.harnessConversationId && input.newConversation) {
      throw new Error('newConversation requires an absent harnessConversationId.');
    }
    const turnRef = db.doc(`${owner}/chatTurns/${input.turnId}`);
    const generatedId = `hc_${randomUUID().replaceAll('-', '')}`;
    const inputDigest = sha({userText: input.userText, assistantText: input.assistantText});
    const now = new Date();
    const capturedAt = now.toISOString();
    const result = await db.runTransaction(async tx => {
      const existingTurn = await tx.get(turnRef);
      if (existingTurn.exists) {
        const saved = existingTurn.data() || {};
        if (saved['contentSha256'] !== inputDigest ||
            (input.harnessConversationId && saved['harnessConversationId'] !== input.harnessConversationId)) {
          throw new Error('Turn ID conflict: existing captured text or conversation differs. No overwrite performed.');
        }
        const convo = await tx.get(db.doc(`${owner}/chatConversations/${saved['harnessConversationId']}`));
        if (!convo.exists) throw new Error('Captured turn has no conversation index; manual repair required.');
        return { duplicate: true, harnessConversationId: saved['harnessConversationId'], turnId: input.turnId,
          turnCount: Number(convo.data()?.['turnCount'] ?? 0), capturedAt: saved['capturedAt'] };
      }
      const conversationId = input.harnessConversationId ?? generatedId;
      const conversationRef = db.doc(`${owner}/chatConversations/${conversationId}`);
      const current = await tx.get(conversationRef);
      if (current.exists && input.platformConversationId &&
          current.data()?.['platformConversationId'] &&
          current.data()?.['platformConversationId'] !== input.platformConversationId) {
        throw new Error('Platform conversation identity conflict.');
      }
      const identity = {
        kind: input.platformConversationId ? 'platform_supplied' : 'harness_assigned',
        confidence: input.platformConversationId ? 'platform_id_verified' : input.newConversation ? 'provisional' : 'active_chat_context',
        note: 'Captures are model-invoked and not independently verified ChatGPT UI deliveries.',
      };
      const messages = [
        {role:'user', content:input.userText, provenance:'visible_user_message'},
        {role:'assistant', content:input.assistantText, provenance:'assistant_prepared_final_markdown', delivery_verified:false},
      ];
      const coverage = {user_message_copied:true, assistant_prepared_text_saved:true,
        final_rendered_response_verified:false, attachments_verified:false, hidden_context_included:false};
      const turn = {
        schemaVersion:3, source:'chatgpt_harness_firestore', sourceType:'chatgpt_skill_firestore_presend',
        harnessConversationId:conversationId, conversationId:input.platformConversationId ?? null,
        conversationHint:input.title, groupingConfidence:identity.confidence,
        capturedAt, localDate:dateInIndia(now), messages, coverage,
        contentSha256:inputDigest, captureStatus:'prepared-complete', deliveryVerified:false,
        originNotes:input.note, userPreview:input.userText.slice(0,260),
        assistantPreview:input.assistantText.slice(0,260), createdAt:capturedAt,
      };
      const turnCount = Number(current.data()?.['turnCount'] ?? 0) + 1;
      tx.create(turnRef, turn);
      const latest = {
        schemaVersion:3, primarySource:'chatgpt_harness_firestore', title:input.title,
        platformConversationId:input.platformConversationId ?? current.data()?.['platformConversationId'] ?? null,
        identity, turnCount, lastTurnId:input.turnId, lastCapturedAt:capturedAt,
        updatedAt:capturedAt, userPreview:turn.userPreview, assistantPreview:turn.assistantPreview,
        renderedResponsesVerified:false,
      };
      if (current.exists) tx.update(conversationRef, latest);
      else tx.create(conversationRef, { ...latest, source:'chatgpt_harness_firestore', firstCapturedAt:capturedAt, createdAt:capturedAt });
      return {duplicate:false, harnessConversationId:conversationId, turnId:input.turnId, turnCount, capturedAt};
    });
    return json({...result, ok:true, storage:'pti-firestore', deliveryVerified:false});
  });
  server.registerTool('chat_get_context', {
    title:'Get captured ChatGPT conversation metadata',
    description:'Read the exact known harness conversation ID and recent saved turn previews. Never infer a conversation ID by title or topic.',
    inputSchema:{harnessConversationId:chatId},
    annotations:readOnly,
  }, async ({harnessConversationId}) => {
    const owner = root();
    const snap = await db.doc(`${owner}/chatConversations/${harnessConversationId}`).get();
    if (!snap.exists) return json({found:false,harnessConversationId});
    const recent = await db.collection(`${owner}/chatTurns`)
      .where('harnessConversationId','==',harnessConversationId).limit(30).get();
    const previews = recent.docs.map(item => {
      const record = item.data();
      return {turnId:item.id,capturedAt:record['capturedAt'],
        userPreview:record['userPreview'],assistantPreview:record['assistantPreview']};
    }).sort((a,b) => String(b.capturedAt).localeCompare(String(a.capturedAt))).slice(0,5);
    const record = snap.data() || {};
    return json({found:true,harnessConversationId,title:record['title'],turnCount:record['turnCount'],
      identity:record['identity'],lastCapturedAt:record['lastCapturedAt'],recent:previews});
  });
}
