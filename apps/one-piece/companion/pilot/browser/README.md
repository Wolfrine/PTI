# Browser and native feasibility harness

This is a loopback-only technical pilot, not the One Piece app. It reads the independently generated real Archive catalogue. No production auth bypass, media server, PWA shell, or deployment is included.

From the PTI worktree:

```powershell
./apps/one-piece/companion/pilot/browser/setup.ps1
node apps/one-piece/companion/pilot/transport/relay.mjs
# Separate terminal:
node apps/one-piece/companion/pilot/browser/server.mjs
```

Open `http://127.0.0.1:8792/` in real Chrome. Keep the transport relay active on 8793. Setup places pinned packages, bundles, logs, and bounded media fragments exclusively under `H:/PTI-OnePiece/pilot/browser-native`; it makes no OS service or firewall change. Installed VLC 3.0.20 is reused. See the transport README for its own startup flags and byte budget.

The native/direct button tests the original MKV with no COEP restriction. The relay/native button has an important additional constraint: the pilot relay caps every open-ended request at 1 MiB. Failure of that relay mode does not establish that the original is unsupported.

The episode-1 native-plus-ASS button keeps the video on the original native browser path and extracts three English dialogue cues incrementally through libav.js. Japanese is the original's only audio track. It uses JASSUB's single-thread fallback and a default substitute font; full embedded-font fidelity is not proven. At 16.73–22.66 seconds the real introductory dialogue offers a visual caption check. The original video's bytes are not counted by the JS range counter.

The browser remux button is experimental and currently produces missing/nonmonotonic DTS warnings for episode 1. It buffers a 22-second window and then offers an indexed 600-second window. Do not use that buffering time as the theoretical lower bound for streaming, or label its output accepted playback. Episode 1001's Japanese track is identified as index 2 and full English as index 4; index 3 is Song & Signs. HEVC decoding still depends on the device.

Press **Stop and save evidence** after every browser run. JSON appears in the H: evidence directory. The defaults explicitly say that Japanese was not heard, English was not visually confirmed, and TV playback was not tested; append an independently recorded human/visual observation instead of silently flipping these fields.

Headless technical commands:

```powershell
node --test apps/one-piece/companion/pilot/browser/media-probe.test.mjs
node apps/one-piece/companion/pilot/browser/node-probe.mjs 1
node apps/one-piece/companion/pilot/browser/node-probe.mjs 1001 --probe-only
python -u apps/one-piece/companion/pilot/native/vlc_probe.py 1
python -u apps/one-piece/companion/pilot/native/vlc_probe.py 1001
```

Node is a technical WASM/IO check, not browser compatibility evidence. Native VLC uses dummy outputs and explicit Japanese/full-English track selection, then tests a 600-second seek. It logs actual decoder counters and input bytes. Its dummy rendering/hardware blend warnings mean it cannot prove visible subtitles. `media.tracks_get()` is deliberately avoided because the installed VLC/python-vlc combination caused an access violation; stable track-description APIs work.

The range reader rejects whole-file replies, mismatched ranges/lengths, overflow, and truncation. It limits each JS range to 1 MiB and each demux session to 24 MiB (8 MiB for the overlay candidate), with an eight-block LRU. The server binds loopback only, allowlists Host, requires own-origin JSON evidence posts, and caps each evidence body at 512 KB and aggregate browser evidence at 20 MiB. No arbitrary file or URL proxy is exposed.

Pinned npm dependencies are locked alongside this harness. These local pilot bundles are not distributed. Any future distribution must include the required libav.js/JASSUB dependency sources and license material; the official package READMEs explain that obligation.
