"""Bounded real-media Google Cast pilot. No production endpoint or TLS claim.

Uses cached Archive episodes, 30-second Japanese H264/AAC clips, and actual
English cues. Capability ticket is held only in RAM and excluded from logs.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.metadata
import ipaddress
import json
import logging
from pathlib import Path
import re
import secrets
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def stamp(seconds: float) -> str:
    value = round(seconds * 1000)
    return f"{value // 3600000:02}:{value // 60000 % 60:02}:{value // 1000 % 60:02}.{value % 1000:03}"


def seconds(value: str) -> float:
    parts = value.split(":")
    return sum(float(part) * 60 ** index for index, part in enumerate(reversed(parts)))


def prepare(args: argparse.Namespace) -> dict:
    args.assets.mkdir(parents=True, exist_ok=True)
    source = args.source.resolve()
    expected = Path(f"H:/PTI-OnePiece/pilot/jellyfin/cache/{'cached-case' if args.episode == 1 else 'cached-case-1001'}/episode-{args.episode}.mkv").resolve()
    if source != expected or not source.is_file():
        raise ValueError("Pilot source must be a verified cached episode-1.mkv or episode-1001.mkv")
    ffmpeg = args.ffmpeg.resolve()
    ffprobe = ffmpeg.with_name("ffprobe.exe")
    probe = json.loads(subprocess.check_output([str(ffprobe), "-v", "error", "-show_streams", "-of", "json", str(source)], timeout=15))
    audio = next(item for item in probe["streams"] if item["codec_type"] == "audio" and item.get("tags", {}).get("language") == "jpn")
    subtitle = next(item for item in probe["streams"] if item["codec_type"] == "subtitle" and item.get("tags", {}).get("language") == "eng" and not re.search(r"sign|song", item.get("tags", {}).get("title", ""), re.I))
    target = args.assets / f"episode{args.episode}-600-630.mp4"
    command = [str(ffmpeg), "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-ss", "600", "-i", str(source), "-t", "30", "-map", "0:v:0", "-map", f"0:{audio['index']}", "-sn", "-dn", "-map_metadata", "-1", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-profile:v", "high", "-level:v", "4.0", "-c:a", "aac", "-b:a", "128k", "-metadata:s:a:0", "language=jpn", "-movflags", "+faststart", str(target)]
    started = time.monotonic()
    subprocess.run(command, check=True, timeout=120, capture_output=True)
    vtt_full = args.assets / f"episode{args.episode}-original-english.vtt"
    subprocess.run([str(ffmpeg), "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source), "-map", f"0:{subtitle['index']}", "-c:s", "webvtt", str(vtt_full)], check=True, timeout=30, capture_output=True)
    cues = []
    blocks = re.split(r"\r?\n\s*\r?\n", vtt_full.read_text(encoding="utf-8"))
    for block in blocks:
        lines = block.splitlines()
        timing = next((index for index, line in enumerate(lines) if " --> " in line), None)
        if timing is None:
            continue
        start, end = lines[timing].split(" --> ", 1)
        first, last = seconds(start), seconds(end.split()[0])
        if last <= 600 or first >= 630:
            continue
        cues.append({"start": max(0, first - 600), "end": min(30, last - 600), "text": "\n".join(lines[timing + 1:])})
    if not cues:
        raise ValueError("Selected window has no actual English dialogue cues")
    vtt = args.assets / f"english-{args.episode}-600-630.vtt"
    vtt.write_text("WEBVTT\n\n" + "\n\n".join(f"{stamp(cue['start'])} --> {stamp(cue['end'])}\n{cue['text']}" for cue in cues) + "\n", encoding="utf-8")
    clip_probe = json.loads(subprocess.check_output([str(ffprobe), "-v", "error", "-show_streams", "-show_format", "-of", "json", str(target)], timeout=15))
    if float(clip_probe["format"]["duration"]) > 30.2:
        raise ValueError("Clip exceeded bounded duration")
    return {"source": f"verified cached Archive episode {args.episode}", "source_window_seconds": [600, 630], "preparation_seconds": round(time.monotonic() - started, 3), "source_audio_index": audio["index"], "source_audio_language": "jpn", "source_subtitle_index": subtitle["index"], "source_subtitle_language": "eng", "source_subtitle_title": subtitle.get("tags", {}).get("title"), "subtitle_conversion": "ffmpeg ASS to WebVTT, clipped to 600..630 and shifted -600s", "cue_count": len(cues), "first_cue_seconds": [cues[0]["start"], cues[0]["end"]], "last_cue_seconds": [cues[-1]["start"], cues[-1]["end"]], "duration_seconds": float(clip_probe["format"]["duration"]), "clip_bytes": target.stat().st_size, "clip_sha256": hashlib.sha256(target.read_bytes()).hexdigest(), "subtitle_bytes": vtt.stat().st_size, "subtitle_sha256": hashlib.sha256(vtt.read_bytes()).hexdigest(), "streams": [{"codec": stream["codec_name"], "type": stream["codec_type"], "language": stream.get("tags", {}).get("language"), "width": stream.get("width"), "height": stream.get("height")} for stream in clip_probe["streams"]]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--episode", type=int, choices=(1, 1001), default=1)
    parser.add_argument("--assets", type=Path, default=Path("H:/PTI-OnePiece/pilot/network/cast-assets"))
    parser.add_argument("--ffmpeg", type=Path, default=Path("H:/PTI-OnePiece/pilot/jellyfin/runtime/jellyfin/ffmpeg.exe"))
    parser.add_argument("--tools", type=Path, default=Path("H:/PTI-OnePiece/pilot/tools/python"))
    parser.add_argument("--address", default="192.168.68.105")
    parser.add_argument("--port", type=int, default=8795)
    parser.add_argument("--name", default="Bedroom TV")
    parser.add_argument("--local-test", action="store_true")
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--queue-from-1", action="store_true", help="Test representative prepared clip1 to clip1001 automatic queue transition")
    parser.add_argument("--observe-only", action="store_true", help="Let the short clip play to completion for owner observation, without playback/subtitle control tests")
    parser.add_argument("--tls-test", action="store_true", help="Compare isolated untrusted private-CA HTTPS against same-hostname HTTP; never install CA trust")
    parser.add_argument("--http-only", action="store_true", help="Validate bounded HTTP behavior without discovering or launching a receiver")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.source = args.source or Path(f"H:/PTI-OnePiece/pilot/jellyfin/cache/{'cached-case' if args.episode == 1 else 'cached-case-1001'}/episode-{args.episode}.mkv")
    if args.queue_from_1 and args.episode != 1001:
        parser.error("Representative cross-source queue requires --episode 1001")
    if args.observe_only and (args.queue_from_1 or args.local_test):
        parser.error("Observation replay is one clip on one transport")
    if args.tls_test and (args.queue_from_1 or args.local_test or args.observe_only):
        parser.error("TLS comparison is one episode with HTTPS and HTTP on the same mDNS hostname")
    if not ipaddress.ip_address(args.address).is_private or args.address.startswith("127."):
        parser.error("Bind only a private LAN interface")
    if args.assets.resolve() != Path("H:/PTI-OnePiece/pilot/network/cast-assets").resolve():
        parser.error("Temporal media must stay in the approved H: cast-assets directory")
    sys.path.insert(0, str(args.tools.resolve()))
    import pychromecast
    from pychromecast.config import APP_BACKDROP, APP_MEDIA_RECEIVER
    from pychromecast.response_handler import WaitResponse
    from zeroconf import IPVersion, ServiceInfo, Zeroconf

    logging.getLogger("pychromecast").setLevel(logging.CRITICAL)
    evidence = {"timestamp": timestamp(), "experiment": f"Real 30-second episode{args.episode} Cast pilot with Japanese audio and English WebVTT", "pychromecast_version": importlib.metadata.version("pychromecast"), "production_transport_accepted": False, "human_video_observation": "pending", "human_japanese_audio_observation": "pending", "human_subtitle_visibility_and_sync": "pending", "limits": {"seconds": 900, "response_budget_bytes": 100 * 1024 * 1024, "endpoint": "LAN-only HTTP, RAM-only random scoped capability", "assets": "exact MP4/WebVTT allowlist", "external_exposure_changes": False}, "requests": [], "states": [], "commands": [], "cases": []}
    lock = threading.RLock()
    def save() -> None:
        with lock:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    try:
        evidence["prepared"] = prepare(args)
        if args.queue_from_1:
            queue_args = argparse.Namespace(**vars(args))
            queue_args.episode = 1
            queue_args.source = Path("H:/PTI-OnePiece/pilot/jellyfin/cache/cached-case/episode-1.mkv")
            evidence["prepared_queue_from_1"] = prepare(queue_args)
    except Exception as error:
        evidence["blocker"] = {"stage": "prepare", "type": type(error).__name__}
        save()
        raise
    if args.prepare_only:
        save()
        print(json.dumps({"prepared": evidence["prepared"], "queue_from_1_ready": args.queue_from_1, "receiver_launched": False}), flush=True)
        return
    ticket = secrets.token_urlsafe(24)
    media_asset, subtitle_asset = f"episode{args.episode}.mp4", f"english-{args.episode}.vtt"
    allowed = {media_asset: (args.assets / f"episode{args.episode}-600-630.mp4", "video/mp4"), subtitle_asset: (args.assets / f"english-{args.episode}-600-630.vtt", "text/vtt; charset=utf-8")}
    if args.queue_from_1:
        allowed.update({"episode1.mp4": (args.assets / "episode1-600-630.mp4", "video/mp4"), "english-1.vtt": (args.assets / "english-1-600-630.vtt", "text/vtt; charset=utf-8")})
    deadline = time.monotonic() + 900
    budget = 100 * 1024 * 1024
    receiver_address = ""
    total_bytes = 0
    current_transport = "HTTP self-check"

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        def log_message(self, *_args) -> None:
            pass
        def handle(self) -> None:
            try:
                super().handle()
            except (ConnectionResetError, BrokenPipeError) as error:
                # Receivers may close a keep-alive connection when an item ends.
                # Retain that evidence without an IP/path-bearing traceback.
                with lock:
                    evidence.setdefault("transport_disconnects", []).append({"timestamp": timestamp(), "peer": "receiver" if self.client_address[0] == receiver_address else "other", "type": type(error).__name__})
                save()
        def serve(self, body: bool = True) -> None:
            nonlocal total_bytes
            self.connection.settimeout(8)
            parts = self.path.split("/")
            asset = parts[2] if len(parts) == 3 and secrets.compare_digest(parts[1], ticket) else None
            valid = asset in allowed and time.monotonic() < deadline
            if not valid:
                self.send_response(404)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            filename, content_type = allowed[asset]
            size = filename.stat().st_size
            start, end, status = 0, size - 1, 200
            range_value = self.headers.get("Range")
            if range_value:
                match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_value)
                if not match or (not match[1] and not match[2]):
                    status = 416
                elif not match[1]:
                    start = max(0, size - int(match[2]))
                else:
                    start = int(match[1])
                    end = min(end, int(match[2])) if match[2] else end
                if start >= size or end < start:
                    status = 416
                elif status != 416:
                    status = 206
            length = end - start + 1 if status != 416 else 0
            with lock:
                if body and total_bytes + length > budget:
                    status, length = 429, 0
                if body:
                    total_bytes += length  # reserve before writing; conservative on disconnect
                entry = {"timestamp": timestamp(), "transport_case": current_transport, "asset": asset, "method": self.command, "range": range_value, "status": status, "response_bytes_reserved": length if body else 0, "peer": "receiver" if self.client_address[0] == receiver_address else "local" if self.client_address[0] == args.address else "other LAN", "origin": self.headers.get("Origin"), "user_agent": self.headers.get("User-Agent", "")[:180]}
                evidence["requests"].append(entry)
                evidence["response_bytes_reserved"] = total_bytes
            origin = self.headers.get("Origin")
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(length))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            if status == 206:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            if status == 416:
                self.send_header("Content-Range", f"bytes */{size}")
            if origin in ("https://www.gstatic.com", "https://pti-app-2ab59.web.app"):
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept-Encoding, Range")
                self.send_header("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")
            self.end_headers()
            written = 0
            try:
                if body and length:
                    with filename.open("rb") as source:
                        source.seek(start)
                        while written < length and time.monotonic() < deadline:
                            data = source.read(min(65536, length - written))
                            if not data:
                                break
                            self.wfile.write(data)
                            written += len(data)
            except (OSError, TimeoutError) as error:
                entry["disconnect"] = type(error).__name__
            finally:
                entry["body_bytes_written"] = written
                save()
        def do_GET(self) -> None:
            self.serve()
        def do_HEAD(self) -> None:
            self.serve(body=False)
        def do_OPTIONS(self) -> None:
            parts = self.path.split("/")
            valid = len(parts) == 3 and secrets.compare_digest(parts[1], ticket) and parts[2] in allowed and time.monotonic() < deadline
            self.send_response(204 if valid else 404)
            self.send_header("Content-Length", "0")
            origin = self.headers.get("Origin")
            if valid and origin in ("https://www.gstatic.com", "https://pti-app-2ab59.web.app"):
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept-Encoding, Range")
            self.end_headers()

    server = ThreadingHTTPServer((args.address, args.port), Handler)
    server.daemon_threads = True
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    # Hard lifetime is independent of receiver/discovery call outcomes.
    expiry = threading.Timer(900, server.shutdown)
    expiry.daemon = True
    expiry.start()
    devices, browser = [], None
    cast = None
    own_receiver_session = None
    zc, info = None, None
    tls_caddy = None

    def snapshot(label: str) -> dict:
        status = cast.media_controller.status
        own = bool(status.content_id and f"/{ticket}/" in status.content_id)
        data = {"timestamp": timestamp(), "label": label, "application_id": cast.status.app_id if cast.status else None, "media_owned_by_pilot": own, "state": status.player_state, "time": status.current_time, "adjusted_time": status.adjusted_current_time, "duration": status.duration, "active_track_ids": status.current_subtitle_tracks, "subtitle_track_count": len(status.subtitle_tracks), "idle_reason": status.idle_reason}
        evidence["states"].append(data)
        save()
        return data

    def wait_for(label: str, predicate, timeout: float) -> bool:
        until = min(deadline, time.monotonic() + timeout)
        while time.monotonic() < until:
            cast.media_controller.update_status()
            time.sleep(0.5)
            if predicate(cast.media_controller.status):
                snapshot(label)
                return True
        snapshot(label + " timeout")
        return False

    def still_owned() -> bool:
        status = cast.media_controller.status
        content_owned = bool(status.content_id and f"/{ticket}/" in status.content_id)
        if args.tls_test and not status.content_id:
            content_owned = True  # Our launched receiver can have no media after TLS rejection.
        return bool(cast.status and cast.status.app_id == APP_MEDIA_RECEIVER and cast.status.session_id == own_receiver_session and content_owned)

    try:
        # Test ranges without persisting capability URL.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        root = f"http://{args.address}:{args.port}/{ticket}"
        checks = []
        for asset, range_header, method in ((media_asset, "bytes=0-31", "GET"), (media_asset, "bytes=999999999-", "GET"), (subtitle_asset, None, "GET"), (media_asset, None, "HEAD"), (subtitle_asset, None, "OPTIONS")):
            request = urllib.request.Request(root + "/" + asset, method=method, headers={"Origin": "https://www.gstatic.com", **({"Range": range_header} if range_header else {})})
            try:
                response = opener.open(request, timeout=5)
            except urllib.error.HTTPError as error:
                response = error
            checks.append({"asset": asset, "method": method, "range": range_header, "status": response.code, "bytes": len(response.read()), "allow_origin": response.headers.get("Access-Control-Allow-Origin")})
        evidence["http_self_checks"] = checks
        if args.http_only:
            return
        if args.tls_test:
            from local_tls_caddy import LocalTlsCaddy
            tls_caddy = LocalTlsCaddy(args.address, args.port)
            tls_caddy.start()
            evidence["tls_pilot"] = tls_caddy.evidence
        devices, browser = pychromecast.get_listed_chromecasts(friendly_names=[args.name], discovery_timeout=6, tries=1, retry_wait=1, timeout=5)
        if not devices:
            evidence["blocker"] = "requested TV not discovered"
            return
        cast = devices[0]
        receiver_address = str(cast.cast_info.host)
        if tls_caddy:
            tls_caddy.receiver_address = receiver_address
        cast.wait(timeout=8)
        evidence["receiver"] = {"name": cast.cast_info.friendly_name, "model": cast.cast_info.model_name}
        cast.media_controller.update_status()
        time.sleep(1)
        prior = snapshot("initial status, before media launch")
        if (cast.status and cast.status.app_id not in (None, APP_BACKDROP)) or (prior["state"] in ("PLAYING", "BUFFERING", "PAUSED")):
            evidence["blocker"] = "Existing receiver application/session; not replaced"
            return

        class Listener:
            def new_media_status(self, _status) -> None:
                pass
            def load_media_failed(self, _queue_item_id, error_code) -> None:
                evidence.setdefault("load_errors", []).append({"timestamp": timestamp(), "error_code": error_code})
                save()
        cast.media_controller.register_status_listener(Listener())
        hosts = [("LAN IP", f"http://{args.address}:{args.port}")]
        if args.local_test:
            zc = Zeroconf(interfaces=[args.address], ip_version=IPVersion.V4Only)
            info = ServiceInfo("_http._tcp.local.", "One Piece ticketed Cast pilot._http._tcp.local.", addresses=[socket.inet_aton(args.address)], port=args.port, properties={"pilot": "bounded-ticketed-media"}, server="onepiece-cast.local.")
            zc.register_service(info)
            hosts.append(("mDNS .local", f"http://onepiece-cast.local:{args.port}"))
        if args.tls_test:
            zc = Zeroconf(interfaces=[args.address], ip_version=IPVersion.V4Only)
            info = ServiceInfo("_https._tcp.local.", "One Piece private-CA TLS pilot._https._tcp.local.", addresses=[socket.inet_aton(args.address)], port=tls_caddy.port, properties={"pilot": "bounded-private-ca"}, server=tls_caddy.hostname + ".")
            zc.register_service(info)
            hosts = [("Private CA HTTPS .local", f"https://{tls_caddy.hostname}:{tls_caddy.port}"), ("HTTP same .local hostname baseline", f"http://{tls_caddy.hostname}:{args.port}")]
        for label, base_url in hosts:
            current_transport = label
            if tls_caddy:
                tls_caddy.phase = label
            if own_receiver_session and not still_owned():
                evidence["blocker"] = "Receiver no longer owned by this pilot; further commands skipped"
                break
            url = base_url + "/" + ticket
            started = time.monotonic()
            cast.media_controller.play_media(url + "/" + media_asset, "video/mp4", title=f"One Piece episode {args.episode} technical pilot (30 seconds)", stream_type="BUFFERED", current_time=0, subtitles=url + "/" + subtitle_asset, subtitles_lang="en", subtitle_id=1)
            loaded = wait_for(label + " playing", lambda status: bool(status.content_id == url + "/" + media_asset and status.player_state == "PLAYING"), 20)
            own_receiver_session = cast.status.session_id if cast.status and cast.status.app_id == APP_MEDIA_RECEIVER else own_receiver_session
            case = {"transport": label, "loaded_playing": loaded, "load_to_playing_seconds": round(time.monotonic() - started, 3)}
            evidence["cases"].append(case)
            if not loaded:
                continue
            print(json.dumps({"event": "actual_receiver_playing", "episode": args.episode, "timestamp": timestamp(), "English_track_active": 1 in cast.media_controller.status.current_subtitle_tracks}), flush=True)
            if args.tls_test:
                case["progression_confirmed"] = wait_for(label + " reported progression", lambda status: status.current_time >= 2, 6)
                case["english_track_active"] = 1 in cast.media_controller.status.current_subtitle_tracks
                continue
            if args.observe_only:
                evidence["observation_replay"] = {"episode": args.episode, "no_control_commands": True, "playing_at": timestamp()}
                evidence["observation_replay"]["natural_end_confirmed"] = wait_for("owner observation clip naturally ended", lambda status: bool(status.player_state == "IDLE" and status.idle_reason == "FINISHED"), 40)
                save()
                continue
            wait_for(label + " progressed", lambda status: status.current_time >= 2, 6)
            if not still_owned():
                break
            cast.media_controller.pause(timeout=5)
            evidence["commands"].append({"transport": label, "command": "pause"})
            case["pause_confirmed"] = wait_for(label + " paused", lambda status: status.player_state == "PAUSED", 4)
            if not still_owned():
                break
            cast.media_controller.seek(12, timeout=5)
            evidence["commands"].append({"transport": label, "command": "seek", "target_seconds": 12})
            case["seek_confirmed"] = wait_for(label + " seeked", lambda status: status.current_time >= 11.5 and status.player_state == "PLAYING", 6)
            if not still_owned():
                break
            cast.media_controller.play(timeout=5)
            evidence["commands"].append({"transport": label, "command": "play"})
            case["play_confirmed"] = wait_for(label + " playing after command", lambda status: status.player_state == "PLAYING", 4)
            case["english_track_active"] = 1 in cast.media_controller.status.current_subtitle_tracks
            if not still_owned():
                break
            cast.media_controller.disable_subtitle(timeout=5)
            evidence["commands"].append({"transport": label, "command": "subtitles off"})
            case["subtitles_off_confirmed"] = wait_for(label + " subtitles off", lambda status: 1 not in status.current_subtitle_tracks, 3)
            if not still_owned():
                break
            cast.media_controller.enable_subtitle(1, timeout=5)
            evidence["commands"].append({"transport": label, "command": "English subtitles on"})
            case["subtitles_on_confirmed"] = wait_for(label + " English subtitles on", lambda status: 1 in status.current_subtitle_tracks, 3)
            time.sleep(2)
            snapshot(label + " final observed status")
            save()
        if args.queue_from_1 and still_owned():
            # Real sources from distinct collections; clips are representative,
            # not sequential full episodes. First clip starts near its end.
            def item(episode: int) -> dict:
                return {"media": {"contentId": root + f"/episode{episode}.mp4", "contentType": "video/mp4", "streamType": "BUFFERED", "metadata": {"metadataType": 0, "title": f"One Piece source-check episode {episode}"}, "tracks": [{"trackId": 1, "type": "TEXT", "subtype": "SUBTITLES", "language": "en", "name": "English dialogue", "trackContentId": root + f"/english-{episode}.vtt", "trackContentType": "text/vtt"}]}, "autoplay": True, "startTime": 0, "activeTrackIds": [1], "preloadTime": 3}
            response = WaitResponse(5, "representative cross-source queue load")
            cast.media_controller.send_message({"type": "QUEUE_LOAD", "items": [item(1), item(1001)], "startIndex": 0, "currentTime": 25, "repeatMode": "REPEAT_OFF"}, inc_session_id=True, callback_function=response.callback)
            response.wait_response()
            first = wait_for("queue source1 near end", lambda status: bool(status.content_id == root + "/episode1.mp4" and status.player_state == "PLAYING"), 8)
            second = wait_for("queue auto transition to source2", lambda status: bool(status.content_id == root + "/episode1001.mp4" and status.player_state == "PLAYING"), 15)
            evidence["representative_cross_source_queue"] = {"first_episode": 1, "second_episode": 1001, "first_clip_start_seconds": 25, "first_playing_confirmed": first, "second_automatically_playing_confirmed": second, "second_English_track_active": 1 in cast.media_controller.status.current_subtitle_tracks, "scope": "Prepared 30-second excerpts from both actual collections; not full episode1000 to episode1001 acceptance"}
            if second:
                evidence["representative_cross_source_queue"]["second_reported_progression_confirmed"] = wait_for("queue source2 reported progression", lambda status: bool(status.content_id == root + "/episode1001.mp4" and status.current_time >= 2), 6)
            save()
    except Exception as error:
        evidence["blocker"] = {"stage": "Cast diagnostic", "type": type(error).__name__}
    finally:
        if cast:
            try:
                if still_owned():
                    if cast.media_controller.status.media_session_id is not None:
                        cast.media_controller.stop(timeout=5)
                    # Send the captured sessionId explicitly, so another sender's
                    # newly started app cannot become the target of cleanup.
                    response = WaitResponse(5, "quit pilot-owned receiver session")
                    cast.socket_client.receiver_controller.send_message({"type": "STOP", "sessionId": own_receiver_session}, callback_function=response.callback)
                    response.wait_response()
                    evidence["cleanup"] = "Stopped and quit only the receiver session owned by this pilot"
                else:
                    evidence["cleanup"] = "Did not stop an unowned receiver/session"
            except Exception as error:
                evidence["cleanup_error"] = type(error).__name__
            cast.disconnect()
        if browser:
            pychromecast.stop_discovery(browser)
        if zc:
            zc.unregister_service(info)
            zc.close()
        if tls_caddy:
            tls_caddy.stop()
            evidence["tls_pilot"] = tls_caddy.evidence
        expiry.cancel()
        server.shutdown()
        server.server_close()
        evidence["stopped_at"] = timestamp()
        evidence["ticket_retained"] = False
        save()
        print(json.dumps({"result": str(args.output), "cases": evidence["cases"], "blocker": evidence.get("blocker"), "receiver_fetches": sum(item["peer"] == "receiver" for item in evidence["requests"]), "response_bytes_reserved": total_bytes, "cleanup": evidence.get("cleanup")}), flush=True)


if __name__ == "__main__":
    main()
