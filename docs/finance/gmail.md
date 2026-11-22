# Gmail reconstruction and updates

## Observed source inventory

An authenticated Gmail connector returned 121 distinct candidate message IDs across targeted sender and subject searches. All 121 metadata reads returned. The initial grouping identified 29 bank-statement candidates, 28 card statements, 11 CDSL candidates, 36 amount-alert candidates, five mandate notices and 12 other matches. Those counts report search matches and subject classification. A separate merchant query returned 50 results and a next-page token.

A broader HDFC statement query retrieved the 2026 sender migration. Authenticated messages from `hdfcbank.bank.in` included monthly combined and Millennia statements through November 2026. Earlier samples came from `hdfcbank.net`. Several combined statements use .pdf filenames with an octet-stream MIME type. A filename or an email month does not establish attachment readability, statement dates or ownership of every listed instrument.

Gmail returned `INVALID_ARGUMENT / Failed to read attachment` for four supported PDF parts across the November 2023, February 2026 and November 2026 samples. Attachment contents remain unverified. That connector error alone cannot establish that the PDF is encrypted.

The canonical UPI parser was run on eight real early alert messages in memory. Five passed the household alias and transaction-date bounds for the 22–23 November 2023 start of the reconstruction, including five distinct reference values and safe integer paisa. The other three were outside the requested window. Matching unknown payees stay in review until household classification can be established. Normalization is separate from persistence.

## Gmail worker

Use both authenticated connectors, Gmail for discovery and PTI Apps for Finance writes. Start only after `pti_apps_list` exposes Finance and the connected `finance_context`, `finance_ingest_email` and `finance_commit_scan` calls are verified. The exact input schemas come from those tools and the server contract.

1. Read the Finance operations context. Backfill in small overlapping Asia/Kolkata windows. Convert inclusive local calendar bounds into UTC epoch seconds with an exclusive end at the next midnight for Gmail `after:` and `before:`. Include the start second in the search and enforce exact dates after reading. Bank alert, bank/card statement, CDSL and merchant query windows carry independent coverage. Include authentic HDFC legacy and current domains. Use statement coverage and booking dates from source evidence, with look-ahead for statements mailed after the period they cover. [Gmail search and date filtering](https://developers.google.com/workspace/gmail/api/guides/filtering)
2. Read all pages and deduplicate immutable Gmail message IDs. Verify the actual sender and Gmail authentication results on the parent message. Match the transaction or statement instrument to the household allowlist. Scope uncertain and extended-family material stays out of the ledger. Never infer ownership from a message in the inbox.
3. Use the observed HDFC UPI template via [the normalizer](../../tools/pti-mcp/scripts/normalize-finance-gmail.mjs). Mark other alerts as unparsed unless the exact event, booking date, direction and amount can be extracted. Use integer paisa and preserve issuer transaction references in their namespace. Leave the payee unclassified when proof is missing. Redact addresses, PAN, full account/card numbers, credentials and raw attachments before tool submission.
4. For each authentic statement, inspect the parent MIME parts and read supported parts by Gmail attachment ID. Use `locked` only when the source explicitly requires a password or a PDF reader confirms encryption. If the connector fails extraction, record `unparsed`. Extract verified posting rows, opening/closing or liability/asset balances and explicit periods separately. Capture PDF weaknesses in coverage. Submit stable physical row keys and bounded parts. Merchant receipts help match purchases, and an unlinked receipt remains in review. A pre-debit notice supplies pending evidence.
5. Read each intake receipt. Confirm same-message retry is an idempotent success. Continue part or window replay from its own receipt. Report a partial or failed window when pages, message reads or writes are missing. Persist locked/unparsed/excluded outcomes with their true counts. A complete scan says the bounded search was processed. The financial record remains qualified by coverage and unresolved rows. Only committed contiguous daily runs advance the update cursor.

### Authorized hosted jobs

- **Finance Gmail updates** reads Gmail with a small overlap against the saved cursor, uses specialized PTI MCP Finance intake and commits each scan result. Schedule after an authenticated real write and replay. Historical backfill uses the same path and its own windows.
- **Finance monthly close** runs after the prior local calendar month closes. Read Finance context and call `finance_reconcile_month` for the prior month. Read back the report and preserve observed totals, evidence counts, excluded movements, unresolved records and statement gaps. Re-running after new evidence produces a report for the current ledger revision. Schedule after an authenticated report receipt.

The supervising assistant has the scheduling handoff because the native turn's connector inventory exposes no hosted task-creation action. Refresh PTI Apps tool discovery in that authorized session before attempting the real acceptance write or activating either job.
