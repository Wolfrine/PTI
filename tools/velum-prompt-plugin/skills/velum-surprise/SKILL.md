---
name: velum-surprise
description: Use when the owner wants a randomly selected sensual scene prompt, a surprising Velum image, or to rate/review a previous Velum Scene Lab generation.
---

# Velum Scene Lab — surprise and rating workflow

This is an independent, non-personalized creative experiment. Use only reference images or preferences actually supplied in the current project or turn. Do not import memories or photographs from other projects. All image subjects must be consenting adults; never make a person appear underage, nor manufacture an intimate image of a person without their permission.

## Pick

1. Use the attached `pti-velum-prompts` MCP connection. On a first contact, call `pti_apps_list`, then `pti_app_context({appId:'velum'})` if both are exposed. Its dedicated tools are `velum_prompt_pick`, `velum_prompt_rate`, and `velum_prompt_feedback`.
2. Call `velum_prompt_pick` for every fresh concept. This is an actual server-side random draw from owner-scoped Firestore and saves a `selectionId`. Never select by hand from a cached catalog, invent a prompt ID, or substitute a preferred scenario for the selected one. The server avoids the most recently picked prompts.
3. Preserve `selectionId`, `promptId`, `promptVersion`, exact returned `prompt`, and `title` in the current conversation. If the tool fails or is unavailable, report the actual failure, and request connection/refresh. Do not pretend a random draw succeeded.
4. If the user asks for prompt-only, show the prompt and its ID. Do not generate or ask for an image rating.

## Generate

1. If the user requests an image, pass the returned scenario to the available image generation tool with the current project's supplied reference images, if any. Preserve their face, distinctive physical characteristics, natural proportions and intended adult appearance. Do not silently invent a different person or use unrelated saved references.
2. The catalog scenarios are grounded, candid, sensual adult photography with believable garment tension, body movement, camera perspective and lived-in details. The sensation is created through the scene and realistic contour expression, not an anatomical exaggeration or generic glamour background. Respect the user's image preferences, permissions and the image tool's limits.
3. Only after an actual image is returned, show it, label the selected prompt ID, and ask: `Sir, rate this image 1–5? You can also say what worked or failed.` Keep the `selectionId` available for the response. Do not record approval, preference, or a rating from silence, a view or a download.

## Save feedback

1. When the owner supplies a 1–5 rating for the actual generated image, call `velum_prompt_rate` using the saved `selectionId`, exact integer `rating`, and their feedback verbatim (if offered). Supply an `imageRef` only if an actual stable image identifier is available; an in-chat image without one still permits a prompt-linked rating.
2. Confirm a saved rating only if the tool returns `ok:true`. If multiple images were created from one prompt, select a fresh prompt selection for each separately rated generation, or ask which image the rating refers to. Never reuse an unrelated selection ID.
3. Ratings are immutable per selection. If the owner wants to correct an already saved rating, explain that the current tool preserves original feedback and does not silently overwrite it; ask before any correction workflow.

## Review and iteration

- On `show feedback`, `what worked`, or `review the experiment`, call `velum_prompt_feedback` with a bounded limit and summarize patterns in actual explicit scores/comments, separating subjective taste from objective faults.
- Future prompt revisions are a separate approved experiment. Do not modify catalog prompts or infer preferences solely from the prompt's selection frequency.
- The images stay wherever the generating tool or the owner saves them. The PTI MCP currently stores prompt text, selections and explicit ratings, not Google Drive image bytes or existing Velum Drift/Browse votes.
