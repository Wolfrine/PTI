# Mahima & Mayank — design record

**Owner verdict: REJECTED.** The owner rejected this folded-invitation direction for poor visual character and overloaded journeys. The active replacement contract is [Botanical redesign](botanical/BRIEF.md). The record below is historical and does not establish current acceptance.

Central 0.1.0; base ba1235fe7b220842778414f3f70fca38e7df4c53. Designer: wedding_designer. Independent critic and parent maintain acceptance separately. Current verdict: unverified.

## Product and truth

A personal invitation for guests, and a calm working home for family. Public facts: Mahima Mishra, Mayank Awasthi, planned celebrations 18–20 January 2027. No approved event programme, time, venue, contact, photographs, exact countdown target or story. The family workspace may show proposed catering-led records with status clearly visible. Private notes never appear on the invitation. The invitation's intended eye path is names → dates → celebration information. The family path is pending decisions → responsible people → edit the relevant record.

At 100ms: a personal invitation, led by the names. At 1s: two people, three January days. At 5s: where to find celebration details. These are review hypotheses, not measured attention.

## Critical visual dimensions declared before scoring

1. Personal invitation identity: names are the dominant object; a coherent typographic/graphic idea carries through invitation and family interior without stock couple imagery or invented cultural identity.
2. Useful hierarchy and readability: a guest can locate dates and programme; family can identify unresolved status, owner and edit action; readable contrast and text size without identical competing cards.
3. Desktop/mobile compositional craft: intentional spacing, line wraps and proportional typography at 1440px and 390px; no clipped controls, horizontal overflow or collapsed hierarchy.

Required states: guest full page and sparse programme; family login, overview, celebration/menu, guest/hospitality, arrangements, edit form, empty list, long text, failed save, loading and access denied. Reduced motion preserves all content.

## Inspected visual references

Actual image assets retained in references/; source screenshots are reference-only, never shipped in public assets.

| Reference | Useful mechanism and target | Do not copy |
|---|---|---|
| [Zazzle burgundy/cream invitation](https://www.zazzle.com/elegant_burgundy_cream_gold_wedding_invitation-256471266991300153), heirloom.jpg | Paper invitation hierarchy: ample margins, names as ceremony, small supporting detail. Guest opening. | Exact type, gold low contrast, sample wording or names. |
| [Riley & Grey schedule](https://www.rileygrey.com/wedding-websites/24-wedding-website-welcome-message-examples-you-can-use), schedule.png | Dramatic illustrated opening gives way to practical event information; title/detail separation. | Generic florals, invented travel photos, horizontal timeline on small screens. |
| [Riley & Grey editorial](https://www.rileygrey.com/), editorial.png | Names stay dominant on desktop and mobile; strong typographic scale and editorial rhythm. | Sample couple photograph or story; navigation overproduction. |
| [Basecamp event planning](https://3.basecamp-help.com/article/826-non-profits), working-product.png | Clear working lists with status, owner and action physically close. Family interior. | Product chrome, kanban-like equal cards, business terminology. |

## Direction gate

Three comparable concepts in exploration.html. Content uses known names/dates; family interior uses documented open decisions and no invented people or values. A: Folded invitation — cream paper and pomegranate, centred names with an interlaced typographic mark, compact ledger-like family. B: January journal — asymmetric editorial serif and cobalt, horizontal name/date composition, spacious numbered working lists. C: Woven celebration — warm ochre/ink, geometric framing and serial date columns, denser tabular family. Await critic/parent selection before final implementation.

## Selected direction and implementation evidence

Parent and independent critic selected A as the credible basis. The resulting invitation uses self-hosted Cormorant Garamond and DM Sans (OFL licenses in public/fonts), pomegranate ink, paper space and restrained letterpress-like framing. No stock or fabricated portraits, location photography or cultural motifs. The family environment keeps the same ink/paper/type while using practical lists and familiar form controls.

Font source: Google Fonts repository ofl/cormorantgaramond and ofl/dmsans variable TTFs. Self-hosted WOFF2 assets preserve the font outlines/variable weights and subset the currently used Latin characters (U+0020–00FF, U+2000–206F, rupee and UI symbols), using fontTools4.67.0/brotli. Combined font transfer is129KB rather than1.44MB TTF. If approved language later needs additional glyphs, regenerate a broader subset before publication; system fallback is currently available. OFL license texts remain alongside assets.

All retained screenshots were captured in a real local Chromium1223 render at 1440×1000 and390×844, with fonts ready. The browser plugin inventory was empty, so shell Playwright provided rendered screenshots and interactions. Designer personally viewed the direction comparison, mobileA, cycle1 guest/overview, cycle2 menu/editor/overview, cycle3 menu/editor, cycle4 menu/arrangements and cycle5 public/login/error images. Critic and parent maintain independent verdicts.

| Cycle | Substantive implementation or state verified | Evidence prefix |
|---|---|---|
| 1 | Full-width invitation, exact planned-date qualifier, shared family identity and actual overview | cycle1-guest / overview |
| 2 | Consolidated unknown public details; family reading sizes; real menu disclosure and edit form | cycle2-guest / overview / menu / editor |
| 3 | All mobile sections visible in2×2nav; grouped long form with persistent header/actions; dense synthetic menu saved via UI; mobile account menu | cycle3-guest / overview / menu / editor / editor-extras |
| 4 | Menu category hierarchy + desktop columns; full-width mobile menu; long household/guest/arrangement records, nightly stay counts and person-level attendance | cycle4-guests / empty / arrangements / menu / attendance |
| 5 | Clear-search recovery, shorter corner feedback; failed validation and offline saves preserve input; empty decisions, account menu, signed-out/loading/unavailable states; final reduced-motion invitation | cycle5-guest / login / overview / validation / offline / empty-overview / search-empty / account / loading / unavailable |

Each prefix has -1440.png and -390.png. All family data shown in local demo renders is synthetic, explicitly labelled; it is not wedding truth. Dense menu and long-content fixtures were entered through the UI and remained in that browser tab. Loading/unavailable screenshots use a browser test interception holding/aborting the Firebase auth SDK import. Auth denial and live collaboration acceptance belong to the parent's emulator/live QA, not these synthetic design images.

Current owner verdict remains unverified; no owner visual approval is inferred from implementation authorization. See CRITIQUE.md for independent visual findings and parent completion record for QA/checkpoints.
