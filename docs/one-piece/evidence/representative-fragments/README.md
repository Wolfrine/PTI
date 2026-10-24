# Bounded representative original inspection

[Actual run evidence](https://github.com/Wolfrine/PTI/blob/78553b47adfd7105da410e1a9f6cf66fb36c29b9/docs/one-piece/evidence/representative-fragments/representative-2026-10-18T12-28-35-464Z-34c9845a.json),18 October2026,12:28–12:31UTC. This extends the existing bounded start/middle/tail transport checks for500/944/1044/1085. It deliberately does not repeat the separately verified1/1000/1001 work.

All four originals supplied exactly8MiB of contiguous head bytes, fetched as eight1MiB ranges each: **32 HTTP206 responses and33,554,432 received media bytes total**. Every range matched its requested interval, listed full-object total and exact length; HTTPS redirects remained within the allowlisted Archive collection. No retry occurred in this run. The shared transport retains maximum2 concurrent sources and honors Retry-After rather than retrying early. No full original was downloaded and no source was rehosted.

| Episode | Actual release | Video in fragment | Japanese audio candidate | English subtitle candidate | Local software A/V decode |
|---|---|---|---|---|---|
|500|HorribleSubs|H.264 High,1280×720,yuv420p8bit|Native1,AAC LC stereo44.1kHz|Native2,English ASS,sole subtitle|0.5s/12frames,exit0|
|944|SubsPlease|H.264 High,1280×720,yuv420p8bit|Native1,AAC LC stereo44.1kHz|Native2,ASS titled `Eng subs`|0.5s/12frames,exit0|
|1044|Anime Time|HEVC Main10,1920×1080,yuv420p10le|Native2,AAC LC stereo44.1kHz|Native4,ASS `English`; exclude default3 `Song & Signs`|0.5s/12frames,exit0|
|1085|Anime Time|HEVC Main10,1920×1080,yuv420p10le|Native2,AAC LC stereo44.1kHz|Native4,ASS `English`; exclude default3 `Songs & Subs`|0.5s/12frames,exit0|

Both second-collection samples default to **English audio1**. The production track-selection function selected Japanese2/English subtitle4 from actual ffprobe metadata. These are native original indices; derived-file/Jellyfin indices are not inferred. The actual944 filename passed the SubsPlease parser, rather than assuming HorribleSubs naming.

All four partial inputs returned only a WebVTT header and **zero subtitle cues**. A separate local-only packet scan likewise reported no subtitle packets in the retained fragments. The fragments therefore establish track headers and short selected A/V decoding, **not full-English dialogue payload, listening, rendered subtitles or subtitle timing**. ffprobe's unknown/unsupported-codec warnings were traced to TTF/OTF attachment streams; no audio/video decode error occurred. Premature-end warnings are expected when scanning these truncated local MKVs. Container duration fields describe the original's declared duration and do not prove the complete timeline or seeking.

The report keeps `allBoundedInspectionsCompleted:false` and `subtitlePayloadInFragmentsVerified:false`; its narrower `allTrackCodecAndShortDecodeChecksPassed:true` is supported. Full playback, seeking/buffering/resume, complete preparation, device compatibility and Cast remain separate tests. No evidence here expands those acceptance claims.

Private fragments remain under `H:/PTI-OnePiece/production-media/representative-probes/currentrun/<runId>`, inside existing shared quota accounting. Their owned-tool marker extension is `.video.part.mp4`; their content is **unchanged MKV head bytes**, not a converted MP4. Fragment SHA256, source IDs/filenames/listed MD5, HTTP headers/timings, tool hashes/versions and exact native selections are in the JSON. The full original MD5 cannot be verified from a fragment. Only metadata/evidence is saved in the repository; the actual fragments are private onH.

Shared accounting rose from10,096,108,433 to10,129,662,865bytes, below the20GiB limit; final disk free was297,707,008,000bytes. Tools were pinned Jellyfin FFmpeg/ffprobe8.1.3, with15-second per-command deadlines,2MiB output bounds and owned child/intent handling. Decoding explicitly disabled hardware acceleration and used one thread. All ownership records were cleared after child completion. No engine, GPU, relay, TV, browser, installed runtime or global process cleanup was used.

Reproduce a **new explicitly opted-in bounded run** from the worktree root:

```powershell
$env:PTI_RUN_REPRESENTATIVE_FRAGMENTS='1'
& 'H:/PTI-OnePiece/tools/node/node.exe' apps/one-piece/companion/test/representative-fragments-real.mjs
```

This requests at most another32MiB, so do not run it as part of ordinary unit tests. The local-only follow-up used the already hashed fragments with `ffprobe -v warning -count_packets -show_entries stream=index,codec_type,nb_read_packets -of json PRIVATE_FRAGMENT` through the same15-second owned-tool runner. It transferred no additional Archive media bytes. The report records that follow-up separately. To test actual subtitle payload and timing for these episodes later, use normal visible episode preparation; do not silently increase this fragment budget.
