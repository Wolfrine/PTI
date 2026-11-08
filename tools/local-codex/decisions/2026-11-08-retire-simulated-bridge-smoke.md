# Retire the optional simulated bridge smoke suite

The November 8 owner policy directs practical verification and removal of confirmed test-only assets. `test/bridge.test.mjs` launched the bundled local MCP against `fixture-runtime.mjs`. Its only tracked caller was the local package test script; neither the runtime build nor the deployment workflow consumes it. Independent source review confirmed that boundary.

Remove the suite and its script entry. The shared fixture stays because the workflow still runs `worker-harness.test.mjs`. Keep the listener rules check, mixed Windows process probe, remaining workflow consumers, dependencies and historical results. The expected benefit is one fewer optional simulated suite; no time or cost reduction is measured. An external caller outside the tracked repository remains a possible compatibility gap.

Practical verification: the obsolete entry is gone and every remaining local script reference exists. The normal build succeeded and all seven artifacts matched the installed 0.4.9 release byte for byte. The installed collector fetched all 188 selected hosted jobs in two batches after cleanup, with no missing jobs or sync error. It reported no explicit owner verdicts. No synthetic suite was run and no release activation was needed.

Retain the cleanup. Use the existing maintenance-only main delivery convention: main reported no required status checks, and the workflow definitions and protections remain intact. If a required consumer is later identified, use Git history to locate the exact asset and obtain owner authorization before restoring test code.
