# Browser/native pilot evidence — 18 October 2026

The actual object tested is playback of real originals from both specified Archive collections. This directory contains technical evidence, not a shipped player or family UI. Media, dependencies, executable bundles, and volatile logs remain on `H:/PTI-OnePiece/pilot/browser-native`. No full video was downloaded by the JS pilot; bounded fragments were used. Native/direct browser source bytes bypass its JS byte counter.

## Findings established so far

| Candidate | Real result | Interpretation |
|---|---|---|
| Chrome native original, episode 1 | Parent-operated real Chrome displayed 1280×720 video; first `playing` at 5.486 s; metadata at 5.448 s. `textTracks` empty; audio-track API unavailable. | Native MKV/H.264 playback works on this PC. Required English captions were not supplied automatically. Japanese hearing not verified. |
| Chrome native original, episode 1001 | Parent-operated real Chrome displayed 1920×1080 video; first `playing` 18.677 s, with early stalls until 27.088 s. `textTracks` empty; audio-track API unavailable. | Native MKV/HEVC playback works on this PC. Original default English cannot be assumed to become Japanese. Does not establish Android support. |
| libav.js Node, episode 1 | Track probe 6.117 s / 651,471 bytes. Japanese track 1; full-English ASS track 2. Indexed seek produced first video timestamp 596.346 and read to 622.331, with 7 ASS dialogue events. | Real seekable remote demux and incremental embedded-caption extraction established. |
| libav.js Node, episode 1001 **probe only** | 42.736 s / 12,147,475 bytes. HEVC video; Japanese audio index 2; full-English ASS index 4; index 3 is Song & Signs. 39 font attachments are present. | Correct tracks can be identified; this default probe misses the startup target. No remux or audiovisual proof was attempted in this run. |
| Episode 1 compressed copy/remux | First 22-second fragment: 21.436 s after probe / 5 MiB; 3 real dialogue cues. Seek window: 26.155 s / 5,894,351 bytes. | Missing/nonmonotonic DTS warnings mean this hand-written fMP4 path is **not accepted playback**. It is not proof that browser processing is impossible. |
| VLC 3.0.20 headless, episode 1 | Playback/track availability 8.109 s; explicitly selected Japanese ID 1, English ID 2. Decoder counters advanced after a 600 s seek, recovering in 2.000 s. 21,759,847 input bytes at final sample. | Native decoding, track selection and seek work technically. Dummy outputs cannot prove heard Japanese or rendered subtitles. |
| VLC 3.0.20 headless, episode 1001 | Playback/track availability 15.110 s; Japanese ID 2, full-English ID 4 (excluded Song & Signs ID 3). Seek recovery 2.000 s, decoder counters advanced. 32,579,801 input bytes. | Native decoding and explicit language selection are viable. Human audiovisual verification remains required. |

The initial Chrome failure in `confounded-coep-native-episode-1.json` ran under `Cross-Origin-Embedder-Policy: require-corp`. It is invalid evidence of MKV incompatibility. That policy was removed; the successful native runs have `isolated:false`.

The Node timings used the earlier 512 KiB request blocks. Current hardened range IO uses 1 MiB blocks with an eight-block LRU. Node final resident memory was 81,678,336 bytes for episode 1 and 129,499,136 for episode 1001; these are process end samples, not peak browser/mobile usage. Episode 1's remux timing includes buffering a whole 22-second test window and therefore is not the lower bound for an incremental player.

VLC logs contain dummy-output/hardware blend warnings. Python's `media.tracks_get()` also caused an access violation with this installed library/binding pair before it was replaced with stable track-description APIs. Final persisted native runs use the latter APIs and exit normally. Neither issue is hidden as a viewing success.

## Lighter browser candidate

The harness now includes **native original video plus incremental ASS overlay** for episode 1. It does not repackage or convert the video, and it retains the original's single Japanese audio track. Subtitle extraction is separately bounded to 8 MiB and three initial events. JASSUB runs with its documented single-thread fallback, without restrictive COEP. It uses a substitute font; full font fidelity is unproven.

Parent's first real Chrome observation, saved in `chrome-native-ass-episode-1-warm.json`: native `playing` at 1.138 s with a warmed browser media cache; probe 4.413 s; subtitle extraction 13.007 s / 4 MiB; ASS renderer ready at 17.713 s. Total JS-demux input was 5,894,351 bytes. Browser JS heap at ready was 16,720,679 bytes (not total browser/WASM/device memory). Video was at 15.136 s when ASS became ready, before the first 16.73 s cue. This meets neither a strict 15-second all-tracks-ready claim nor a cold-video-start claim. Final visual subtitle evidence is recorded separately after the cue check; merely constructing JASSUB is insufficient.

## Verification and hardening

- Range-reader tests: **7/7 passed** (six scenarios plus containing test): correct bounded bytes, refuse 200, mismatched total/range, false length, streamed overflow/cancellation, truncation.
- Live server checks: wrong Host **403**; foreign Origin **403**; own-origin `text/plain` **403**; body declaration over 512 KB **413**.
- Static/syntax checks passed for server, browser app, media module, and Python pilot. Independent reviewer rechecked both security fixes.
- The loopback server only permits its exact Host names; evidence writes require exact own Origin and JSON, with a 512 KB request and 20 MiB aggregate browser-evidence cap. Range reads validate exact `Content-Range`, optional length, and a bounded streaming body.
- Browser UI operation and screenshots are owned by the parent through CUA. No shell-driven Playwright/Puppeteer or browser automation was used in this lane.

## Remaining gates

Human listening, full visual subtitle proof across both collections, all fonts, continuous incremental subtitle updates, episode transitions, true cold startup, Android/mobile memory, real Cast receiver behavior, three simultaneous streams, PWA install, PTI hosting, and LAN TLS are not established here. Direct native playback is a useful candidate, not a complete solution: episode 1001 still needs dependable Japanese selection and both originals need English caption delivery.

Reproduction commands and dependency lock are under `apps/one-piece/companion/pilot/browser/README.md`. Official API background: [libav.js](https://github.com/Yahweasel/libav.js), [JASSUB](https://github.com/ThaUnknown/jassub), [python-vlc](https://github.com/oaubert/python-vlc).
