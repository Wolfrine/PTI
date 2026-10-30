# Studio 2.0 design record

Current verdict: **agent-reviewed UI candidate; owner acceptance pending**. This
record supersedes the vertically stacked Studio composition in the first pass;
the original media, PIN, Quick Exit and gallery behavior remain product contracts.

Studio is an **Operate** surface. Its primary object is the image being made:
canvas first, compact model/prompt/Generate beside it on desktop and below it on
phone. Create is a working surface; Creations is a separate private archive.
PC enrollment, advanced settings, provenance and original metadata are disclosed
when needed. Raw prompts are sent verbatim; the owner judges generated images.

Central snapshot: plugin 0.2.0, Central base
`653247d6e4601b136fcbb51306c9a72c29e691e7`, Visual Design Director packaged digest
`8266bd6e6b5838ce1076cb3dadcc2dabdde640fdf0f7dd3b6f37015045e78221`.
Designer and independent critic are separate agents; the parent handles the
desktop/mobile checkpoints and functional QA. No model override capability was
requested or applied; no stronger-model review is invented.

## Direction evidence retained from the interrupted pass

The previous designer/critic inspected the existing live Studio and working
Adobe Firefly, Krea and Midjourney reference screenshots. Their relevant mechanisms
were a dominant working image, adjacent or docked direct instructions, and a
separate history surface. Their branding, generic marketing content and automatic
prompt transformation were not design requirements.

Reference pages retained in the task browser:

- Adobe Firefly: <https://helpx.adobe.com/firefly/web/unified-generation-and-editing-experience/generate-and-edit-content.html>
- Krea: <https://www.krea.ai/blog/how-to-generate-images-with-style-references-in-krea>
- Midjourney: <https://docs.midjourney.com/hc/en-us/articles/33390732264589-Creating-on-Web>

Three materially different compositions were rendered at desktop 1920×1080 and
phone 390×844 using the same explicitly provisional reading-room SVG:
**A / Worktable**, canvas plus adjacent composer;
**B / Lightbox**, canvas plus floating instruction dock;
**C / Folio**, narrow instrument rail plus image.
The independent comparison selected A. Its image/composer relationship best
preserved a calm working canvas without covering output or turning phone controls
into an instrument dashboard. The ignored comparison fixture remains
`.velum-qa/studio2-directions.html?direction=a|b|c` on loopback only.

These are inherited, reported observations from the interrupted pass, not a new
claim that the finishing agent repeated the reference research. The new finishing
reviews below inspect the actual preserved candidate and corrections.

## Critical dimensions and observable conditions

1. **Canvas and task clarity:** the image dominates a result state; model, direct
   prompt and Generate form one legible action group; empty states invent no image.
2. **Create/archive distinction:** mode navigation stays clear; history is a
   thumbnail grid with bounded loading, not a twelve-job stack inside Create.
3. **Velum coherence:** rose-black materials, quiet Georgia headings and existing
   app navigation connect Studio to Drift/Browse without copying a reference brand.
4. **Mobile control fit:** 390px layout, reduced-height keyboard surrogate, dialogs,
   disclosures and long prompts remain scrollable, readable and keyboard reachable.
5. **Truthful status and provenance:** installed, online, unconfirmed, queued,
   failed and incomplete-upload states differ; local original, protected remote
   copy and explicitly saved Drive file are never conflated.

## Implementation/review cycles

| Round | Meaningful candidate/state | Finding and resulting action | Evidence/status |
| --- | --- | --- | --- |
| 1 | Selected Worktable composed into the actual Studio shell; Create and Creations separated | Previous critic found the phone empty canvas too tall, pushing the primary action down | Inherited actual desktop/phone renders from the interrupted pass; no new score invented |
| 2 | Shorter empty-state canvas and compact phone composer | Previous independent critic reported all dimensions at least 8.1; this was an intermediate verdict | Inherited reported R2 review, not the final gate |
| 3 | Error archive tile, interrupted input upload and privacy cleanup | New critic found a false busy marker on stopped archive records; changed to a static dash. Incomplete uploads now offer same-job retry/cancel, with no inference until all inputs arrive. Lock/auth/pagehide clear pending image bytes and Drive flows | Actual 1440×900 and 390×844 history/upload renders; critic: canvas 8.4, modes 8.4, coherence 8.2, mobile 8.3, truth 8.4; overall 8.3. Parent personally viewed desktop/mobile candidate |
| 4 | Empty, references, phone offline, PC offline queue, resource failure and Drive grant instruction | Parent requested larger phone support text; hints/consent/details now use 12px and primary disclosure targets 44px. Critic found green PC-ready status when the phone could not confirm it | Actual 390×844 state renders; final status correction carried into R5 |
| 5 | Final archive144, reference detail, offline/unconfirmed and reduced-height prompt states | Changed disconnected-phone badge and secondary PC dialog to neutral unconfirmed status. Legacy H paths are expected locations, not a verified file claim; remote availability distinguishes a manifest from a decoded, SHA-verified original. Added focus scroll padding after the critic found Generate partly under the fixed navigation at keyboard height. Added persistent Close/Quick exit controls inside native dialogs after the critic identified the inert background header | Actual desktop 1440×900, mobile 390×844 and keyboard surrogate 390×500. Final critic: canvas 8.5, modes 8.4, coherence 8.3, mobile 8.4, provenance 8.5; overall 8.4. Scrolled mobile modal retains both controls; its Quick Exit removes private fixture content. Parent personally inspected desktop result and phone reference details; final toolbar checkpoint is part of parent delivery |

All layout fixtures are clearly labelled **PROVISIONAL SVG · NO INFERENCE**.
They are not generated results, owner feedback, authenticated production reads,
or proof that a Drive upload completed. Browser screenshots are retained in the
task session; the browser tool has not supplied a supported filesystem screenshot
export, so no invented PNG evidence paths are listed. No private image is added to
the repository or Hosting.

## Separate QA and remaining acceptance

The archive uses 36-record cursor pages and at most six concurrent small JPEG
thumbnail requests. Full original chunks load only for the selected image. Kept
and Saved query their own records; model/date/unsaved-draft secondary filtering
honestly applies to fetched pages. A 144-record fixture checks the long archive.

The local integration fixture imports the actual app, Studio, Stats, PIN and Drift
code with in-memory Firebase and Drive substitutes. Twenty-six assertions passed:
navigation/timer/PIN/Quick Exit, owner approval/revoke, seven-day offline queue,
verbatim raw prompts, sign-out cleanup, actual 144-record cursor paging, lazy
thumbnails (at most six concurrent reads, no archive full-PNG reads), and interrupted
reference upload retry using the same immutable job and source provenance, plus
Quick Exit from PC/Settings/Details native dialogs with neutral-screen/private-DOM
cleanup and PIN restoration. No browser console errors or warnings occurred. Its
only PNG is the successful **synthetic technical two-reference** local smoke
output, served on loopback, with fixture metadata clearly labelled. This is not a
new inference run. No other private media is used by these finishing fixtures.
It cannot prove Google consent, the production owner-device grant or a real
phone/Firebase/PC round trip.

The finishing designer personally viewed desktop result 1440×900, mobile empty
and 144-record history 390×844, and the long verbatim prompt at 390×500. Keyboard
Tab traversal focused Generate with its bottom at 357.5px, above navigation at
424px; its entire focus ring was visible. No horizontal overflow was present.
This is browser viewport QA, not a claim that a physical phone keyboard was used.
All 79 Velum unit/contract tests, module syntax checks and `git diff --check`
passed after the final toolbar correction. The broader worker/security/PTI/build
and deployment checks remain the parent's separately reported evidence.

The parent personally checked the final persistent toolbar at desktop 1440×900
and found the image still dominant. Its prior phone 390px checkpoints covered
references, archive and details; the independent critic inspected the final
scrolled mobile toolbar. The parent reported a later viewport override as
ineffective, so this record does not invent an additional parent phone screenshot.

Actual worker/reference conditioning, security rules, build, CI and live asset
verification are reported by the parent delivery. The owner's explicit phone-side
Google folder grant and any pending PC enrollment are genuine remaining human
steps. A physical phone keyboard and the owner's visual acceptance remain pending.
