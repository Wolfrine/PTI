# Bounded actual-TV media pilot

This diagnostic uses the actual cached Archive originals. It is not the PTI app, a permanent service, a cloud relay, or an accepted production transport. It does not download another full episode.

Requirements: the existing isolated Python tools from `requirements-pilot.txt` (pychromecast 14.0.10), zeroconf 0.151.5, and official Jellyfin FFmpeg 8.1.3. Runtime media stays under `H:/PTI-OnePiece/pilot/network/cast-assets/`.

## Prepare without touching the TV

```powershell
python apps/one-piece/companion/pilot/network/cast-media-pilot.py --episode 1001 --queue-from-1 --prepare-only --output docs/one-piece/evidence/network/cast-source2-preparation.json
```

Only these exact cached originals are accepted:

- Episode 1: `H:/PTI-OnePiece/pilot/jellyfin/cache/cached-case/episode-1.mkv`
- Episode 1001: `H:/PTI-OnePiece/pilot/jellyfin/cache/cached-case-1001/episode-1001.mkv`

The script selects Japanese by language, and full English by language while excluding subtitle titles containing `Song` or `Sign`. It makes a 600–630-second excerpt and maps Japanese explicitly. Video is H.264/yuv420p, audio AAC, and the MP4 gets fast-start metadata. English ASS is converted to actual WebVTT cues, clipped to the same window, and shifted by -600 seconds. ASS positioning and typography are not preserved in this plain WebVTT pilot.

The measured mux duration is approximately 30.03 seconds due to encoding/container padding. The content window is bounded to 30 seconds. The MP4 and VTT have their sizes and SHA256 recorded in preparation evidence; no media is written into Git.

## Actual TV tests

```powershell
python apps/one-piece/companion/pilot/network/cast-media-pilot.py --local-test --output docs/one-piece/evidence/network/cast-media-results.json
python apps/one-piece/companion/pilot/network/cast-media-pilot.py --episode 1001 --queue-from-1 --output docs/one-piece/evidence/network/cast-source2-results.json
python apps/one-piece/companion/pilot/network/cast-media-pilot.py --episode 1001 --observe-only --output docs/one-piece/evidence/network/cast-source2-observation-replay.json
```

Do not run both concurrently. The pilot discovers `Bedroom TV` and reads its status before loading anything. An existing receiver application/media session prevents the test. The script does not change volume. Successful tests exercise real playback, pause, seek, resume, and English subtitles off/on. `--local-test` additionally tests the same assets using ephemeral `onepiece-cast.local` mDNS. `--queue-from-1` tests a representative source1-to-source2 excerpt transition, starting the first excerpt at 25 seconds and allowing its natural end to advance. This is not full episode 1000→1001 acceptance.

`--observe-only` uses one transport and lets one clip reach its natural end without playback/subtitle controls or a queue. It emits a sanitized `actual_receiver_playing` event for coordinating owner observation. Ask for confirmation only after the actual event; a reply before media load is not valid evidence.

The default receiver runs on the real TV. HTTP is restricted to one private LAN interface, an exact asset allowlist, a random capability held only in memory, a 15-minute maximum lifetime, and a conservative 100 MiB total response budget. Requests get byte-range support and exact receiver-origin CORS (`https://www.gstatic.com`). No Firebase or administrator token reaches HTTP. Capability URLs are omitted from logs and JSON. All media endpoints are closed at completion; cleanup targets only the receiver session owned by the pilot, using its captured session ID. No firewall, router, DNS, CA-trust, or permanent-service setting is changed.

`--http-only` tests HTTP range, HEAD, OPTIONS, and subtitle behavior without discovering or launching a TV. Unknown paths and wrong capability paths are denied by the fixed route check.

## Evidence interpretation

Actual receiver HTTP requests, media states, current times, active tracks, controls, and cleanup status are saved in JSON. Television picture, sound, and visible captions need owner observation; player state and active-track metadata alone are insufficient. Keep the precise owner question/reply alongside telemetry. Startup times here begin with an already prepared short clip and do not measure cold Archive access, full-episode subtitle preparation, Jellyfin negotiation, the PTI app, or three viewers.

The source2 run observed two receiver keep-alive resets during transition/cleanup; playback and controls still succeeded. The handler now records such disconnects without an unsanitized traceback. A read-only status check after each completed run verifies that the pilot did not leave its app running.
