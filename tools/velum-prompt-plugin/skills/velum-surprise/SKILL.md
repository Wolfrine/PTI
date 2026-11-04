---
name: velum-surprise
description: Use when the owner wants a randomly selected sensual scene prompt, a surprising Velum image, or to rate/review a previous Velum Scene Lab generation.
---

# Velum Scene Lab — surprise and rating workflow

This is an independent, non-personalized creative experiment. Use only reference images or preferences actually supplied in the current project or turn. Do not import memories or photographs from other projects. All image subjects must be consenting adults; never make a person appear underage, nor manufacture an intimate image of a person without their permission.

## Pick

1. Use the **PTI Apps** connection already attached to this plugin. Call `pti_apps_list` and `pti_app_context({appId:'velum'})` to establish the authenticated owner's uid and verified Velum Firestore root. Dedicated tools, when exposed, are `velum_prompt_pick`, `velum_prompt_rate`, and `velum_prompt_feedback`. **Their names may appear in context while the ChatGPT tool catalog still omits them.** If omitted, immediately use the working generic Firestore tools following the fallback below. Never ask the owner to refresh tools when that fallback is available; do not open a second MCP connection.
2. Prefer `velum_prompt_pick` for every fresh concept if callable: it makes an actual server-side random draw, excludes recent repeats and saves a `selectionId`.
3. Otherwise run the **Firestore pick fallback**, saving the result before generating:
   - Let `R` be the exact owner-scoped root returned by `pti_app_context('velum')`, of the form `users/{verified uid}/velumPromptData/workspace`. Do not guess a uid, use another project's memory, or use arbitrary document paths.
   - Call `firestore_get_document({path:R})`. Its fields are at the **top level**, including `promptIds`, `recentPromptIds`, `selectionCount`, and `updateToken`. Derive candidates as distinct valid `vp-###` IDs in `promptIds` excluding `recentPromptIds`; if none remain, use all valid IDs. Do not query all 100 prompt documents.
   - Draw a genuinely varying, uniform index with a code/runtime random-number generator (for example Node `crypto.randomInt(candidates.length)` or JavaScript `Math.floor(Math.random()*candidates.length)`); **do not choose a favorite or always the first item**. Read `firestore_get_document({path:R+'/prompts/'+id})`. Require `enabled===true` and a nonempty `prompt` string. If invalid, exclude that ID and redraw, or report corrupted catalog if no valid candidates.
   - Generate a fresh UUID v4 for `selectionId` using the runtime (e.g. Node `crypto.randomUUID()`; if cryptographic APIs are unavailable, construct a valid UUID v4 from fresh runtime random draws), and capture the actual current ISO timestamp. Compute `nextRecent=[id,...recentPromptIds.filter(x=>x!==id)].slice(0,15)`.
   - Call one **atomic** `firestore_batch_write` containing (a) `create` at `R+'/selections/'+selectionId` with `{promptId:id,promptVersion:prompt.version||1,promptTitle:prompt.title,status:'selected',selectedAt:<ISO time>,source:'velum-prompt-lab-fallback'}`, and (b) `update` at `R`, using its **exact** `expectedUpdateToken`, with `{recentPromptIds:nextRecent,selectionCount:previousSelectionCount+1,lastSelectedAt:<same ISO time>}`. Never report success before the batch confirms it. On a precondition conflict, re-read `R` and redraw/retry once; never create an orphaned selection.
4. Preserve `selectionId`, `promptId`, `promptVersion`, exact stored `prompt`, and `title` in the conversation. Do not invent a prompt ID or silently substitute a preferred scenario. If neither dedicated nor generic Firestore tools are callable, explain the actual missing capability.
5. If the user asks for prompt-only, show the prompt and its ID. Do not generate or ask for an image rating.

## Generate

1. If the user requests an image, pass the returned scenario to the available image generation tool with the current project's supplied reference images, if any. Preserve their face, distinctive physical characteristics, natural proportions and intended adult appearance. Do not silently invent a different person or use unrelated saved references.
2. The catalog scenarios are grounded, candid, sensual adult photography with believable garment tension, body movement, camera perspective and lived-in details. The sensation is created through the scene and realistic contour expression, not an anatomical exaggeration or generic glamour background. Respect the user's image preferences, permissions and the image tool's limits.
3. Only after an actual image is returned, show it, label the selected prompt ID, and ask: `Sir, rate this image 1–5? You can also say what worked or failed.` Keep the `selectionId` available for the response. Do not record approval, preference, or a rating from silence, a view or a download.

## Save feedback

1. When the owner supplies a 1–5 rating for an **actual generated image**, prefer `velum_prompt_rate` with the saved `selectionId`, exact integer `rating`, and verbatim feedback (if offered). Supply `imageRef` only if a stable identifier exists; an in-chat image without one still permits a prompt-linked rating.
2. If that dedicated tool is absent, use the **Firestore rating fallback**. Read `R+'/selections/'+selectionId` and obtain its `promptId`, `promptVersion`, `promptTitle` and `updateToken`. Check `R+'/ratings/'+selectionId` first: if already saved, return existing feedback only if identical, otherwise do not overwrite. Capture the real current ISO time. Call `firestore_batch_write` with (a) `create` at `R+'/ratings/'+selectionId` using `{selectionId,promptId,promptVersion,promptTitle,rating,feedback:<verbatim text or ''>,imageRef:<stable ref or ''>,source:'owner-explicit-image-rating',ratedAt:<ISO time>}`, and (b) `update` at `R+'/selections/'+selectionId`, using its `expectedUpdateToken`, with `{status:'rated',ratedAt:<same ISO time>}`. Only confirm after the atomic batch reports success. No inferred ratings, image bytes, or unrelated writes.
3. If multiple images were created from one prompt, select a fresh prompt selection for each separately rated generation, or ask which image the rating refers to. Never reuse an unrelated selection ID. If a rating arrives in a separate chat with no known `selectionId`, query the owner's recent **unrated** selections and ask for identification when ambiguous; do not guess.
4. Ratings are immutable per selection. If the owner wants to correct an already saved rating, explain that the current tool preserves original feedback and does not silently overwrite it; ask before any correction workflow.

## Review and iteration

- On `show feedback`, `what worked`, or `review the experiment`, prefer `velum_prompt_feedback` with a bounded limit. When that tool is absent, call `firestore_query({collectionPath:R+'/ratings',limit:100})` and summarize actual explicit scores/comments. Generic fallback timestamps are ISO strings; dedicated-tool timestamps serialize as ISO too. Never infer preference from unscored generations.
- Future prompt revisions are a separate approved experiment. Do not modify catalog prompts or infer preferences solely from the prompt's selection frequency.
- The images stay wherever the generating tool or the owner saves them. The PTI MCP currently stores prompt text, selections and explicit ratings, not Google Drive image bytes or existing Velum Drift/Browse votes.
