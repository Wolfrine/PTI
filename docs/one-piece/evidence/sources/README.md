# Archive source adapter and bounded transport pilot

This directory contains **real public Archive file metadata and transport evidence**, captured on 18 October 2026. It contains no episode video, subtitle content, user data, credentials, or playback tickets. Filename titles are source-provided strings, not independently checked official episode titles.

## Reproduce from the repository root

```powershell
node --test apps/one-piece/companion/test/sources.test.mjs
node apps/one-piece/companion/pilot/transport/inventory.mjs
node apps/one-piece/companion/pilot/transport/probe.mjs
```

The inventory command fetches two small metadata documents. The probe command requests **three 16 KiB ranges per episode** (start, midpoint, end) for 1, 500, 944, 1000, 1001, 1044 and 1085, and one OPTIONS request per original. It neither downloads a full episode nor writes media bytes. It identifies the app with a User-Agent, sends the actual PTI origin, follows at most five validated Archive redirects, limits active upstreams to two, rejects unexpected Content-Range, and cancels range-ignoring HTTP 200 bodies. HTTP 429/temporary HTTP failures have at most three attempts. Retry-After is honored; a requested delay exceeding ten seconds terminates this bounded pilot rather than retrying early.

`inventory-run.json` records raw response hashes, timestamps, request outcomes and the generated catalogue hash. The two item-named JSON files retain only media-file provenance. `catalog.json` is a derived real-source catalogue, **not a mock catalogue**. Its 1,085 ordered rows include the explicit missing episode 590. `endBoundary` describes episode 1086 as outside these sources. Each of the 1,084 listed episode rows has one original video; 1001–1085 also have an MP4 alternative. Only 1068, 1071 and 1074 list separate SRTs. Track arrays stay unverified and empty until a media probe supplies evidence; an MP4 file's existence does not establish Japanese audio or English dialogue subtitles.

## Observed transport results

The run ending `2026-10-18T07:19:21.429Z` obtained **21/21 matching HTTP 206 responses**, reading **344,064 media bytes total**. Individual bounded transfers took 567–2,513 ms, including redirects. All final storage GET responses omitted `Access-Control-Allow-Origin` for `https://pti-app-2ab59.web.app`. The seven corresponding OPTIONS responses returned HTTP 405 without CORS permission. Full headers, final storage URLs, range offsets and sample hashes are in `range-probes.json`.

These observations establish availability of sampled byte ranges only. They **do not establish playback startup, Japanese audio, dialogue subtitle rendering, buffering, real player seeking, mobile decoding, or Cast compatibility**. Single-range browser requests may be CORS-safelisted and need no preflight, but JavaScript still needs permission to read the final GET response. A plain cross-origin video element can behave differently from JavaScript byte access.

## Comparison-only relay

```powershell
node apps/one-piece/companion/pilot/transport/relay.mjs
```

The relay binds **127.0.0.1:8793 only** and permits media IDs for the same seven samples. Example: `/media/1/original`, `/media/1001/original`, `/media/1001/derivative`. It has no arbitrary URL parameter and cannot proxy localhost targets. Only the browser pilot origins on port 8792 and the exact PTI origin receive CORS permission. It accepts one byte range, caps each response to 1 MiB and the whole process to 128 MiB reserved upstream bytes. It buffers only a bounded chunk before returning HTTP 206, cancels requests when the client disconnects, and appends outcome/budget records to `relay-requests.ndjson`. It never binds a LAN interface, changes firewall rules, installs a service, or exposes credentials.

This small relay is a **transport feasibility experiment**, not the approved production companion, a video server, a Cast endpoint or evidence of trusted LAN HTTPS. A native video element's reaction to chunked 206 responses is itself a test result. It must not be promoted into a custom backend if the media-engine gate fails.
