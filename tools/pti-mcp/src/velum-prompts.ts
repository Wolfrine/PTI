import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assertUser } from './access.js';

const promptId = z.string().regex(/^vp-[0-9]{3}$/);
const selectionId = z.string().uuid();
const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });

/** Select uniformly from eligible IDs, suppressing recent repeats when alternatives exist. */
export function chooseVelumPrompt(
  ids: string[], recentIds: string[] = [], excludedIds: string[] = [],
  draw: (max: number) => number = randomInt,
): string {
  const all = [...new Set(ids)].filter(id => promptId.safeParse(id).success);
  if (!all.length) throw new Error('No Velum prompts are available.');
  const excluded = new Set(excludedIds);
  const allowed = all.filter(id => !excluded.has(id));
  if (!allowed.length) throw new Error('Every available prompt was excluded.');
  const recent = new Set(recentIds);
  const fresh = allowed.filter(id => !recent.has(id));
  const candidates = fresh.length ? fresh : allowed;
  const index = draw(candidates.length);
  if (!Number.isInteger(index) || index < 0 || index >= candidates.length) throw new Error('Invalid random draw.');
  return candidates[index];
}

export function registerVelumPromptTools(server: McpServer, db: Firestore, owner?: string) {
  const root = (uid?: string) => {
    const account = owner || (uid ? assertUser(uid) : null);
    if (!account) throw new Error('Provide the workspace owner uid.');
    if (uid) assertUser(uid, owner);
    return db.doc(`users/${account}/velumPromptData/workspace`);
  };

  server.registerTool('velum_prompt_pick', {
    title: 'Pick a random Velum scene',
    description: 'Randomly select one original adult sensual-photography scenario from the owner-scoped Velum catalog. Suppress recently selected prompts, preserve a selection ID for subsequent image ratings, and return the exact prompt. This selects a prompt; it does not generate an image.',
    inputSchema: {
      uid: z.string().optional(),
      excludePromptIds: z.array(promptId).max(30).default([]),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  }, async ({ uid, excludePromptIds }) => {
    const workspace = root(uid), pickId = randomUUID();
    const selected = workspace.collection('selections').doc(pickId);
    let result: Record<string, unknown> | null = null;
    await db.runTransaction(async tx => {
      const stateSnap = await tx.get(workspace);
      if (!stateSnap.exists) throw new Error('Velum prompt catalog is not initialized.');
      const state = stateSnap.data() || {};
      const ids = Array.isArray(state.promptIds) ? state.promptIds.filter((id: unknown): id is string => typeof id === 'string') : [];
      const recent = Array.isArray(state.recentPromptIds) ? state.recentPromptIds.filter((id: unknown): id is string => typeof id === 'string') : [];
      const id = chooseVelumPrompt(ids, recent, excludePromptIds);
      const promptSnap = await tx.get(workspace.collection('prompts').doc(id));
      const prompt = promptSnap.data();
      if (!promptSnap.exists || !prompt || prompt.enabled !== true || typeof prompt.prompt !== 'string') {
        throw new Error('Catalog index references a missing or inactive prompt. Repair the index before selecting.');
      }
      const version = typeof prompt.version === 'number' ? prompt.version : 1;
      tx.create(selected, {
        promptId: id, promptVersion: version, promptTitle: prompt.title,
        status: 'selected', selectedAt: FieldValue.serverTimestamp(),
        source: 'velum-prompt-lab',
      });
      tx.update(workspace, {
        recentPromptIds: [id, ...recent.filter((other: string) => other !== id)].slice(0, 15),
        selectionCount: FieldValue.increment(1), lastSelectedAt: FieldValue.serverTimestamp(),
      });
      result = {
        selectionId: pickId, promptId: id, promptVersion: version,
        title: prompt.title, category: prompt.category, contourFocus: prompt.contourFocus || [],
        prompt: prompt.prompt,
        ratingInstructions: 'After the actual image is generated, ask the owner for a 1–5 rating and optional feedback. Save using velum_prompt_rate with this selectionId. Never invent a rating.',
      };
    });
    return json(Object.assign({ ok: true }, result));
  });

  server.registerTool('velum_prompt_rate', {
    title: 'Rate a Velum generation',
    description: 'Save the owner\'s explicit 1–5 image rating against the exact selected Velum prompt version. Requires an existing selection and an actual generated image; optional imageRef and feedback are stored without downloading media.',
    inputSchema: {
      uid: z.string().optional(),
      selectionId,
      rating: z.number().int().min(1).max(5),
      feedback: z.string().trim().max(3000).default(''),
      imageRef: z.string().trim().max(1500).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, async ({ uid, selectionId: id, rating, feedback, imageRef }) => {
    const workspace = root(uid);
    const selection = workspace.collection('selections').doc(id);
    const review = workspace.collection('ratings').doc(id);
    let saved: Record<string, unknown> | null = null;
    await db.runTransaction(async tx => {
      const selected = await tx.get(selection);
      const existing = await tx.get(review);
      const chosen = selected.data();
      if (!selected.exists || !chosen) throw new Error('Unknown selection; first select a Velum prompt.');
      const value = {
        selectionId: id, promptId: chosen.promptId, promptVersion: chosen.promptVersion,
        promptTitle: chosen.promptTitle, rating, feedback,
        imageRef: imageRef || '', source: 'owner-explicit-image-rating',
      };
      if (existing.exists) {
        const old = existing.data() || {};
        if (old.rating !== rating || old.feedback !== feedback || old.imageRef !== (imageRef || '')) {
          throw new Error('This selection already has a different rating. Do not silently overwrite feedback.');
        }
        saved = { ...value, alreadySaved: true };
        return;
      }
      tx.create(review, { ...value, ratedAt: FieldValue.serverTimestamp() });
      tx.update(selection, { status: 'rated', ratedAt: FieldValue.serverTimestamp() });
      saved = { ...value, alreadySaved: false };
    });
    return json(Object.assign({ ok: true }, saved));
  });

  server.registerTool('velum_prompt_feedback', {
    title: 'Read Velum prompt feedback',
    description: 'Read recent owner ratings of generated images, linked to immutable prompt IDs and versions. Use these observations when preparing the next creative prompt batch; no implicit ratings from viewing or saving.',
    inputSchema: { uid: z.string().optional(), limit: z.number().int().min(1).max(100).default(30) },
    annotations: { readOnlyHint: true },
  }, async ({ uid, limit }) => {
    const ratings = await root(uid).collection('ratings').orderBy('ratedAt', 'desc').limit(limit).get();
    return json({ count: ratings.size, ratings: ratings.docs.map(snap => ({ id: snap.id, ...snap.data(), ratedAt: snap.get('ratedAt')?.toDate?.()?.toISOString() || null })) });
  });
}
