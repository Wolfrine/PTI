# Five-second Cast recovery: prepared-media alternatives

Proposal only, following actual Sony attempt 14. No fallback code, media processing, engine change, new original download or TV action was performed for this document. The parent owns exclusive media/hardware scheduling.

## What the latest result establishes

`../cast-production-adapter-attempt14-cast-profile-functional-performance-miss.json` passed all 16 functional stages: actual 1000→1001 natural queue transition, selected Japanese/full-English tracks and receiver WebVTT fetches, source-2 true `FINISHED` at 1419.040s, local handback and revoked ticket. Five receiver seek recoveries were **4.397 / 2.450 / 6.545 / 5.758 / 4.058 seconds**. Two miss the retained five-second target. Initial Cast admission was 10.892s. These results do not establish synchronized visual subtitles or production Firebase/PWA authentication.

The request trace shows source-2's first post-seek segment taking 1.292s, followed by 82–124ms segments and several hundred milliseconds between requests. Local packet probes were already below 1.5s for the requested segment groups. This supports testing preparation, buffering and control transport separately; it does not identify one sole bottleneck. The hardware lane is separately evaluating bounded reuse of recent raw receiver proof. A slower status acknowledgment must remain part of user-observed recovery, even when the picture may already be advancing.

Do the cheaper counterfactuals first: repeat the corrected control path, and test the existing **copy-TS/two-second candidate for episode 1000 only**. The latter has aligned headless PTS/EXTINF and complete final segments, but has not passed the Sony. A harness-only PlaybackInfo override can enable video copy only for the captured 1000 media-source ID and `PTI cast-h264` profile. Leave 1001 forced. Do not enable copy for 944, early releases or all H.264 files from that one result.

## Alternatives that remove on-demand encoding from a seek

| Candidate | What is ready before the TV starts | Advantage | Additional obligation |
|---|---|---|---|
| Existing on-demand aligned HLS | Captions and initial segment | Smallest storage/preparation burden; all functional gates now work | Two measured recovery misses remain |
| **Complete HLS in a retained Jellyfin context** | Every exact media segment through the effective selected-track end | Smallest first pilot: same MIME, caption graph, Cast queue and player | Must prove no segment deletion/regeneration, engine cleanup or throttling hole for the whole active session |
| **Completed MP4, served statically by Jellyfin, plus original WebVTT** | A complete inspected H.264/AAC file and captions | One stable range-seekable object; durable sharing across viewers/restarts is straightforward | Needs rendition cache/import, safe original-caption + derived-video bindings, and progressive-range transport changes |
| Persistent copied HLS directory | Immutable manifests/segments and captions | Could share complete output across viewers | No verified Jellyfin API currently serves that arbitrary manifest/segment directory statically; adding an unrelated static media server is outside this proposal |

The two bold candidates are experiments, not a predetermined switch. Complete HLS is the smaller diagnostic; completed static MP4 has the cleaner durable asset model if retained HLS is fragile.

## Mature engine boundaries

Jellyfin supports a local static video route, `/Videos/{derivedItemId}/stream.mp4?Static=true&MediaSourceId={derivedSourceId}`, after the completed file is imported and inspected. Its static file helper enables HTTP range processing. This is source-code evidence, not a tested pinned-12.2 route yet. [Video controller](https://github.com/jellyfin/jellyfin/blob/master/Jellyfin.Api/Controllers/VideosController.cs), [file response helper](https://github.com/jellyfin/jellyfin/blob/master/Jellyfin.Api/Helpers/FileStreamResponseHelpers.cs)

Its dynamic progressive converter explicitly returns `Accept-Ranges: none`. Merely changing PlaybackInfo to HTTP MP4 is therefore **not** the seek solution. Use it only to prepare a complete file, then deliver that completed file through the static route. The inspected progressive MP4 generator uses fragmented MP4 flags; the pilot must check its actual finalized index/seek behavior. If that completed output is insufficient, a bounded no-reencode `+faststart` repackaging step using the same bundled FFmpeg is a separate measured option. [Encoding helper](https://github.com/jellyfin/jellyfin/blob/master/MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs)

No native viewer, Jellyfin public admin endpoint, cloud store or custom decoder/encoder is introduced. The adapter continues to manage automatic selected/current-next preparation; Jellyfin and its pinned media tools perform conversion and delivery.

## Pilot A: complete HLS, without a new delivery surface

1. After an exclusive-engine GO, use the existing verified 1001 original only; rejecting downloader and no 1002 prefetch. Reserve the full constrained output before work. Keep the normal two-second Cast profile and inspected Japanese/full-English duration.
2. On the isolated pilot only, save encoding configuration; temporarily disable throttling and segment deletion while preparing one complete context. These options are currently global engine settings, so do not toggle them under other viewers. Fetch all exact advertised media resources with bounded concurrency, finite byte/deadline limits and cache pressure monitoring. No original is fetched from Archive.
3. Ready means every segment exists and is nonempty through the clamped final segment; first/middle/end decode, duration/PTS and the full English WebVTT pass. Record normal engine completion. Count preparation time, bytes written/read and peak footprint separately from warm recovery.
4. Cast the **same retained context**, then run repeated forward/back/late seeks, pause/resume, actual selected-track finish and source transition. Record whether each request hits an existing segment, whether any FFmpeg job starts during a seek, transport completion, fresh receiver proof and end-to-end recovery. A regenerated segment invalidates the claim that this was complete warm HLS.
5. Hold it paused and active across the intended session, then repeat early/late seeks. Verify Jellyfin's per-job cleanup does not remove the prepared files. Afterward close only this context, restore settings and prove cleanup. Restart/persistent reuse is a separate test; it is not implied by an in-memory complete context.

If it passes the five-second target and retention checks, the narrow production change is a fully-prepared phase in `media/coordinator.mjs` plus dedicated-engine configuration/admission policy in `media/jellyfin.mjs`. Per-lease current/next contexts are initially simplest. Sharing completed HLS across profiles or reusing it after restart requires additional lifecycle proof; do not silently treat volatile engine URLs as durable cache assets.

## Pilot B: completed MP4 with Jellyfin static ranges

1. Use cached 1000 first to establish the lightweight route: negotiate H.264/AAC MP4 over Jellyfin's private progressive API with selected Japanese metadata, copy video/audio if honored, and retain original full-English WebVTT. Then compare 1001 with HEVC→8-bit H.264 conversion and Japanese audio. Confirm actual encoder mappings; do not trust the negotiation response alone.
2. Read the complete private response to an H: `.part` under finite expected-output, deadline and disk reservations. HTTP EOF alone is insufficient: require normal engine completion and inspected effective end, codec/pixel-format/profile and start/middle/end decoding. Atomically publish only the complete file, with SHA256 and lineage. Measure whether the finished fragmented MP4 is seekable; use a no-reencode faststart copy only if needed and separately budget both files.
3. Discover that exact derivative in the same dedicated bounded local library. Never merge it into a random original's versions or perform library-wide catalogue work. Verify private static HEAD and explicit start/middle/end/suffix ranges return correct 206/content-range/bytes and no new encoding job. Test the pinned engine; upstream code is not runtime proof.
4. Serve the derived video and original full-English caption resource through the existing scoped ticket/API listener, with experimental fixture identity clearly labelled. Test real Sony controls, five repeated seeks at each relevant position, natural 1000→1001 queue transition, caption off/on and subtitle timing after seeks. The human confirms audible Japanese and visible English at a known dialogue point after actual PLAYING.
5. Repeat with two viewers sharing one derivative but independent leases/progress, then verify interruption/restart reuse, stale output repair, expired/revoked tickets and cache pressure. This establishes whether complete MP4 is worth its broader adapter changes.

## Exact production changes if MP4 wins

| Owner/file lane | Minimal required change |
|---|---|
| Media cache: `media/cache.mjs` | Extend the existing atomic manifest with completed rendition records and shared finite jobs; original checks remain unchanged. Add rendition pins/LRU and output/temp reservations rather than a parallel unaccounted cache. |
| Media preparation: `media/jellyfin.mjs` and a small `media/prepared.mjs` helper | Negotiate/prepare through the mature engine, validate completion, import the exact prepared file, open static delivery and retain selected-original caption identity. Add only the finite managed rendition root to the existing library's explicitly checked paths; use a role-specific exact-file importer rather than widening original `ensureFile` to arbitrary H: paths. No generic path/URL preparation API. |
| Coordinator: `media/coordinator.mjs` | Resolve a rendition by source fingerprint + track/profile recipe; share preparation across profiles; preserve current/next admission and explicit wait/error states. Closing a viewer releases its reference instead of deleting a shared asset. |
| Existing API: `api.mjs` | Use descriptor MIME (`video/mp4` versus HLS) instead of the current hardcoded HLS MIME. Preserve canonical episode IDs, authority epochs and progress; no new user-facing endpoint is required. |
| Resource graph: `media/jellyfin.mjs` | Admit two exact role bindings: derived item/source for video, original item/source + selected subtitle index for captions. Never relax GUID checking to accept arbitrary engine items. Per-viewer tickets still bind the canonical original episode and exact paths. |
| Bounded transport: `media/jellyfin.mjs`, `api.mjs` | Keep current 1 MiB manifest/16 MiB caption/32 MiB segment bounds. Add a known-size prepared-file role, correct HEAD and single explicit/suffix/open-ended ranges, checked against the exact file length. Validate upstream 206/content-range/length against the normalized requested interval; reject a full 200 for a small requested range. Reject malformed/multiple/unsatisfiable ranges. Never globally increase every resource limit. |
| Streaming lifecycle: same transport lane | The current fixed 30-second fetch timeout would break a slow full-episode MP4 response. Use bounded header/idle/overall lifecycle, backpressure and cancellation on disconnect/lease revocation; cap bytes to the selected prepared object's proven length. Test pause/resume and a deliberately slow >30-second response. |
| Player/Cast: existing delivery consumers | Honor declared MIME and existing WebVTT; retain the same remote controls, queue and authoritative progress. No separate catalogue or viewer workflow. |

Rendition identity must include the verified original MD5/source ID, selected audio fingerprint, codec/bit-depth/bitrate/container recipe, relevant engine/preparation version and timing treatment. Subtitle selection has its own source/index lineage; subtitle on/off does not duplicate video. Persist size/SHA256/mtime/effective duration and lineage; treat item IDs and runtime URLs as resolvable engine references, not trusted identity. An incomplete, changed or obsolete rendition is prepared again automatically.

## The 20 GiB rule applies to every alternative

Count originals, original `.part` files, Jellyfin conversion output, adapter copy `.part`, final renditions, possible faststart second output, WebVTT and metadata. Reserve the **peak simultaneous** bytes before starting. Do not release the engine-output reservation merely because a second copy exists. Delete verified idle temporaries only after successful adoption; preserve active objects and captions. Evict inactive renditions before unnecessary originals when that frees room without redownload.

Start with one full-rendition preparation job at a time. Share it across all viewers selecting the same recipe. Admit only each active viewer's current/immediate next; no all-series scans. Six retained final outputs plus six originals may fit, while their additional conversion/copy temporaries may not. A denied next preparation must wait/evict inactive material and leave current playback intact. Existing approximately 4.04 GB diagnostic accounting is not proof that six worst-case persistent assets plus peak temporaries fit.

## Decision and evidence gate

Measure each mode against identical actual receiver operations and retain all runs, including the current misses. Separate source download, full preparation, warm first frame, media HTTP time, command/proof time and advancing PLAYING recovery. Five-second acceptance includes the full command-to-fresh-advancing-receiver observation; do not replace it with segment response time. Also record Japanese/English presentation, final duration, bytes/peak disk, engine children, copy/conversion choice and cleanup.

Prefer the smallest mode that passes repeatable real viewing, the retained five-second target, current/next transition and the bounded operational checks. If corrected on-demand control or episode-specific copied HLS passes, no complete-file migration is justified. If full HLS passes but cannot retain assets safely, complete static MP4 is the better durability candidate. If neither passes, return the measured bottleneck and failed target rather than adding an unreviewed media server or declaring a headless pass.
