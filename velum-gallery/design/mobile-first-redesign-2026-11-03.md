# Velum mobile-first redesign — 3 November 2026

## Intent and baseline

The owner primarily uses Velum on a phone. Drift and Browse were already liked before Studio arrived, so this redesign protects their image display and gesture behavior while reducing later interface chrome. Source comparison with pre-Studio `a82bbe3` confirmed that the core gallery styles, gesture implementation, heart effects and feed logic were unchanged; the regressions came from new global navigation overrides, persistent collection controls, and folder chips.

## Decisions

- Preserve Drift's full-bleed ambient image stage, contained portrait behavior, gestures, and the natural-aspect Browse masonry.
- Make collection filters contextual 44px disclosures in Drift and Browse. Keep private/reference folder actions and reversible removal in the existing details dialog. Browse labels appear only on focus or hover.
- **Superseded (owner correction, 3 November):** the warm editorial palette was rejected. Velum must use its original rose-black **dark-only** identity in every tab, Studio and all dialogs, on mobile and desktop. Retain the form-first/no-job and image-first/active-job layout improvements. Never crop generated output.
- On a phone, show model, verbatim prompt, references/settings, consent, and Generate without an empty result preview consuming the initial viewport. Keep selected references compact with an accessible management disclosure.
- Make Creations image-first with secondary filters and Drive quality-record controls in a disclosure. Keep all original filters and recovery functions.
- Keep PIN, Google Drive authentication, Quick Exit, PC approval, worker queue, image integrity verification, and original/effective prompt contracts unchanged.

## Independent visual gate

Three distinct concepts (Editorial Atelier, Cinematic Lightbox, Spatial Workbench) were explored; Editorial Atelier was chosen with a practical Studio layout and cinematic image treatment reserved for Drift. A separate critic reviewed actual Chromium screenshots of production HTML/CSS with synthetic, labeled media at 360×800, 390×844, and 1440×900. The final screenshots were captured after the 450ms route transition settled.

**Current verdict supersedes these historical scores:** the owner subsequently rejected the light Studio and desktop palette. The dark-only correction restores the inherited rose-black surfaces without discarding the mobile flow. The older scores apply only to the previous light candidate, not the new dark correction.

Dark correction verification: actual synthetic Chromium fixtures at 360×800, 390×844 and 1440×900 showed dark Create, Creations, settings, PC dialog, picker, desktop sidebar and header; the image-first layouts and protected Browse presentation were preserved. Independent critic verdict: **pass** (palette consistency 9.2, mobile legibility 8.5, artwork hierarchy 8.9, desktop coherence 8.6; overall 8.8/10). Technical QA: 147/147 tests passed, PTI build passed with unrelated pre-existing warnings, no fixture page errors or horizontal page overflow. Real authenticated Drive and PC inference remain unverified; only owner can accept the corrected palette.

| Mobile criterion | Critic score /10 |
| --- | ---: |
| Artwork focus and truthful presentation | 8.8 |
| Responsive composition and task flow | 8.3 |
| Visual craft and readability | 8.1 |
| Private creative atmosphere | 8.1 |

The independent gate is provisional: rendered fixtures do not establish real owner preference or signed-in end-to-end behavior. All viewports showed no horizontal overflow; 360px Studio with two references requires ordinary vertical scrolling to reach Generate, with no blocked action.

## Verification and boundaries

- `node --test velum-gallery/tests/*.test.mjs` with a local Chromium test-only launcher adapter: **147/147 passed**, including the 3 browser reference-picker/pose tests.
- `npm run build` in `pti-app`: passed (with existing unrelated budget warnings).
- `redesign.css` parsed successfully; `git diff --check` clean; dynamic collection disclosure, four-item navigation, reference-management disclosure, and picker were visually exercised with synthetic media.
- The browser fixtures used no real personal images, Firestore, Google Drive, owner PIN, or inference worker. Signed-in Drive, real device gestures, PIN reset, and real generation are **not certified by this visual review**. Functional tests are regression evidence, not owner acceptance.
- No UI change is permitted to rewrite source prompts, invent a generated result, or silently delete a media original.

## Release discipline

The new stylesheet loads after the established gallery styles and is included in the versioned service-worker shell. The hosting workflow verifies it against the released asset. Keep the redesign reversible as one focused mainline commit; verify the deployed URL after the workflow completes.
