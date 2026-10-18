# Jellyfin feasibility pilot

This directory contains experiment tools only. It is **not** the production companion, app, or a custom media server. Only two real remote STRM entries are used (episodes 1 and 1001). All downloads, credentials, databases, logs, subtitles, and segments live outside Git on `H:/PTI-OnePiece/pilot/jellyfin`.

Pinned engine: Jellyfin **12.2**, official portable Windows amd64 ZIP, 208,835,205 bytes, downloaded from:

`https://repo.jellyfin.org/files/server/windows/stable/v12.2/amd64/jellyfin_12.2-amd64.zip`

Observed SHA256: `ab247745b54cea9af2460c3d62622f5f30a323b02b92d11cea501b67b9a8d83f`.
This is the hash of the retrieved artifact; the directory did not publish a checksum and the `.sha256sum` URL returned 404. It must not be represented as a publisher-authenticated checksum. GitHub's latest-release API and the official Windows stable index both reported 12.2 on 2026-10-18. The bundle contains FFmpeg/FFprobe **8.1.3-Jellyfin**.

The existing runtime has a private random-password account. Do not print its `private/state.json` or any raw playback URL. API credentials are carried in `Authorization: MediaBrowser ... Token="..."`; Jellyfin 12.2 ignored the older `X-Emby-Authorization` and `X-Emby-Token` headers during this experiment. The private directory has inheritance disabled and access granted to the current Windows user.

Run from the repository root:

```powershell
pwsh -File apps/one-piece/companion/pilot/jellyfin/start.ps1
python apps/one-piece/companion/pilot/jellyfin/pilot.py setup
# Run library only once: it creates the two STRMs and one bounded library.
python apps/one-piece/companion/pilot/jellyfin/pilot.py library
python apps/one-piece/companion/pilot/jellyfin/pilot.py playback --episode 1
python apps/one-piece/companion/pilot/jellyfin/pilot.py subtitle --episode 1
python apps/one-piece/companion/pilot/jellyfin/pilot.py hls --episode 1
python apps/one-piece/companion/pilot/jellyfin/pilot.py hls --episode 1 --seek 600
```

For a newly probed source, the first `playback` call gathers track metadata; repeat `playback` to negotiate the metadata-selected Japanese/full-English tracks, rather than assuming defaults. The repeat request must include `MediaSourceId`: Jellyfin applies supplied track indexes only when it matches the source. `subtitle` chooses full-English by metadata and excludes signs/song tracks. Jellyfin indexes for episode 1001 were Japanese **2**, full-English **4**, signs/song **3**; these differ from track-number conventions used by other tools.

Library real-time scanning, internet providers, chapter images, trickplay, LUFS, refresh timers, metadata saving, and subtitle download languages are disabled. All scheduled task triggers are explicitly cleared after setup. This deliberately avoids a 1,084-episode scan. No service, firewall rule, DNS, certificate, LAN listener, or production setting is installed.

Requests have 90-second timeout budgets. HLS probes and failed subtitle requests stop only this isolated pilot's encoder/probe children using the verified server PID/executable. Do not share this experiment engine with concurrent tests. HLS output files remain on H:. Run one upstream media experiment at a time. This harness does not claim a production cache eviction implementation; inspect total media storage after each bounded probe and stop before 20 GiB. Use `stop.ps1` to stop the entire isolated engine, or `stop.ps1 -EncodersOnly` to leave it on loopback.

Sanitized evidence is written to `docs/one-piece/evidence/jellyfin`. No video/audio/subtitle content belongs in the evidence directory. HLS byte counts refer to Jellyfin output, not upstream consumption. Upstream bytes are unknown unless separately instrumented. A successful response or metadata negotiation does not establish visual rendering, audible Japanese, or actual casting.

## Explicitly approved two-original cache comparisons

`cached_case.py download` defaults to episode 1, with curl's 180-second total deadline, 500 MiB maximum and zero retries. The separately approved `--episode 1001` case has a 2 GiB maximum and the same deadline. Both verify the expected metadata size and Archive MD5 before making a playable local entry. The script checks the shared H:/PTI-OnePiece data footprint conservatively before another download. `prepare`, `captions`, and `hls` test separate local-file libraries; results are `cached-*` for episode 1 and `cached-1001-*` for episode 1001. The original remote failures are untouched. This is a bounded experiment, not a production cache manager.

```powershell
python apps/one-piece/companion/pilot/jellyfin/cached_case.py download
python apps/one-piece/companion/pilot/jellyfin/cached_case.py prepare
python apps/one-piece/companion/pilot/jellyfin/cached_case.py captions
python apps/one-piece/companion/pilot/jellyfin/cached_case.py hls --label hls-start-cold
python apps/one-piece/companion/pilot/jellyfin/cached_case.py hls --seek 600 --label hls-seek-600
# The second approved original uses the same actions with --episode 1001.
python apps/one-piece/companion/pilot/jellyfin/cached_case.py download --episode 1001
python apps/one-piece/companion/pilot/jellyfin/cached_case.py prepare --episode 1001
python apps/one-piece/companion/pilot/jellyfin/cached_case.py captions --episode 1001
python apps/one-piece/companion/pilot/jellyfin/cached_case.py hls --episode 1001 --label hls-start-cold
python apps/one-piece/companion/pilot/jellyfin/cached_case.py reset-remux --episode 1001
python apps/one-piece/companion/pilot/jellyfin/cached_case.py hls --episode 1001 --seek 600 --label hls-seek-600-fresh
```

On 2026-10-18 the full downloads took 29.220s and 127.871s. Following preparation, captions arrived in under one second, while real HLS start/seek segments arrived in under three seconds for both originals. Those are engine timing results on recently downloaded/MD5-read files, not browser/TV tests or proof of <=15s first uncached viewing. Read `CACHED_CASE.md` in the evidence directory for the exact distinction.
