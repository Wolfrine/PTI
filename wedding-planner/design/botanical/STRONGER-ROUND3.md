# Botanical — stronger review, implementation round 3

15 October 2026. Supplemental independent visual review by `botanical_round3`, actual assigned capability **gpt-6-astra / high**. Central **0.1.0**, source **ba1235fe7b220842778414f3f70fca38e7df4c53**. Candidate: dirty working tree on `codex/wedding-botanical`, HEAD `2fe53abd0cebd9c336e65fcb10793f8939320611`. No implementation edits, tests, commits, deployment or live record writes by this reviewer. Only this report was added.

## Findings and next corrections

1. **Responsibilities remain buried on the phone.** `cycle2-tasks-390.png` places seven large decision cards before Responsibilities and its Add task action, around 1,740px down. Current `src/family.ts:37` still renders decisions followed by arrangements as separate columns, without a section shortcut. This retains journey burden in one of the four principal destinations. Add immediate Decisions / Responsibilities navigation and compact the decision rows while retaining status and owner. This is the highest-priority correction; rerender current desktop/390/360 Tasks after it. The visual evidence here is retained round 2, corroborated by current source, not a claimed fresh round 3 screenshot.
2. **The comparison view is a transcript, with weak comparative utility.** `cycle3-compare-390.png` is **390 × 7,910px**; its desktop counterpart is **1440 × 5,181px**. Every complete menu appears sequentially on phone, while unequal desktop card heights leave major blank spaces. Repeated dishes across days require substantial scrolling and memory. Preserve the full source text, but give the user a way to choose meals, jump by day or compare a category. The visible all-menu reading view alone does not satisfy a strong comparison journey.
3. **Catering's phone controls delay the compact records.** In `cycle3-catering-{390,360}.png`, the first date panel begins around **545px**, with Breakfast around **628px**. Title/description, standalone Add button, two lines of date filters and a separate Compare row each consume vertical space. Keep the improved date-grouped service rows; condense their preamble and group the actions so actual meals appear substantially earlier. Avoid solving this by making the already legible service text smaller.

## Independent visual judgment

| Critical dimension | Score | Visible basis |
|---|---:|---|
| Botanical invitation identity | **8.8/10** | Original coherent floral canopy, warm depth, quiet names and restrained blush/sage connect directly to Romantic Botanical. Desktop feels integrated; 390/360 recomposes the names above the scene cleanly. This is a material change from the rejected empty border invitation. |
| Task hierarchy and journey clarity | **7.5/10** | Home's concise programme and four destinations strongly follow Editorial Ivory's useful mechanism. Complete menu reading precedes secondary logistics; the editor is focused. Buried tasks and the long comparison journey still conflict with the owner's reduced-burden direction. |
| Desktop and mobile craft | **8.1/10** | Consistent serif/sans pairing, readable menu sections, stable 360px detail heading, harmonious materials and deliberate mobile image crop. Long list composition and desktop comparison gaps remain the main craft weaknesses. |
| Overall | **8.0/10** | Credible direction worth continuing; the lower hierarchy score prevents this pass from establishing acceptance. |

No earlier numerical scores were used. No direction reset is indicated by this pass. The strongest remaining reference gap is **Editorial Ivory's compact working hierarchy**, not lack of floral decoration. Preserve the current guest composition and home architecture while correcting working-list density.

Three generic-risk decisions: destination cards are **justified** because each is a distinct family task; the floral hero is **resolved** through original integrated artwork and a concise truthful public state; repeated oversized task/comparison cards are **defective in the identified long-content states**. Layer decisions: retain imagery, colour and primary typography; refine spacing, long-list composition and contextual navigation. Motion was not observed.

## Evidence and limits

Personally inspected with `view_image`:

- All four originals in `design/concepts/`: `01-romantic-botanical.png`, `02-editorial-ivory.png`, `03-heritage-maroon.png`, `04-contemporary-two-mode.png`.
- Rejected `design/cycle5-{guest,overview}-{1440,390}.png`.
- Current `design/botanical/cycle3-guest-{1440,390,360}.png`, `cycle3-home-{1440,390,360}.png`, `cycle3-catering-{1440,390,360}.png`.
- `cycle3-sangeet-{1440,360}.png`, `cycle3-menu-edit-{1440,360}.png`, `cycle3-reception-390.png`, `cycle3-compare-{1440,390}.png`, `cycle3-future-content-{1440,390}.png`.
- Retained supporting `cycle2-{guests,stay,tasks}-{1440,390}.png`. These show clearly identified synthetic people/logistics, separate stay and travel contexts, and the task-density concern above. They do not constitute fresh round 3 coverage of those states.

Read repo `AGENTS.md`, Botanical `BRIEF.md` and `ARTWORK.md`, Central skill and critic guide/release metadata, UI verification and output-quality skills, `tests/fixtures.mjs`, `tests/botanical-browser.mjs`, and current task/catering/comparison rendering source. Image dimensions were read with `System.Drawing.Image`; no images were altered.

The public invitation shows the permitted names and planned 18–20 January 2027. The future-content render is explicitly synthetic and asserts no programme. Family menu proposals retain visible Proposed status and unclear transcript readings; people/logistics are explicit examples. Artwork is imagined scenery. This review does not authenticate wedding records or confirm proposals.

Attempted `http://127.0.0.1:5177/family/?demo=1#/home` via CUA: `iab` unavailable, and inventory returned `apps:[]`, `browsers:[]`. This supplemental pass therefore inspected retained browser renders rather than independently driving a live page. Parent and primary critic own live verification. The retained menu-editor images show **Reception**, not a Sangeet-specific editor. No claim is made for interactions, keyboard, Back, saving, revocation, motion, accessibility or operational QA. No redundant tests were run. Finish the three corrections, retain fresh affected views, and complete the remaining review/QA gates before agent acceptance; owner aesthetic acceptance remains separate.
