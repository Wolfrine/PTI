"""One explicitly authorized cached-original comparison, not a cache service."""
import argparse
import hashlib
import json
import pathlib
import re
import subprocess
import time
import urllib.parse
import urllib.request

import pilot

CASE = pilot.ROOT / "cache/cached-case"
ORIGINAL = CASE / "episode-1.mkv"
INFO = pilot.ROOT / "private/cached-playback.json"
EPISODE = 1
EXPECTED_BYTES = 357167311
DOWNLOAD_LIMIT = 500 * 1024 * 1024
TOTAL_LIMIT = 20 * 1024**3


def configure(episode):
    global EPISODE, CASE, ORIGINAL, INFO, EXPECTED_BYTES, DOWNLOAD_LIMIT
    EPISODE = episode
    if episode == 1001:
        CASE = pilot.ROOT / "cache/cached-case-1001"
        ORIGINAL = CASE / "episode-1001.mkv"
        INFO = pilot.ROOT / "private/cached-playback-1001.json"
        EXPECTED_BYTES = 844716819
        DOWNLOAD_LIMIT = 2 * 1024**3


def save(name, data):
    if EPISODE != 1:
        name = name.replace("cached-", f"cached-{EPISODE}-", 1)
    pilot.save(name, data)


def download():
    CASE.mkdir(parents=True, exist_ok=True)
    # Count all shared pilot data conservatively, not just this engine's files.
    stored = sum(p.stat().st_size for p in pilot.ROOT.parents[1].rglob("*") if p.is_file()
                 and not any(part in p.parts for part in ["runtime", "downloads", "tools"]))
    if stored + EXPECTED_BYTES >= TOTAL_LIMIT:
        raise RuntimeError("Refusing cached experiment: 20 GiB total budget could be exceeded")
    identifier = "one-piece-0001-1000-1999-horrible-subs" if EPISODE == 1 else "20260622_20260622_0310"
    with urllib.request.urlopen("https://archive.org/metadata/" + identifier, timeout=30) as response:
        metadata = json.load(response)
    fixtures = json.loads((pilot.EVIDENCE / "source-fixtures.json").read_text())
    fixture = next(f for f in fixtures if f["episode"] == EPISODE)
    entry = next(f for f in metadata["files"] if f["name"] == fixture["name"])
    if int(entry["size"]) != EXPECTED_BYTES or not entry.get("md5"):
        raise RuntimeError("Source size changed or Archive MD5 is unavailable")
    if EXPECTED_BYTES > DOWNLOAD_LIMIT:
        raise RuntimeError("Source is larger than the explicitly approved experiment ceiling")
    result = {"episode": EPISODE, "expectedBytes": EXPECTED_BYTES, "expectedArchiveMd5": entry["md5"],
              "maximumBytes": DOWNLOAD_LIMIT, "maximumSeconds": 180, "totalBudgetBeforeBytes": stored,
              "source": fixture["source"], "newDownload": not ORIGINAL.exists()}
    if ORIGINAL.exists():
        result.update({"downloadSeconds": 0, "downloadBytes": 0, "reusedExistingFile": True})
        candidate = ORIGINAL
    else:
        candidate = CASE / f"episode-{EPISODE}.mkv.partial"
        command = ["curl.exe", "--location", "--fail", "--silent", "--show-error", "--retry", "0",
                   "--connect-timeout", "20", "--max-time", "180", "--max-filesize", str(DOWNLOAD_LIMIT),
                   "--output", str(candidate), "--write-out", "%{json}", fixture["source"]]
        started = time.monotonic()
        process = subprocess.run(command, capture_output=True, text=True, timeout=185)
        result.update({"wallSeconds": time.monotonic()-started, "curlExitCode": process.returncode,
                       "downloadBytes": candidate.stat().st_size if candidate.exists() else 0})
        if process.stdout.strip():
            metrics = json.loads(process.stdout)
            result["downloadSeconds"] = metrics.get("time_total")
            result["reportedNetworkDownloadBytes"] = metrics.get("size_download")
            result["httpStatus"] = metrics.get("http_code")
            result["averageBytesPerSecond"] = metrics.get("speed_download")
        if process.returncode:
            result.update({"failed": True, "reason": process.stderr.strip()[:500]})
            save("cached-download.json", result)
            print(json.dumps(result, indent=2))
            return False
    result["actualFileBytes"] = candidate.stat().st_size
    result["actualMd5"] = hashlib.file_digest(candidate.open("rb"), "md5").hexdigest()
    result["verified"] = result["actualFileBytes"] == EXPECTED_BYTES and result["actualMd5"] == entry["md5"]
    if result["verified"] and candidate != ORIGINAL:
        candidate.rename(ORIGINAL)
    save("cached-download.json", result)
    print(json.dumps(result, indent=2))
    return result["verified"]


def prepare():
    state = json.loads(pilot.STATE.read_text())
    token = state["token"]
    options = json.loads((pilot.EVIDENCE / "library-options.json").read_text())
    options["PathInfos"] = [{"Path": str(CASE)}]
    folders, _ = pilot.api("/Library/VirtualFolders", token=token)
    library_name = "PTI local cached pilot" + (f" {EPISODE}" if EPISODE != 1 else "")
    if not any(f["Name"] == library_name for f in folders):
        pilot.api("/Library/VirtualFolders?name=" + urllib.parse.quote(library_name) + "&collectionType=movies&refreshLibrary=false",
                  {"LibraryOptions": options}, "POST", token)
    save("cached-library-options.json", options)
    started = time.monotonic()
    pilot.api("/Library/Refresh", {}, "POST", token)
    item = None
    while time.monotonic()-started < 30:
        items, _ = pilot.api("/Items?Recursive=true&IncludeItemTypes=Movie&Fields=MediaSources,MediaStreams,Path", token=token)
        item = next((i for i in items["Items"] if i.get("Path") == str(ORIGINAL)), None)
        if item and item.get("MediaSources") and item["MediaSources"][0].get("MediaStreams"):
            break
        time.sleep(.25)
    if not item:
        raise RuntimeError("Local cached episode was not discovered")
    save("cached-library-scan.json", {"seconds": time.monotonic()-started, "item": pilot.sanitized(item)})
    source = item["MediaSources"][0]
    selected = pilot.selected_tracks(source)
    selected["MediaSourceId"] = source["Id"]
    profile = {"Name": "PTI cached HLS pilot", "MaxStreamingBitrate": 10000000,
               "DirectPlayProfiles": [], "TranscodingProfiles": [{"Container": "ts", "Type": "Video",
                 "VideoCodec": "h264", "AudioCodec": "aac", "Protocol": "hls", "Context": "Streaming",
                 "MinSegments": 1, "SegmentLength": 3, "MaxAudioChannels": "2"}],
               "SubtitleProfiles": [{"Format": "vtt", "Method": "External"}, {"Format": "ass", "Method": "External"}]}
    info, elapsed = pilot.api(f'/Items/{item["Id"]}/PlaybackInfo', {"UserId": state["userId"],
          "DeviceProfile": profile, "EnableDirectPlay": False, "EnableDirectStream": True,
          "EnableTranscoding": True, "AllowVideoStreamCopy": True, "AllowAudioStreamCopy": True,
          **selected, "MaxStreamingBitrate": 10000000}, "POST", token, timeout=30)
    INFO.write_text(json.dumps(info), encoding="utf8")
    save("cached-playback-info.json", {"seconds": elapsed, "selection": selected, "response": pilot.sanitized(info)})
    print(json.dumps({"localPlaybackInfoSeconds": elapsed, "selection": selected}))


def captions():
    state = json.loads(pilot.STATE.read_text())
    info = json.loads(INFO.read_text())
    source = info["MediaSources"][0]
    selected = pilot.selected_tracks(source)
    stream = next(s for s in source["MediaStreams"] if s["Index"] == selected["SubtitleStreamIndex"])
    results = []
    for mode in ["cold", "warm"]:
        started = time.monotonic()
        try:
            text, elapsed = pilot.api(stream["DeliveryUrl"].split("?")[0], token=state["token"], timeout=90)
            (CASE / f"episode-{EPISODE}.ass").write_text(text, encoding="utf8")
            result = {"mode": mode, "seconds": elapsed, "bytes": len(text.encode()), "dialogueLines": text.count("Dialogue:"),
                      "sha256": hashlib.sha256(text.encode()).hexdigest(), "renderedOrListened": False}
        except Exception as error:
            result = {"mode": mode, "seconds": time.monotonic()-started, "error": type(error).__name__}
            pilot.stop_encodings()
        results.append(result)
        save("cached-subtitles.json", results)
        print(json.dumps(result))
        if "error" in result:
            break


def hls(seek, label):
    state = json.loads(pilot.STATE.read_text())
    info = json.loads(INFO.read_text())
    url = pilot.BASE + info["MediaSources"][0]["TranscodingUrl"]
    parsed = urllib.parse.urlsplit(url)
    query = {k: v for k, v in urllib.parse.parse_qs(parsed.query).items() if k.lower() != "starttimeticks"}
    url = urllib.parse.urlunsplit(parsed._replace(query=urllib.parse.urlencode(query, doseq=True)))
    started = time.monotonic()
    result = {"episode": EPISODE, "label": label, "seekSeconds": seek, "sourceIsVerifiedLocalFile": True,
              "upstreamMediaBytesDuringPlayback": 0, "renderedOrListened": False, "requests": []}
    try:
        for _ in range(4):
            request = urllib.request.Request(url, headers={"Authorization": 'MediaBrowser Token="' + state["token"] + '"'})
            with urllib.request.urlopen(request, timeout=max(1, 90-(time.monotonic()-started))) as response:
                raw = response.read()
                mime = response.headers.get("Content-Type", "")
            result["requests"].append({"path": urllib.parse.urlsplit(url).path, "bytes": len(raw), "mime": mime,
                                       "elapsedSeconds": time.monotonic()-started})
            if raw.startswith(b"#EXTM3U"):
                text = raw.decode()
                lines = [line.strip() for line in text.splitlines() if line.strip() and not line.startswith("#")]
                following = lines[0]
                if "#EXTINF:" in text and seek:
                    durations = [float(line.split(":", 1)[1].split(",")[0]) for line in text.splitlines() if line.startswith("#EXTINF:")]
                    position = 0
                    for index, duration in enumerate(durations):
                        if position + duration > seek:
                            break
                        position += duration
                    following = lines[min(index, len(lines)-1)]
                    result["playlistSegmentStartSeconds"] = position
                url = urllib.parse.urljoin(url, following)
            else:
                destination = CASE / f"{label}.ts"
                destination.write_bytes(raw)
                result.update({"seconds": time.monotonic()-started, "outputBytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()})
                probe = subprocess.run([str(pilot.ROOT / "runtime/jellyfin/ffprobe.exe"), "-v", "error", "-show_entries",
                       "format=start_time,duration:stream=codec_name,codec_type,start_time,duration", "-of", "json", str(destination)], capture_output=True, text=True, timeout=10)
                save(f"cached-{label}-codecs.json", json.loads(probe.stdout))
                break
    except Exception as error:
        result.update({"seconds": time.monotonic()-started, "error": type(error).__name__})
    result["encoderChildrenStopped"] = pilot.stop_encodings()
    save(f"cached-{label}.json", result)
    print(json.dumps(result, indent=2))


def reset_generated():
    """Preserve one case's generated segments to measure a fresh local seek."""
    pilot.stop_encodings()
    info = json.loads(INFO.read_text())
    source_id = info["MediaSources"][0]["Id"]
    logs = sorted((pilot.ROOT / "logs").glob(f"FFmpeg.*_{source_id}_*.log"), key=lambda p: p.stat().st_mtime, reverse=True)
    match = None
    for log in logs:
        text = log.read_text(errors="replace")
        if str(ORIGINAL) in text:
            match = re.search(r'-hls_segment_filename "([^"%]+)%d\.ts"', text)
            if match:
                break
    if not match:
        raise RuntimeError("No local-case HLS generation path found; refusing cache mutation")
    prefix_path = pathlib.Path(match.group(1))
    transcodes = pilot.ROOT / "cache/transcodes"
    if prefix_path.resolve().parent != transcodes.resolve() or not re.fullmatch(r"[a-f0-9]{32}", prefix_path.name):
        raise RuntimeError("Generated path is outside the isolated experiment cache")
    files = list(transcodes.glob(prefix_path.name + "*"))
    destination = CASE / "prior-remux"
    destination.mkdir(exist_ok=True)
    size = 0
    for file in files:
        if file.resolve().parent != transcodes.resolve() or file.suffix not in [".ts", ".m3u8"]:
            raise RuntimeError("Unexpected generated cache file")
        size += file.stat().st_size
        target = destination / file.name
        if target.exists():
            raise RuntimeError("Prior generated file already preserved; refusing overwrite")
        file.rename(target)
    result = {"episode": EPISODE, "purpose": "Isolate local-original seek from pre-existing generated HLS segments",
              "localOnlyPrefix": prefix_path.name, "movedGeneratedFiles": len(files), "movedGeneratedBytes": size,
              "sourceOriginalRetained": True, "remotePilotFilesUntouched": True}
    save("cached-seek-remux-reset.json", result)
    print(json.dumps(result))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["download", "prepare", "captions", "hls", "reset-remux"])
    parser.add_argument("--seek", type=float, default=0)
    parser.add_argument("--label", default="hls-start")
    parser.add_argument("--episode", type=int, choices=[1, 1001], default=1)
    args = parser.parse_args()
    configure(args.episode)
    if args.action == "hls":
        hls(args.seek, args.label)
    else:
        {"download": download, "prepare": prepare, "captions": captions, "reset-remux": reset_generated}[args.action]()
