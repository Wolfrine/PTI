# Velum mobile-first redesign — 3 November 2026

## Intent and baseline

The owner primarily uses Velum on a phone. Drift and Browse were already liked before Studio arrived, so this redesign protects their image display and gesture behavior while reducing later interface chrome. Source comparison with pre-Studio `a82bbe3` confirmed that the core gallery styles, gesture implementation, heart effects and feed logic were unchanged; the regressions came from new global navigation overrides, persistent collection controls, and folder chips.

## Decisions

- Preserve Drift's full-bleed ambient image stage, contained portrait behavior, gestures, and the natural-aspect Browse masonry.
- Make collection filters contextual 44px disclosures in Drift and Browse. Keep private/reference folder actions and reversible removal in the existing details dialog. Browse labels appear only on focus or hover.
- Treat Studio as a distinct, warm editorial work surface: form first when no selected job; actual image, queued state, or failure first when one exists. Never crop generated output.
- On a phone, show model, verbatim prompt, references/settings, consent, and Generate without an empty result preview consuming the initial viewport. Keep selected references compact with an accessible management disclosure.
- Make Creations image-first with secondary filters and Drive quality-record controls in a disclosure. Keep all original filters and recovery functions.
- Keep PIN, Google Drive authentication, Quick Exit, PC approval, worker queue, image integrity verification, and original/effective prompt contracts unchanged.

## Independent visual gate

Three distinct concepts (Editorial Atelier, Cinematic Lightbox, Spatial Workbench) were explored; Editorial Atelier was chosen with a practical Studio layout and cinematic image treatment reserved for Drift. A separate critic reviewed actual Chromium screenshots of production HTML/CSS with synthetic, labeled media at 360×800, 390×844, and 1440×900. The final screenshots were captured after the 450ms route transition settled.

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
