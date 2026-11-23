# Finance ledger and MCP contract

Finance uses the existing account-scoped PTI MCP at **https://pti-firestore-mcp-185802494856.asia-south1.run.app/mcp**. The service pins the verified PTI owner account. Browser reads use the same Firebase project's verified Google identity and owner-only Firestore rules. The browser correction endpoint accepts fresh, revocation-checked Firebase ID tokens from the two Finance Hosting domains.

| Tool | Inputs and durable result |
| --- | --- |
| **finance_context** | Optional month (YYYY-MM), section, limit (1–60), and after cursor. Sections are overview, transactions, reviews, sources, source_windows, balances, recurring and operations. Transactions and reviews require a month. Source windows honor the month when provided. A missing summary is unavailable. Operations returns the Gmail scan status and cursor. The operations section accepts an optional Gmail messageId and returns its current intake edition and next part. |
| **finance_ingest_email** | One sanitized Gmail envelope with immutable messageId, receivedAt, normalized source and sourceType plus ownerScope, parserVersion, coverage, optional inclusive period and up to 20 entries and 10 stocks per part. The response includes per-part outcomes, finalized status and exact replay acknowledgment. |
| **finance_commit_scan** | Immutable bounded Gmail run with runId, inclusive local window, backfill or daily mode, complete/partial/failed status and actual processing counts. Optional nextCursor and required matching expectedCursor advance the date watermark only after a complete scan of a contiguous or overlapping window. A partial scan leaves the cursor in place. |
| **finance_reconcile_month** | One calendar month. Compares the captured canonical event arithmetic with the projection, writes an immutable report version and returns balanced or repaired. The additive `analysisSource` field binds publication to the current immutable report and month revision. An open intake, concurrent revision, oversized month or missing month yields an explicit error. |
| **finance_publish_monthly_analysis** | Publishes a private narrative from the exact `analysisSource`, one to eight typed finding selectors, and up to eight optional source-window IDs. The service validates citations and derives all figures, prose and coverage gaps. A replay returns the original immutable version. |
| **finance_correct_event** | Owner-directed requestId, eventId, expectedRevision and reason with a classification, category, posted/excluded decision or matching duplicateOf link. Updates the event and affected projection in one transaction and writes an immutable revision. Exact request replay returns the original result. |

## Existing PTI tools: Finance compatibility without a tool refresh

A connected ChatGPT session may retain the PTI Apps tool manifest created before Finance existed. The original code blocked generic reads as well as writes, making Finance unreachable. The compatibility bridge now permits owner-only **bounded projection reads** and validated Finance operations through the already-available `firestore_create_document` tool. This does not grant raw ledger writes.

These are *virtual create-only paths*: a call returns a canonical Finance operation receipt, **not** a document created at that path.

| Path under `users/{uid}/financeData/workspace/` | Required `data` and server action |
| --- | --- |
| `mcpIntake/{messageId}-e{edition}-p{part}` | Exact sanitized `finance_ingest_email` envelope. The authoritative `ingestMail` performs transactional deduplication and updates canonical projections. The defaults for edition/part are 1. |
| `mcpScans/{runId}` | Exact `finance_commit_scan` payload; only true complete, contiguous windows advance the cursor. |
| `mcpClosures/{YYYY-MM}` | `{month: 'YYYY-MM'}`. The canonical month reconciliation returns its report and `analysisSource`. |
| `mcpAnalysis/{YYYY-MM}-v{reportVersion}` | Exact `finance_publish_monthly_analysis` evidence-bound source and findings. |

For verification, `firestore_get_document` and bounded `firestore_query` now allow account-scoped reads of `projects`, `months`, `transactions`, `reviews`, `balances`, `recurring`, `sourceStatus`, `sourceWindows`, `scanStatus`, `scanRuns`, `reports`, `monthlyAnalyses`, `mailPartReceipts`, `mailProgress`, `sourceAudits` and `sourceIndexes`. Canonical events, source envelopes, physical rows, financial identity indexes, raw revisions and unrelated data are still inaccessible through generic Finance paths. Generic batch writes, deletion, and direct transaction/month creates are prohibited. The existing Finance project checkpoint remains the only updatable Finance document through generic tools.

The bridge requires both the authenticated owner UID and verified email, exact path-to-payload identity and the original strict Finance validation contract. Never send email bodies, attachments, account numbers, passwords or card data. The operation response and a subsequent projection readback establish success; submitting a virtual command alone does not.

## Source identification and intake

The Gmail worker verifies sender authentication and household scope before calling intake. Accept an institution only with evidence for its sender and instrument. An approved opaque or masked alias can include four trailing digits. An explicit confirmed scope attests that the evidence belongs to the household. Uncertain or excluded evidence may only produce excluded metadata. Use the bank_alert, bank_statement, card_alert, card_statement, merchant_receipt, investment_statement, mandate or other source type and a short institution slug.

Each entry carries a stable physical rowKey based on the source's row position, transaction line identity or unambiguous alert slot. Use the date that the source reports for the movement. Each row has YYYY-MM-DD occurredOn, positive safe integer INR amountPaisa, debit/credit direction, supported kind and optional source status, masked account, sanitized merchant, category and references. The source must confirm that an alert's movement completed before specifying posted. An alert with omitted status remains pending. A mandate remains pending or under review and records observed mandate evidence for the Recurring view.

References are exact payment identifiers. Use upi, neft, imps or rtgs for their corresponding transaction reference. Use a distinct issuer/merchant namespace ending in -rrn, -txn, -order or -payment for an exact identifier issued by that source. Share a reference between files only when both prove the same payment. The server fingerprints references and groups five matching terms together: exact reference, consistent amount, compatible direction and kind, compatible account, and plausible payment dates. Two different physical rows from the same statement remain distinct. Across channels and overlapping statements, a same-amount and compatible dated neighbor is a review signal. The bounded window spans three days on either side for weak evidence and seven days for explicit references. A weak overlap does not merge rows. A merchant receipt starts in Review until linked to qualifying financial evidence or resolved by the owner.

Submit receivedAt as an ISO timestamp with offset. Use period.from/to for issuer-confirmed inclusive dates. Without such evidence, the coverage projection records known row dates, stock dates or the local day the mail arrived. Observed, partial, locked, unparsed and excluded are distinct coverage states. Record an unreadable or inaccessible attachment as unparsed unless encryption is established. Keep all raw HTML, bodies, document bytes, email addresses, VPA, PAN, credentials and full account numbers outside these tools. The immutable envelope and normalized row receipts retain provenance in service-only collections.

Use parts numbered from 1, with finalPart true on the final part only. Replays must preserve the part's exact normalized payload. Each row, revision and projection update commits together. Before rows become visible, affected month coverage records an in-progress counter. Resume identical parts after interruption. A new issue must use the next edition and a changed parserVersion. Changed rows enter review. If omitted rows were supported only by the previous parsing edition, they also enter review. The final part can return continuationRequired while processing a bounded omission backlog. Replay the identical final part until finalized before advancing the scan.

## Read projections and accounting

Browser reads use the exact workspace get and the direct collections months, transactions, reviews, balances, recurring, sourceStatus, sourceWindows and scanStatus. Canonical events, receipts and audit revisions are server only. The generic Firestore MCP permits get and compare-and-set update on the exact existing **projects/pti-finance-v1** checkpoint inside the Finance workspace. Generic reads, writes, collection discovery and batch access for the remaining Finance namespace are blocked.

Amounts are integer INR paisa. The month's transactions count includes all projected events. Posted spend and fees grow gross spend and category totals. Refunds decrease net spend. Earned income excludes refunds, interest, reimbursements, settlements, internal transfers and investment withdrawals. Interest is tracked as other income. Cashflow is the signed sum of posted cash-account movements. Card settlements and internal transfer legs can move cash, and are excluded from spend and earned income. Transfer debit and credit legs are reported separately. Confirmed loan draws and principal repayments have their own amounts and move cash without changing earned income or spend. Pending, review and excluded events keep provenance and do not enter posted totals.

Balances report a stock as of a date. Cash closing and available balances, card amounts due, outstanding loan principal and investment market values use separate bases. Outstanding principal requires a confirmed bank statement with an explicit principal balance. Latest projections are per account alias, stock kind and basis. A bank alert must explicitly identify an available balance. Never add closing and available balances for the same account. Recurring evidence is an observed mandate or a possible subscription from a classified posting. It does not predict a future debit.

Source status describes the latest processed message with aggregate evidence counts. Source windows preserve the asserted dates and missing-document status of each finalized message. Month coverage describes captured inputs and preserves the gaps, including in-progress intake. A complete scan acknowledges the bounded Gmail search and processing. An arithmetic reconciliation checks the captured ledger against itself and does not establish an issuer balance match or whole-household completeness.

## Monthly analysis publication

The existing monthly job can call `finance_reconcile_month` for the previous India calendar month. Keep its `analysisSource` object exactly as returned. It contains `month`, `ledgerVersion`, `reportVersion`, `reportId` and `sourceDigest`. If the month is missing, record it as unavailable and stop the publication attempt. For `intake_in_progress` or `revision_conflict`, reread and reconcile after intake settles. Do not carry old citations over to a new report without rereading their evidence.

Use `finance_context` with that month and `section` set to `overview`, `source_windows`, or `transactions` to inspect the captured scope and select evidence. Pass the reconciliation binding to `finance_publish_monthly_analysis` as `source`. Its `findings` array accepts the following structured selectors.

| `code` | Additional fields and reported figures |
| --- | --- |
| `income` | Captured earned income, interest and reimbursements |
| `spending` | Captured gross spending, refunds and net spending |
| `cashflow` | Posted cash-account inflow, outflow and net movement |
| `financing` | Separate cash transfer legs, card settlements, loan draws and principal repayments |
| `investments` | Captured contributions and withdrawals |
| `category_share` | A supported `category` such as `groceries`. The share uses captured gross spending as its denominator. |
| `spend_group` | `eventIds` of two to eight distinct posted expense or fee events from the same month. The service reads the canonical IDs, calculates their total and reports the share of gross spending. The request can cite up to twelve distinct event IDs across all findings. |

Optional `sourceWindowIds` must come from `finance_context` for the exact month. The stored citation includes the opaque ID, source type, coverage status, last update and issuer-confirmed dates when available. An asserted issuer period must overlap the selected month. A window with an unknown issuer period can still be associated with a month through a known row date or received date. The service checks window and event citations atomically against the bound report and month and records cited event revisions. Publication accepts no authored narrative, item names, account identifiers, raw mail, attachment bytes or personal data.

The response includes `analysisId`, `analysis`, `replay` and `current`. Read back `finance_context` with `section: overview` and the same month. Its `summary.monthlyAnalysis` should match the returned analysis version, ledger version and report version when `current` is true. Finding and citation order and repeated selectors are normalized for replay. The same selections and source binding always return the original version, even after that version has been replaced or invalidated. In that case `current` is false. Different evidence or findings get a new analysis version. Publication never advances the ledger version.

The browser reads the current narrative from the existing owner-readable `months` document. The narrative is cleared when the ledger or associated source coverage changes. The immutable receipt remains in the server-only `monthlyAnalyses` collection. A `null` figure means unknown, including an individual gross measure with no relevant posted activity. A zero can describe a net total from captured movements or a category with no expenses within observed gross spending. Even where captured figures are available, coverage can remain partial and whole-household completeness remains unknown.

The browser submits a correction to **https://pti-firestore-mcp-185802494856.asia-south1.run.app/finance/correct** with POST, Content-Type application/json and Authorization Bearer set to the current Firebase ID token. The response gives the new revision. A revision conflict requires a read of the latest event before the user retries. Keep the same request ID and payload for transport retries after an uncertain response.
