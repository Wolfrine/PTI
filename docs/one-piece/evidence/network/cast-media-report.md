# Real Sony TV Cast feasibility evidence

Date: 18 October 2026. Tested on the discovered Sony BRAVIA VU31 (`Bedroom TV`) through Google's Default Media Receiver (`CC1AD845`), using pychromecast 14.0.10 and official Jellyfin FFmpeg 8.1.3. The receiver identified itself as Android TV / Android 14 with a Cast media user agent. This was actual hardware, actual media, and actual subtitle requests.

## Episode 1: both local addressing approaches worked

The cached original contains H.264 720p, Japanese AAC at zero-based stream 1, and English ASS at stream 2. The diagnostic prepared a 600–630-second H.264/AAC excerpt (3,811,672 bytes; approximately 30.03-second mux duration including padding) and nine actual shifted English WebVTT cues (663 bytes).

| Run | Address | Prepared clip load to PLAYING | Real MP4/VTT fetched | Pause, seek, play | Subtitles off/on |
| --- | --- | --- | --- | --- | --- |
| Initial | Private LAN IP | 5.016 seconds | Yes | Passed | English active; toggle not tested in initial run |
| Initial | `onepiece-cast.local` | 2.500 seconds | Yes | Passed | English active; toggle not tested in initial run |
| Repeat | Private LAN IP | 4.500 seconds | Yes | Passed | Passed |
| Repeat | `onepiece-cast.local` | 1.016 seconds | Yes | Passed | Passed |

The TV fetched video with byte-range HTTP 206 and WebVTT with HTTP 200. The VTT request used origin `https://www.gstatic.com` and received the matching CORS header. Actual receiver status showed English track 1 active, confirmed pause, and confirmed a seek to approximately 12 seconds with playback resumed. Turning subtitles off produced an empty active-track list; turning English on restored `[1]`.

Raw evidence: `cast-media-results.json`, `cast-media-results-v2.json`, and read-only `cast-post-pilot-status.json`. Each media run reserved approximately 7.63 MB of response payload, below the 100 MiB ceiling. Both runs stopped and quit only the pilot-owned receiver session; the postcheck reported no active receiver application.

The orchestrating agent asked the owner: “I’m testing a short clip on the Sony ‘Bedroom TV.’ If you’re near it, please check whether you hear Japanese dialogue and see English dialogue subtitles, and tell me what you observe.” The owner replied: **“Yes it worked.”** The parent checked the chat timestamp: **13:12:12.684 IST**, after initial playback and during the repeat. This is affirmative human observation of this short hardware test, relayed by the parent agent. It is not a quantitative subtitle-sync measurement or proof across the full collection.

## Episode 1001: correct original tracks and actual receiver playback

Source2's cached original was independently verified against its Archive MD5 by the Jellyfin pilot agent. FFprobe showed HEVC video, English-default AAC stream 1, Japanese AAC stream 2, signs/song ASS stream 3, and full-English ASS stream 4 (title `English`). This test explicitly selected streams **2 and 4**, excluding the defaults.

The prepared excerpt uses H.264 1080p/AAC Japanese (5,584,185 bytes) plus ten actual shifted full-English WebVTT cues (794 bytes). The original HEVC was converted for this receiver-compatible comparison; direct HEVC Cast was not tested here.

- Actual TV MP4 fetch: **13:16:07.107 IST**, HTTP 206.
- Actual TV English WebVTT fetch: **13:16:07.605 IST**, HTTP 200.
- Prepared-clip load to PLAYING: **4.015 seconds**.
- Pause, seek, play, English-active, subtitles-off, and English-on checks all passed.
- The owner was asked separately about episode 1001 and replied “Yea” at **13:15:56.773 IST**, as verified by the parent from the chat record. That reply preceded the **13:16:07 IST** source2 media load and is **not accepted as source2 human observation**.

Raw evidence: `cast-source2-preparation.json`, `cast-source2-results.json`, and `cast-post-source2-status.json`.

A final source2 observation replay reported actual PLAYING at **13:18:35.657 IST**, with English track 1 active. It ran without playback controls or queue changes, naturally finished at **13:19:06.197 IST**, and safely cleaned up by **13:19:06.766 IST**. The parent then asked: “Did the episode 1001 replay that just played on the TV have Japanese dialogue and visible English subtitles? Your earlier reply arrived before that clip started.” The owner replied: **“Yes, both worked.”** The parent verified this reply's timestamp as **13:21:48.390 IST**. That distinct post-replay confirmation establishes human Japanese-audio/English-caption observation for this short source2 excerpt. The accepted observations and excluded premature reply are retained in `cast-owner-observations.json`.

This replay made two actual receiver fetches, reserved about 5.59 MB, and introduced no new download. Evidence: `cast-source2-observation-replay.json`. The final read-only `cast-final-status.json` reports no active receiver app.

Final Windows listening-socket enumeration found no listener on either pilot port 8794 or 8795 (`cast-final-listeners.json`). A separate raw socket attempt timed out on those ports; that connectivity failure alone was not used as proof that listeners were closed.

## Representative cross-source automatic transition

The same source2 run loaded a two-item Default Media Receiver queue using real prepared excerpts from episode 1 and episode 1001. It started the source1 excerpt at 25 seconds, then allowed natural queue advancement. Each queue item explicitly carried the English track and `activeTrackIds: [1]`.

- Source1 near-end playback confirmed at **13:16:18.262 IST**.
- Automatic source2 playback confirmed at **13:16:23.771 IST**, with English track 1 still active.
- The TV made new MP4 and real WebVTT requests for source2.
- The run reserved approximately **13.03 MB** total responses, then cleaned up its own session. A read-only follow-up reported no active receiver app.

This establishes receiver queue feasibility across prepared excerpts from both real collections. It does **not** establish full episode 1000→1001 playback, long-lived tickets, unattended phone-sleep transitions, or uninterrupted full-length playback. The saved 3-second post-transition time is an adjusted receiver estimate; the initial transition itself has actual reported PLAYING status. The diagnostic now polls for actual reported post-transition progression on future runs.

Two receiver connection resets were observed on keep-alive connections during the source2 transition/cleanup. They did not prevent the confirmed controls or queue transition. The pilot handler was adjusted to record such disconnects without an IP/path-bearing traceback.

## What this proves, and remaining gates

The real Sony receiver can retrieve ticketed LAN HTTP MP4 and English WebVTT; it can also resolve and play through the tested ephemeral `.local` hostname. The initial Windows `getaddrinfo` intermittency remains separate; one successful receiver test does not establish permanent DNS reliability on every client.

These results use prepared short excerpts and a Python diagnostic sender. They do not establish production HTTPS trust, authenticated PTI sender behavior, actual Android PWA installation, cold full-episode latency, exact ASS typography/fidelity, three simultaneous viewers, HDMI sound/display, receiver reconnect after phone sleep, PC reboot recovery, or full-length cross-source transitions. No production transport was accepted and no local DNS/router/firewall/CA or permanent service setting was changed.

Code and reproduction commands: `apps/one-piece/companion/pilot/network/cast-media-README.md`. Browser and caption requirements were checked against [Google Cast track/CORS documentation](https://developers.google.com/cast/docs/web_sender/advanced) and [queue item documentation](https://developers.google.com/cast/docs/reference/web_sender/chrome.cast.media.QueueItem).
