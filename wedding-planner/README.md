# Mahima Mishra & Mayank Awasthi — Wedding

## Application

The dedicated invitation and family workspace are implemented in this directory. The wedding Hosting target is `wedding`, using the existing `pti-app-2ab59` Firebase project and the separately named site `mahima-mayank`. See [delivery and verification](IMPLEMENTATION.md) for the current release status and evidence, and [maintainer instructions](DEVELOPMENT.md) for local use, access and publication.

Live: [guest invitation](https://mahima-mayank.web.app/) · [private family workspace](https://mahima-mayank.web.app/family/).

The public page is a Botanical save-the-date invitation: names, the **planned** 18–20 January window, original imagined floral scenery, and a centred countdown to **18 January 2027 at midnight IST**. This is the start of the planned date, not a ceremony time. Event times, venues and a contact still require approval. The private home presents a compact function programme and four entrances: **Catering, Guests, Stays & Travel, Tasks & Decisions**. Read a record first, then edit the relevant detail. Admins manage signed-in accounts through **Family account menu → Manage family access**; new accounts await approval. Your protected owner account remains Admin. Local preview fixtures are synthetic and excluded from production.

The invitation opens gently with a small animated botanical accent, a remembered Pause/Resume choice and support for reduced motion. **Invitation ↗** remains visible in the family header on desktop and phone; **Family workspace** returns to the plan. Sign-in is remembered on the same browser/device until manual sign-out, subject to browser storage and Firebase credential validity. Private planning still requires a connection and current membership approval.

## Purpose

The illustrated catering extension uses compact Botanical food-family cues beside the complete recorded proposals, with dish/category search and selected-pair comparison. Artwork is indicative; unclear names retain their verification markers. The same wedding app can be installed from the invitation or family account menu. Only the public invitation is saved offline; family planning needs a connection. Sharing uses a dedicated versioned image. See [extension evidence](design/illustrated-pwa/BRIEF.md) and [offline behavior](design/illustrated-pwa/PWA.md).

One personal digital home for Mahima and Mayank's wedding: **a welcoming invitation for guests** and **a private, coherent planning space for family**. It should reduce uncertainty without turning the celebration into a generic project-management product.

| Experience | Audience | Promise |
| --- | --- | --- |
| [Guest experience](guest-experience/README.md) | Guests | A warm, useful living invitation with only approved celebration details. |
| [Family workspace](family-workspace/README.md) | Authorized family | Shared clarity on the complete celebration, arrangements, decisions and open questions. |

## What we currently know

- **Bride:** Mahima Mishra. **Groom:** Mayank Awasthi (names supplied directly by the family).
- **Planned celebrations:** **18–20 January 2027**, reaffirmed directly by the family in the implementation brief. The detailed invitation programme and exact ceremony times still require confirmation.
- **18 January:** Breakfast, lunch, high tea and **Sangeet evening/dinner** are listed.
- **19 January:** Breakfast, a **Carnival** food section, lunch and high tea are listed. The Carnival's function status/time is not yet established.
- **20 January:** Morning breakfast is listed; **guest tiffin boxes** are an open question.
- A substantial **Reception** menu exists, **without a written date**. Its placement must not be guessed.
- The intended overall planning journey is **baraat arrival through vidai**; ceremony dates, order, and times are still unconfirmed.
- **Website naming preference:** `mahima_mayank.web.app` (requested by the family). Firebase Hosting does not allow `_` in site IDs. The closest valid hyphenated identity, `mahima-mayank.web.app`, is now provisioned and live.
- **Venues, city, invitation wording, event timings, guest counts and accommodation** have not yet been supplied. The requested countdown uses the labelled start of 18 January as an implementation choice; no exact ceremony time is inferred. Final family visual acceptance is still pending.

The [**Wedding Record**](WEDDING_RECORD.md) preserves the initial timeline, complete proposed menus, provenance, ambiguities and unresolved details. The reviewed release imports it once into the private shared workspace; after successful activation, Firestore is the operational record. An existing workspace is never overwritten by later deployments. Neither this initial transcript nor its import is proof of approved menus, reservations or public invitation details.

## What matters

**A celebration rather than a generic management product.** The character of the occasion should lead the experience; the product should not accumulate features for their own sake.

**One connected story.** Dates, events, food, guests, locations, logistics and responsibilities must make sense across all three days.

**Thoughtful hospitality.** Assess meals and live stalls together. Preserve welcome and familiarity while identifying avoidable duplication, heavy combinations, and missing variety; do not mistake all repeated staples for errors.

**Clarity and trust.** Distinguish proposed, confirmed, changed and unresolved information. Do not publish draft internal material to guests. Family decisions outrank assumptions and generic wedding templates.

## Supporting context

- [Wedding Record](WEDDING_RECORD.md) — **live wedding facts, timeline, draft menus and open decisions**.
- [Guest experience](guest-experience/README.md) and [family workspace](family-workspace/README.md) — the two audience intents.
- [UI/UX concept references](design/concepts/README.md) — four original image prototypes; Romantic Botanical is the selected visual basis, not a feature or wedding-fact checklist. The [current design record](design/botanical/BRIEF.md) supersedes the rejected earlier design.
- [Domain research](research/README.md) and [evaluation references](evals/README.md) — optional supporting knowledge, **not facts about this wedding or a required feature backlog**.

This belongs within **Wolfrine/PTI**, reusing the existing **PTI Firebase project** with the separately named Hosting site **mahima-mayank**. The live website identity is **Mahima and Mayank**; no separate repository or Firebase project was created.

After activation, record evolving arrangements in the shared family workspace. Keep this initial record as provenance and update audience documentation when intent changes. Public snapshots are separately reviewed release artifacts, not an automatic mirror of private edits.
