"""Isolated Jellyfin feasibility probes. Credentials and all media stay on H:.

This is an experiment harness, not the family companion or a media server.
"""
import argparse
import hashlib
import json
import pathlib
import secrets
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(r"H:\PTI-OnePiece\pilot\jellyfin")
EVIDENCE = pathlib.Path(__file__).resolve().parents[5] / "docs/one-piece/evidence/jellyfin"
BASE = "http://127.0.0.1:18096"
STATE = ROOT / "private/state.json"


def api(path, body=None, method=None, token=None, timeout=90):
    headers = {"Content-Type": "application/json", "Authorization":
               'MediaBrowser Client="PTI feasibility pilot", Device="Windows", DeviceId="pti-one-piece-pilot", Version="1"'}
    if token:
        headers["Authorization"] += ', Token="' + token + '"'
    request = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None,
                                     headers=headers, method=method)
    started = time.monotonic()
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read()
        result = json.loads(raw) if response.headers.get_content_type() == "application/json" and raw else raw.decode(errors="replace")
        return result, time.monotonic() - started


def save(name, data):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / name).write_text(json.dumps(data, indent=2), encoding="utf8")


def sanitized(data):
    if isinstance(data, dict):
        return {key: (str(value).split("?")[0] if key in ["DeliveryUrl", "TranscodingUrl"] else sanitized(value))
                for key, value in data.items()}
    if isinstance(data, list):
        return [sanitized(value) for value in data]
    return data


def stop_encodings():
    """Bound upstream work to this exclusive isolated pilot, not other agents."""
    command = ["pwsh", "-NoProfile", "-File", str(pathlib.Path(__file__).with_name("stop.ps1")), "-EncodersOnly"]
    result = subprocess.run(command, capture_output=True, text=True, timeout=20)
    return result.returncode == 0


def setup():
    ROOT.joinpath("private").mkdir(parents=True, exist_ok=True)
    if STATE.exists():
        state = json.loads(STATE.read_text())
        disable_tasks(state)
        print("Existing private pilot account retained; task triggers disabled.")
        return
    pending = ROOT / "private/pending-account.json"
    if pending.exists():
        password = json.loads(pending.read_text())["password"]
    else:
        password = secrets.token_urlsafe(32)
        pending.write_text(json.dumps({"password": password}), encoding="utf8")
    api("/Startup/FirstUser")
    api("/Startup/User", {"Name": "pti-private-pilot", "Password": password}, "POST")
    api("/Startup/RemoteAccess", {"EnableRemoteAccess": False, "EnableAutomaticPortMapping": False}, "POST")
    api("/Startup/Complete", {}, "POST")
    auth, _ = api("/Users/AuthenticateByName", {"Username": "pti-private-pilot", "Pw": password}, "POST")
    state = {"username": "pti-private-pilot", "password": password, "token": auth["AccessToken"], "userId": auth["User"]["Id"]}
    STATE.write_text(json.dumps(state), encoding="utf8")
    disable_tasks(state)
    print("Private random-password pilot account created. All scheduled task triggers disabled.")


def disable_tasks(state):
    tasks, _ = api("/ScheduledTasks", token=state["token"])
    disabled = []
    for task in tasks:
        api(f'/ScheduledTasks/{task["Id"]}/Triggers', [], "POST", state["token"])
        disabled.append({"Name": task["Name"], "Key": task["Key"], "Triggers": []})
    save("scheduled-tasks.json", disabled)


def library():
    state = json.loads(STATE.read_text())
    token = state["token"]
    files = []
    for identifier, episode in [("one-piece-0001-1000-1999-horrible-subs", 1), ("20260622_20260622_0310", 1001)]:
        with urllib.request.urlopen("https://archive.org/metadata/" + identifier, timeout=40) as response:
            metadata = json.load(response)
        import re
        candidates = [f for f in metadata["files"] if f["name"].lower().endswith(".mkv") and
                      re.search(rf" - 0*{episode}(?:\D|$)", f["name"].split("/")[-1])]
        if len(candidates) != 1:
            raise ValueError(f"Expected one original for episode {episode}, found {len(candidates)}")
        file = candidates[0]
        url = "https://archive.org/download/" + identifier + "/" + urllib.parse.quote(file["name"], safe="/")
        ROOT.joinpath("library", f"One Piece - {episode:04d}.strm").write_text(url + "\n", encoding="utf8")
        files.append({"episode": episode, "name": file["name"], "size": int(file["size"]), "source": url})
    options = {"Enabled": True, "EnableRealtimeMonitor": False, "EnableLUFSScan": False,
               "EnableChapterImageExtraction": False, "ExtractChapterImagesDuringLibraryScan": False,
               "EnableTrickplayImageExtraction": False, "ExtractTrickplayImagesDuringLibraryScan": False,
               "EnableInternetProviders": False, "SaveLocalMetadata": False,
               "AutomaticRefreshIntervalDays": 0, "MetadataSavers": [], "SubtitleDownloadLanguages": [],
               "AllowEmbeddedSubtitles": "AllowAll", "TypeOptions": [{"Type": "Movie", "MetadataFetchers": [], "ImageFetchers": []}],
               "PathInfos": [{"Path": str(ROOT / "library")}], "SaveSubtitlesWithMedia": False}
    api("/Library/VirtualFolders?name=PTI%20two%20episode%20pilot&collectionType=movies&refreshLibrary=false",
        {"LibraryOptions": options}, "POST", token)
    save("source-fixtures.json", files)
    save("library-options.json", options)
    started = time.monotonic()
    api("/Library/Refresh", {}, "POST", token)
    deadline = time.monotonic() + 90
    items = []
    while time.monotonic() < deadline:
        response, _ = api("/Items?Recursive=true&IncludeItemTypes=Movie&Fields=MediaSources,MediaStreams,Path", token=token)
        items = response.get("Items", [])
        if len(items) >= 2:
            break
        time.sleep(1)
    save("library-scan.json", {"seconds": time.monotonic() - started, "items": items})
    print(json.dumps({"seconds": round(time.monotonic() - started, 3), "items": [{"Name": i["Name"], "Id": i["Id"], "MediaStreams": len(i.get("MediaStreams", []))} for i in items]}, indent=2))


def playback(episode):
    state = json.loads(STATE.read_text())
    token = state["token"]
    items, _ = api("/Items?Recursive=true&IncludeItemTypes=Movie&Fields=MediaSources,MediaStreams,Path", token=token)
    item = next(i for i in items["Items"] if f"{episode:04d}.strm" in i["Path"])
    profile = {"Name": "PTI browser-compatible HLS pilot", "MaxStreamingBitrate": 10000000,
               "DirectPlayProfiles": [], "TranscodingProfiles": [{"Container": "ts", "Type": "Video",
                 "VideoCodec": "h264", "AudioCodec": "aac", "Protocol": "hls", "Context": "Streaming",
                 "MinSegments": 1, "SegmentLength": 3, "MaxAudioChannels": "2"}],
               "SubtitleProfiles": [{"Format": "vtt", "Method": "External"}, {"Format": "ass", "Method": "External"}]}
    started = time.monotonic()
    prior_path = ROOT / "private" / f"playback-{episode}.json"
    selection = {}
    if prior_path.exists():
        prior = json.loads(prior_path.read_text())["MediaSources"][0]
        selection = selected_tracks(prior)
        selection["MediaSourceId"] = prior["Id"]
    try:
        info, elapsed = api(f'/Items/{item["Id"]}/PlaybackInfo', {"UserId": state["userId"],
              "DeviceProfile": profile, "EnableDirectPlay": False, "EnableDirectStream": True,
              "EnableTranscoding": True, "AllowVideoStreamCopy": True, "AllowAudioStreamCopy": True,
              **selection,
              "MaxStreamingBitrate": 10000000, "StartTimeTicks": 0}, "POST", token, timeout=90)
        # Playback URLs can contain the private token. Retain raw response only in private runtime.
        (ROOT / "private" / f"playback-{episode}.json").write_text(json.dumps(info), encoding="utf8")
        safe_info = sanitized(json.loads(json.dumps(info).replace(token, "REDACTED")))
        save(f"playback-info-{episode}.json", {"seconds": elapsed, "response": safe_info})
        print(json.dumps({"episode": episode, "seconds": elapsed, "sources": [{"id": s["Id"], "container": s.get("Container"),
             "streams": [{k: v for k, v in stream.items() if k in ["Index", "Type", "Language", "Codec", "Title", "DisplayTitle"]} for stream in s.get("MediaStreams", [])],
             "transcoding": bool(s.get("TranscodingUrl"))} for s in info.get("MediaSources", [])]}, indent=2))
    except Exception as error:
        save(f"playback-info-{episode}.json", {"seconds": time.monotonic()-started, "error": type(error).__name__, "message": str(error)})
        raise


def selected_tracks(source):
    audio = next(s for s in source["MediaStreams"] if s["Type"] == "Audio" and s.get("Language") in ["jpn", "ja"])
    subtitles = [s for s in source["MediaStreams"] if s["Type"] == "Subtitle" and s.get("Language") in ["eng", "en"]
                 and not any(term in s.get("Title", "").lower() for term in ["sign", "song"])]
    if len(subtitles) != 1:
        raise ValueError("Cannot unambiguously select full-English subtitles")
    return {"AudioStreamIndex": audio["Index"], "SubtitleStreamIndex": subtitles[0]["Index"]}


def subtitle(episode):
    state = json.loads(STATE.read_text())
    info = json.loads((ROOT / "private" / f"playback-{episode}.json").read_text())
    source = info["MediaSources"][0]
    stream = next(s for s in source["MediaStreams"] if s["Type"] == "Subtitle" and s["Index"] == selected_tracks(source)["SubtitleStreamIndex"])
    path = stream["DeliveryUrl"].split("?")[0]
    results = []
    for mode in ["cold", "warm"]:
        started = time.monotonic()
        try:
            text, elapsed = api(path, token=state["token"], timeout=90)
            # Keep subtitle content private; evidence contains timings and hashes only.
            (ROOT / "cache" / f"episode-{episode}.ass").write_text(text, encoding="utf8")
            result = {"episode": episode, "mode": mode, "seconds": elapsed, "bytes": len(text.encode()),
                      "dialogueLines": text.count("Dialogue:"), "sha256": hashlib.sha256(text.encode()).hexdigest(),
                      "containsAssEvents": "[Events]" in text, "listenedOrRendered": False}
        except Exception as error:
            cancelled = stop_encodings()
            result = {"episode": episode, "mode": mode, "seconds": time.monotonic()-started,
                      "error": type(error).__name__, "timeoutSeconds": 90, "encoderChildrenStopped": cancelled}
        results.append(result)
        print(json.dumps(result))
        save(f"subtitle-{episode}.json", results)
        if "error" in result:
            break


def hls(episode, seek):
    state = json.loads(STATE.read_text())
    info = json.loads((ROOT / "private" / f"playback-{episode}.json").read_text())
    url = BASE + info["MediaSources"][0]["TranscodingUrl"]
    parsed = urllib.parse.urlsplit(url)
    query = urllib.parse.parse_qs(parsed.query)
    # Dynamic HLS seeks by segment number. Passing StartTimeTicks through the
    # manifest into a segment request is explicitly rejected by Jellyfin 12.2.
    query = {key: value for key, value in query.items() if key.lower() != "starttimeticks"}
    url = urllib.parse.urlunsplit(parsed._replace(query=urllib.parse.urlencode(query, doseq=True)))
    started = time.monotonic()
    seen = []
    result = {"episode": episode, "startSeconds": seek, "upstreamBytes": None,
              "upstreamBytesNote": "not instrumented; segment bytes below measure Jellyfin output only", "renderedOrListened": False}
    try:
        for _ in range(4):
            request = urllib.request.Request(url, headers={"Authorization": 'MediaBrowser Token="' + state["token"] + '"'})
            with urllib.request.urlopen(request, timeout=max(1, 90-(time.monotonic()-started))) as response:
                raw = response.read()
                mime = response.headers.get("Content-Type", "")
            seen.append({"path": urllib.parse.urlsplit(url).path, "bytes": len(raw), "mime": mime,
                         "elapsedSeconds": time.monotonic()-started})
            if raw.startswith(b"#EXTM3U"):
                text = raw.decode()
                lines = [line.strip() for line in text.splitlines() if line.strip() and not line.startswith("#")]
                if not lines:
                    raise ValueError("HLS manifest contains no media references")
                # Jellyfin's VOD playlist lists the full episode. Request the segment at the seek target.
                if "#EXTINF:" in text and seek:
                    durations = [float(line.split(":", 1)[1].split(",")[0]) for line in text.splitlines() if line.startswith("#EXTINF:")]
                    position = 0
                    index = 0
                    for index, duration in enumerate(durations):
                        if position + duration > seek:
                            break
                        position += duration
                    following = lines[min(index, len(lines)-1)]
                    result["playlistSegmentStartSeconds"] = position
                else:
                    following = lines[0]
                url = urllib.parse.urljoin(url, following)
            else:
                destination = ROOT / "cache" / f"hls-{episode}-{int(seek)}.ts"
                destination.write_bytes(raw)
                result.update({"seconds": time.monotonic()-started, "outputBytes": len(raw),
                               "sha256": hashlib.sha256(raw).hexdigest(), "transportStreamSyncByte": bool(raw and raw[0] == 0x47)})
                break
        else:
            raise ValueError("Too many manifest levels")
    except Exception as error:
        result.update({"seconds": time.monotonic()-started, "error": type(error).__name__})
        if isinstance(error, urllib.error.HTTPError):
            result["httpStatus"] = error.code
    result["requests"] = seen
    result["encoderChildrenStopped"] = stop_encodings()
    save(f"hls-{episode}-{int(seek)}.json", result)
    print(json.dumps(result, indent=2))


def rotate():
    state = json.loads(STATE.read_text())
    old = state["token"]
    api("/Sessions/Logout", {}, "POST", old)
    revoked = False
    try:
        api("/System/Configuration", token=old)
    except urllib.error.HTTPError as error:
        revoked = error.code == 401
    auth, _ = api("/Users/AuthenticateByName", {"Username": state["username"], "Pw": state["password"]}, "POST")
    state["token"] = auth["AccessToken"]
    STATE.write_text(json.dumps(state), encoding="utf8")
    for path in (ROOT / "private").glob("playback-*.json"):
        path.write_text(path.read_text().replace(old, state["token"]), encoding="utf8")
    for path in EVIDENCE.glob("*.json"):
        value = json.loads(path.read_text())
        path.write_text(json.dumps(sanitized(value), indent=2), encoding="utf8")
    result = {"rotated": True, "previousTokenRejected401": revoked, "secretWrittenToRepository": False}
    save("credential-hygiene.json", result)
    print(json.dumps(result))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["setup", "library", "playback", "subtitle", "hls", "rotate"])
    parser.add_argument("--episode", type=int, choices=[1, 1001], default=1)
    parser.add_argument("--seek", type=float, default=0)
    args = parser.parse_args()
    if args.action == "hls":
        hls(args.episode, args.seek)
    elif args.action in ["playback", "subtitle"]:
        {"playback": playback, "subtitle": subtitle}[args.action](args.episode)
    else:
        {"setup": setup, "library": library, "rotate": rotate}[args.action]()
