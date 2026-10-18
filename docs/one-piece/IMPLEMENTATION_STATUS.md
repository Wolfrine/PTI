# One Piece implementation status

## Current snapshot — 18 October 2026, 12:54 UTC

**Not deployed or fully accepted.** The owner approved full implementation, automatic preparation, local DNS, five-second warm playback/seeking, and HTTPS controls plus scoped LAN HTTP Cast media. No further architecture approval is pending.

- Actual inventory: 1,084 distinct episodes; 590 missing; originals and alternative derivatives deduplicated. Bounded source checks cover 1/500/944/1000/1001/1044/1085. Additional 8 MiB fragments from 500/944/1044/1085 decoded selected Japanese audio and video; English track headers were identified, but those fragments contained no subtitle packets. No full-payload English claim for those four.
- Selected path: completed faststart MP4 with Japanese AAC and full-English VTT; suitable H.264 copied and HEVC Main10 converted to 8-bit H.264. The owner separately confirmed Japanese dialogue and English subtitles for prepared episodes 1000 and 1001. Earlier actual Sony helper tests passed natural 1000→1001 and seven warm seeks of 677–2,247 ms; idle receiver launch/load took 7,688 ms. Latest strict raw-proof code still needs actual Sony revalidation through the new production path.
- Actual production core passed exact static HEAD/ranges, subtitle lineage, shared preparation/cancellation, queued adoption and persisted reuse. Measured preparation: 23.803 s/51.991 s for 1000/1001; production HTTP decode seeks: 190–700 ms. Peak admitted storage: 17,071,513,219 bytes, below 20 GiB. Automatic preparation is separate from warm latency.
- Frozen UI candidate `2b9695d3d712208858675d6bb8847b40f790544a49317f4065e24b33c347282a`: actual native MP4 pictures and English subtitles inspected from both collections; 26 current desktop/mobile-sized renders independently reviewed and Central validator passed. Synthetic technical accounts do not establish Google/family authentication or physical Android acceptance.
- Latest full companion fixtures 194/194, including the bounded header-admission correction; frontend/integration 47/47; shared Firestore emulator 37/37. Complete Angular production build passed. Angular component tests remain 1 pass/8 failures, reproduced on unchanged main with missing Auth/Firestore test providers.
- The corrected actual two-minute smoke passed 120,178 ms with three real decoders, queued 1000→1001, durable resume/rewind, no new source downloads and six recoveries under five seconds. Owned cleanup passed. The genuine hour began at **12:51:13.808 UTC**, expected to end **13:51:13.808 UTC** before cleanup. It remains in progress, not an acceptance pass. The pinned engine marker race was corrected with bounded request-header admission; bodies remain concurrent. The earlier failed serial warmup is retained as counterevidence. Strict HTTP checks remain enabled.
- Remaining release gates: real hour, final production Cast validation, explicit prepared runtime configuration, bounded local cache reuse, clean commit/PR, H package/activation/rollback, complete PTI Hosting/live-worker/sibling checks, real owner pairing/invitations/progress, and available physical Android/HDMI/sleep/reboot checks. Unrun hardware checks must remain explicit.
- Managed runtime is stopped/unpaired. No application activation or deployment yet. The implementation is being committed and packaged for draft review while the actual hour runs. Final user-facing deliverables belong in the projectless `outputs/` directory.

See [latest continuation](LATEST_CONTINUATION.md), [production core](evidence/jellyfin/PREPARED_CORE.md), [Cast evidence](evidence/cast-media-compat/CAST_PREPARED_MP4.md), [sample limits](evidence/representative-fragments/README.md), [design acceptance](design/acceptance.json) and [runtime](ONEPIECE_RUNTIME.md). Later timestamped continuation entries supersede this snapshot.

## Historical checkpoint — superseded below

This is working implementation status, not product acceptance. Owner approved visible automatic preparation, five-second warm target, local DNS, and (after real Sony private-CA rejection) HTTPS controls plus scoped LAN HTTP Cast media. No further architecture approval is pending.

Worktree: `F:/Workspace/Worktrees/PTI/one-piece-family`, branch `codex/one-piece-family`, base `24b4805`. Only read-only CI preflight files are committed/pushed so far (`b298987`, corrected `ee82f76`). Full app/backend changes remain local. No app deployment yet.

## Verified

- Real inventory: 1,084 distinct; missing590; source1 1–589/591–1000, source2 1001–1085. Transport samples1/500/944/1000/1001/1044/1085 all bounded206. Not all playback proven.
- MD5-verified cached originals1/1000/1001; one1000 download167.218s, ready169.517s; same-lease1000→1001 passed. Real3-viewer/6-context next preparation/seek/adoption passed headlessly. One earlier12.070s source1 seek outlier remains unexplained; no blanket five-second guarantee or60-minute acceptance.
- Prior actual Sony short MP4+EnglishVTT clips from1/1001 confirmed by owner. Full HLS production-adapter TV test still pending.
- Complete shared Firestore rules emulator37/37; integration/auth build6/6. Angular production passes; existing8/9 unit failures independently reproduce on unchanged base.
- Companion full fixture suite80/80 passed before latest runtime/review additions; independent API/cloud/manual-Cast/outage regressions9/9 now pass; independentCast13/13. Runtime8/8. New preferred-language, autoplay-policy and migration code needs final broader run.
- Fresh live rules preflight Actions39113060280,08:51:50.938Z: activeSHA2564dadb9232ddfa27ca6f09bae844adb8cff3d3a4854a6d034a9f221d1d1525c0b matches reviewed LF base Git blob. WindowsCRLF hash differed. Workflow now supplies exact24b4805 predecessor; guard/race check preserved. No data reads/writes in preflight.
- CurrentUser public CA installed; X509 DER fingerprint307F6A88C652E429513F47B386F761249F52A30D6FE93B91ECE7501C3C640489. Public PEM fileSHA012f866d…7b76d, no private key. Actual Chrome trusted `https://onepiece.local:8443/runtime-health` with no warning; screenshot in runtime evidence.
- mDNS name resolves192.168.68.105. Managed JF18097/backend18098 loopback; Caddy8443/media18099 LAN. Real backend crash recovery14.705s. CurrentUser scheduled task configured/running; fatal supervisor recovery under test. Pre-login unsupported; reboot untested.
- Owner-approved firewall script elevated once; actual proof09:10:05Z. Exactly Ethernet/Public/remote192.168.68.0/24, pinned CaddyTCP8443/HnodeTCP18099/PythonUDP5353. No global network/profile changes. Proof Hruntime/private/firewall-proof.json.
- Stable Hnode24.19.0, OpenJS signatureValid, SHA3602F2BB1A10F2CBAB4C36886218A33C1AB3DB87290E73B033C46C77147D0237. Runtime packaging to versionedH release underway; do not leave final code dependent on F worktree.

## Current agent lanes

- `visual_designer`: owns web/** +design packet. B ship-log direction chosen after3actualdirections. Production frontend wired; dev-only state fixtures. Independentcycles1/2 reviewed; cycle2state7.5 (error loses known episode/resume), otherdims8. Five substantivecycles required. Parent personally inspected directionB and must inspect rounds3/5/final. CUA Chrome3 exclusively assigned critic during each review; coordinate access.
- `visual_critic`: owns CRITIC.md/evidence only. Cycle2 complete, pendingcycle3 afterdesignerfixes. Fixture layouts are not real playback proof.
- `local_dns_pilot`: runtime/** and runtime scripts. Finishing fatal-supervisor scheduler recovery (strict orphan cleanup), versionedH packaging, final tests. Exact current-process state/private config onH; don't kill/restart concurrently.
- `pilot_independent_review`: prepared guarded `test/cast-real.mjs` and instructions, NOT RUN. Wait explicit rootGO after runtime recovery and clean stop; exactHnode executable; temporarymDNS, loopback18100 andLAN18099; realcache/pilotJF18096 only, rejecting downloader. BusyTVskip/no takeover. Testsfull1000HLS→natural1001 +VTT/controls/return. Technical synthetic identities clearly labelled, notFirebase/PWA acceptance. Rootaskedaddautoplay-off queue cancellation coverage.

## Parent-owned implementation

`src/auth,progress,pairing,tickets,viewer-credentials,cloud-progress,api,server` and targetedtests. Per-viewer Google provider reauth is exchanged/verified viaFirebase; refresh token DPAPICurrentUser only. No browser refresh internals orAdmin credential reaches viewer. Immutableowner usesone-use local setupPIN via private supervisor IPC and sealed local retrieval. Strict family membership. Real app not paired yet.

API contract `API.md`. Progress serialized by generation/revision +handoff authorityEpoch; receiver authoritative; intentionalrewinds retained. ClosedLease projection retries offline final outbox without reopeningPCcontrol; startup restores known pending journals. Scoped tickets2h max/resources exact; controlsHTTPS only, HTTPmedia rejectscredentials/APIs/arbitrarypaths. Fresh automaticnext is exactly+1; missing590 blocks. ManualCastselection preservesdestination, stops onlyourcapturedsession, rotatesepoch, visiblyprepares/reloads; latepreparation cannot reload after localhandoff.

Latest settings: `/renew {autoplay}` applies activepolicy; off reloadssamewarmedreceiver episode at actualposition to clearqueueditem, preservingpause/subtitle/volume. Next queue inherits inspected audio language; no fixedindex. PythonnextactiveTrackIds reflects actualsubtitlemode. UIagent informed towire policy and preferredlanguage, canonical/numeric episode URLs. Needs final integrated/hardware verification.

PTI worker migration: launcher/login add supported `ngsw-bypass=true` once to avoid older rootworker treatingchild asAngular. Child removes marker only afterownworkercontrols. Build derives SWcacheversion frompublicassetcontent; UIworker template `__BUILD_ID__`. Final rootworkerupgrade/browser test required.

## Remaining work

Complete5reviewcycles +parentvisualQA; realHLSCast harness; actualauthownerpairing/userGoogle consent/invitations; productionappstream/render/subtiming/seek/resume; 60min3sessioncapacity; mobile/tablet/HDMI/Androidinstall hardware gates; fullHostingbuild/preservation/release/rollback/liveassets; versionedHcompanionpackage/recoverydocs. New endpoint/script tests as warranted. No paid services, externalDNS account, publicmedia/rehosting or series-wide scan.

User-facing deliverables/links must be in projectless `outputs/` (absolute paths). Final must include one memory citation block last because memory guidance was used (MEMORY.md94–95; rollout01a13eb2-e968-7e92-84cf-f180f02c941f). No global memory edits requested.

**Newer active state: [LATEST_CONTINUATION.md](LATEST_CONTINUATION.md), around10:04UTC.** Read it first; it supersedes pending statuses above without claiming product acceptance.
