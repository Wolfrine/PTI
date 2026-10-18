"""Private JSON-lines Cast worker. Stdout contains no media URL or capability.

Configuration is non-secret and supplied in ONE_PIECE_CAST_CONFIG. Credentials
and media capabilities arrive only over inherited stdin; nothing is persisted.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import ipaddress
import json
import logging
import math
import os
import re
import sys
import time
from urllib.parse import urlsplit
from uuid import UUID


class CastError(Exception):
    pass


def require(condition: bool, code: str) -> None:
    if not condition:
        raise CastError(code)


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def valid_origin(value: str, allow_http: bool) -> str:
    parsed = urlsplit(value)
    try:
        private = ipaddress.ip_address(parsed.hostname or "").is_private and not ipaddress.ip_address(parsed.hostname).is_loopback
    except ValueError:
        private = False
    require(bool(parsed.hostname and (parsed.hostname.endswith(".local") or private)), "cast-media-origin")
    require(parsed.scheme == "https" or (allow_http and parsed.scheme == "http"), "cast-http-media-disabled")
    require(not parsed.username and not parsed.password and parsed.path in ("", "/") and not parsed.query and not parsed.fragment, "cast-media-origin")
    return f"{parsed.scheme}://{parsed.netloc}"


class Worker:
    def __init__(self, configuration: dict) -> None:
        import pychromecast
        from pychromecast.config import APP_BACKDROP, APP_MEDIA_RECEIVER
        from pychromecast.response_handler import WaitResponse
        from pychromecast.error import RequestTimeout, RequestFailed, NotConnected, ChromecastConnectionClosed, ChromecastConnectionError
        self.pc = pychromecast
        self.backdrop, self.receiver_app = APP_BACKDROP, APP_MEDIA_RECEIVER
        self.wait_response = WaitResponse
        self.request_timeout = RequestTimeout
        self.status_failed = RequestFailed
        self.connection_errors = (NotConnected, ChromecastConnectionClosed, ChromecastConnectionError)
        self.origins = {valid_origin(value, configuration.get("allowHttpMedia") is True) for value in configuration.get("mediaOrigins", [])}
        require(bool(self.origins), "cast-media-origin")
        self.devices, self.bindings = {}, {}
        self.media_receipts, self.media_listeners, self.raw_media = {}, {}, {}
        self.platform_receipts = {}

    def observe_media(self, receiver_id: str, cast) -> None:
        """Correlate controller notifications with actual incoming raw media messages."""
        worker = self
        worker.media_receipts[receiver_id] = {"version": 0, "receivedAt": 0}
        worker.raw_media[receiver_id] = {"version": 0}
        if not hasattr(worker, "platform_receipts"):
            worker.platform_receipts = {}
        worker.platform_receipts[receiver_id] = {"version": 0}
        platform = cast.socket_client.receiver_controller
        original_platform_receive = getattr(platform, "receive_message", None)
        if callable(original_platform_receive):
            def receive_platform(message, data):
                result = original_platform_receive(message, data)
                if worker.devices.get(receiver_id) is cast and isinstance(data, dict) and data.get("type") == "RECEIVER_STATUS":
                    raw = {"version": worker.platform_receipts[receiver_id]["version"] + 1,
                           "receivedAt": time.monotonic(), "uncertain": True}
                    status = data.get("status")
                    applications = status.get("applications") if isinstance(status, dict) else None
                    if isinstance(applications, list) and len(applications) == 1 and isinstance(applications[0], dict):
                        app = applications[0]
                        namespaces = app.get("namespaces")
                        raw.update({"appId": app.get("appId"), "receiverSession": app.get("sessionId"),
                                    "transportId": app.get("transportId"), "uncertain": not isinstance(namespaces, list),
                                    "mediaNamespace": isinstance(namespaces, list) and any(isinstance(item, dict) and item.get("name") == "urn:x-cast:com.google.cast.media" for item in namespaces)})
                    worker.platform_receipts[receiver_id] = raw
                return result
            platform.receive_message = receive_platform
        controller = cast.media_controller
        original_receive = getattr(controller, "receive_message", None)
        if callable(original_receive):
            def receive(message, data):
                if worker.devices.get(receiver_id) is cast and isinstance(data, dict) and data.get("type") == "MEDIA_STATUS":
                    rows = data.get("status")
                    raw = {"version": worker.raw_media[receiver_id]["version"] + 1, "receivedAt": time.monotonic(),
                           "appId": cast.status.app_id if cast.status else None,
                           "receiverSession": cast.status.session_id if cast.status else None, "uncertain": True}
                    if isinstance(rows, list) and len(rows) <= 1 and (not rows or isinstance(rows[0], dict)):
                        item = rows[0] if rows else {}
                        metadata = item.get("media")
                        extended = item.get("extendedStatus")
                        metadata = {} if metadata is None else metadata
                        extended = {} if extended is None else extended
                        content = metadata.get("contentId") if isinstance(metadata, dict) else None
                        raw.update({"uncertain": not isinstance(metadata, dict) or not isinstance(extended, dict)
                                               or ("items" in item and not isinstance(item["items"], list))
                                               or ("queueData" in item and not isinstance(item["queueData"], dict)),
                                    "contentDigest": digest(content) if isinstance(content, str) and content else None,
                                    "mediaSessionId": item.get("mediaSessionId"), "playerState": item.get("playerState", "UNKNOWN"),
                                    "queueOrLoading": bool(extended or item.get("items") or item.get("queueData") or metadata
                                                           or any(item.get(key) is not None for key in ("currentItemId", "loadingItemId", "preloadedItemId")))})
                    worker.raw_media[receiver_id] = raw
                return original_receive(message, data)
            controller.receive_message = receive

        class Listener:
            def new_media_status(self, status) -> None:
                if worker.devices.get(receiver_id) is not cast:
                    return
                previous = worker.media_receipts[receiver_id]
                worker.media_receipts[receiver_id] = {
                    "version": previous["version"] + 1, "receivedAt": time.monotonic(),
                    "appId": cast.status.app_id if cast.status else None,
                    "receiverSession": cast.status.session_id if cast.status else None,
                    "contentDigest": digest(status.content_id) if status.content_id else None,
                    "rawVersion": worker.raw_media[receiver_id]["version"],
                }

            def load_media_failed(self, *_args) -> None:
                pass

        listener = Listener()
        worker.media_listeners[receiver_id] = listener
        cast.media_controller.register_status_listener(listener)

    def recent_media(self, cast) -> dict | None:
        receiver_id = next((key for key, value in self.devices.items() if value is cast), None)
        receipt = self.media_receipts.get(receiver_id)
        status = cast.status
        content = cast.media_controller.status.content_id
        if not receipt or time.monotonic() - receipt["receivedAt"] > 3 or not status:
            return None
        if receipt.get("appId") != status.app_id or receipt.get("receiverSession") != status.session_id or receipt.get("contentDigest") != (digest(content) if content else None):
            return None
        return receipt

    def recent_admitted(self, cast, binding: dict) -> bool:
        """Reuse at most one second of actual raw proof for an already bound command."""
        receiver_id = next((key for key, value in self.devices.items() if value is cast), None)
        if self.bindings.get(receiver_id) is not binding or not self.owned(cast, binding):
            return False
        socket, status = cast.socket_client, cast.status
        media = cast.media_controller.status
        receipt, raw = self.recent_media(cast), self.raw_media.get(receiver_id, {})
        platform = self.platform_receipts.get(receiver_id, {})
        now = time.monotonic()
        if (not getattr(socket, "is_connected", False) or getattr(socket, "is_stopped", True)
                or "urn:x-cast:com.google.cast.media" not in getattr(socket, "app_namespaces", [])
                or not receipt or any(not 0 <= now - row.get("receivedAt", -10) <= 1 for row in (receipt, raw, platform))
                or raw.get("uncertain", True) or platform.get("uncertain", True) or not platform.get("mediaNamespace")
                or receipt.get("rawVersion") != raw.get("version")
                or raw.get("contentDigest") != receipt.get("contentDigest")
                or raw.get("mediaSessionId") is None or raw.get("mediaSessionId") != media.media_session_id
                or raw.get("playerState") != media.player_state or media.player_state not in ("PLAYING", "PAUSED", "BUFFERING", "IDLE")):
            return False
        return (platform.get("appId") == status.app_id == self.receiver_app
                and platform.get("receiverSession") == status.session_id == binding.get("receiverSession") == raw.get("receiverSession")
                and platform.get("transportId") is not None
                and platform["transportId"] == getattr(status, "transport_id", None) == getattr(socket, "destination_id", None))

    def empty_default(self, cast) -> bool:
        """Two new same-session raw status observations prove an idle Default Receiver."""
        if not cast.status:
            return False
        if cast.status.app_id in (None, self.backdrop):
            return True
        if cast.status.app_id != self.receiver_app:
            return False
        observations = []
        try:
            for _ in range(2):
                self.refresh(cast)
                receiver_id = next((key for key, value in self.devices.items() if value is cast), None)
                receipt, raw = self.recent_media(cast), self.raw_media.get(receiver_id, {})
                if (not receipt or receipt.get("rawVersion") != raw.get("version") or raw.get("uncertain", True)
                        or cast.status.app_id != self.receiver_app or not cast.status.session_id
                        or raw.get("receiverSession") != cast.status.session_id or raw.get("contentDigest") is not None
                        or raw.get("mediaSessionId") is not None or raw.get("playerState") not in ("IDLE", "UNKNOWN")
                        or raw.get("queueOrLoading", True)):
                    return False
                observations.append((cast.status.session_id, receipt["version"]))
                if len(observations) == 1:
                    time.sleep(0.15)
        except (CastError, self.request_timeout):
            return False
        return observations[0][0] == observations[1][0] and observations[1][1] > observations[0][1]

    def context(self, value: dict) -> dict:
        require(isinstance(value, dict), "cast-context")
        require(isinstance(value.get("uid"), str) and re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value["uid"]) is not None, "cast-context")
        require(isinstance(value.get("sessionId"), str) and re.fullmatch(r"[A-Za-z0-9_-]{1,96}", value["sessionId"]) is not None, "cast-context")
        require(all(type(value.get(key)) is int and value[key] > 0 for key in ("generation", "authorityEpoch")), "cast-context")
        return {key: value[key] for key in ("uid", "sessionId", "generation", "authorityEpoch")}

    def media_url(self, value: str, episode_id: str) -> str:
        require(isinstance(value, str) and len(value) <= 18000, "cast-media-url")
        parsed = urlsplit(value)
        require(f"{parsed.scheme}://{parsed.netloc}" in self.origins and not parsed.username and not parsed.password and not parsed.query and not parsed.fragment, "cast-media-url")
        match = re.fullmatch(r"/m/[A-Za-z0-9_-]{32}/(one-piece-\d{4})/([A-Za-z0-9_-]{1,11000})", parsed.path)
        require(bool(match and match[1] == episode_id), "cast-media-url")
        encoded = match[2]
        try:
            decoded = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode("utf-8", errors="strict")
        except (ValueError, UnicodeError):
            raise CastError("cast-media-url") from None
        require(base64.urlsafe_b64encode(decoded.encode()).decode().rstrip("=") == encoded and decoded.startswith("/") and not re.search(r"[\x00-\x1f\\]", decoded), "cast-media-url")
        return value

    def episode(self, data: dict) -> dict:
        require(isinstance(data, dict) and re.fullmatch(r"one-piece-\d{4}", str(data.get("episodeId", ""))) is not None, "cast-episode")
        require(re.fullmatch(r"[0-9a-f-]{36}", str(data.get("mediaUid", ""))) is not None, "cast-media-uid")
        require(data.get("contentType") in ("video/mp4", "application/vnd.apple.mpegurl", "application/x-mpegurl"), "cast-media-type")
        duration = data.get("durationSeconds")
        require(type(duration) in (int, float) and math.isfinite(duration) and 1 <= duration <= 14400, "cast-duration")
        return {**data, "mediaUrl": self.media_url(data.get("mediaUrl"), data["episodeId"]), "subtitleUrl": self.media_url(data.get("subtitleUrl"), data["episodeId"])}

    def discover(self, target: str | None = None) -> list:
        if target:
            require(str(UUID(target)) == target, "cast-receiver-id")
            found, browser = self.pc.get_listed_chromecasts(uuids=[UUID(target)], discovery_timeout=5, tries=1, retry_wait=1, timeout=4)
        else:
            found, browser = self.pc.get_chromecasts(tries=1, retry_wait=1, timeout=4)
        try:
            for cast in found:
                receiver_id = str(cast.uuid)
                if receiver_id in self.devices and self.devices[receiver_id].socket_client.is_connected:
                    cast.disconnect()
                else:
                    if receiver_id in self.devices:
                        self.devices[receiver_id].disconnect()
                    self.devices[receiver_id] = cast
                    self.observe_media(receiver_id, cast)
            result = []
            for receiver_id, cast in self.devices.items():
                try:
                    cast.wait(timeout=4)
                    self.refresh(cast, media=False)
                    result.append({"receiverId": receiver_id, "name": str(cast.name or "Google Cast TV")[:100], "model": str(cast.cast_info.model_name or "")[:100], "owned": self.owned(cast, self.bindings.get(receiver_id)), "busy": not self.empty_default(cast)})
                except Exception as error:
                    result.append({"receiverId": receiver_id, "name": str(cast.name or "Google Cast TV")[:100], "model": str(cast.cast_info.model_name or "")[:100], "owned": False, "busy": True, "available": False, "diagnosticType": type(error).__name__})
            return result
        finally:
            # Keep mDNS alive until service resolution/socket admission finishes.
            self.pc.stop_discovery(browser)

    def device(self, receiver_id: str):
        try:
            require(str(UUID(receiver_id)) == receiver_id, "cast-receiver-id")
        except (ValueError, TypeError, AttributeError):
            raise CastError("cast-receiver-id") from None
        if receiver_id not in self.devices or not self.devices[receiver_id].socket_client.is_connected:
            self.discover(receiver_id)
        require(receiver_id in self.devices, "cast-receiver-unavailable")
        cast = self.devices[receiver_id]
        cast.wait(timeout=5)
        return cast

    def query_media(self, cast) -> None:
        # MediaController.update_status uses send_message(), which may LAUNCH an
        # app when its namespace disappears during reconnect. A status query must
        # never launch anything. send_message_nocheck still checks namespace and
        # destination in SocketClient, but has no automatic launch path.
        require(bool(cast.status and cast.status.app_id == self.receiver_app
                     and getattr(cast.socket_client, "is_connected", False)
                     and not getattr(cast.socket_client, "is_stopped", True)
                     and getattr(cast.media_controller, "is_active", False)), "cast-status-not-fresh")
        cast.media_controller.send_message_nocheck({"type": "GET_STATUS"})

    def refresh(self, cast, media: bool = True, admission: dict | None = None) -> None:
        response = self.wait_response(3, "receiver status")
        cast.socket_client.receiver_controller.update_status(callback_function=response.callback)
        response.wait_response()
        # Capture only the receiver session launched by our admitted LOAD. Content
        # digest checks still gate every ownership decision and any later STOP.
        if admission is not None and cast.status and cast.status.app_id == self.receiver_app:
            admission["receiverSession"] = admission["receiverSession"] or cast.status.session_id
        # MediaController.update_status may auto-launch its supported app if the
        # current app differs. Never call it while a different receiver is active.
        if media and cast.status and cast.status.app_id == self.receiver_app:
            receiver_id = next((key for key, value in self.devices.items() if value is cast), None)
            version = self.media_receipts.get(receiver_id, {}).get("version", 0)
            raw_version = self.raw_media.get(receiver_id, {}).get("version", 0)
            # The Sony HLS pilot timed out the GET_STATUS request-id callback.
            # Require a NEW actual listener receipt, allowing asynchronous status
            # updates without accepting an unchanged cached PLAYING value.
            self.query_media(cast)
            until = time.monotonic() + 3
            next_query = time.monotonic() + 0.75
            while time.monotonic() < until:
                receipt = self.recent_media(cast)
                if receipt and receipt["version"] > version and receipt.get("rawVersion", 0) > raw_version:
                    return
                # One dropped GET_STATUS must not fail a command before it is
                # sent. Retry this read-only query at most four times inside the
                # same window, still requiring a newly received raw response.
                if time.monotonic() >= next_query:
                    require(bool(cast.status and cast.status.app_id == self.receiver_app), "cast-ownership-lost")
                    self.query_media(cast)
                    next_query += 0.75
                time.sleep(0.025)
            raise CastError("cast-status-not-fresh")

    def owned(self, cast, binding: dict | None, *, permit_empty: bool = False) -> bool:
        if not binding or not cast.status or cast.status.app_id != self.receiver_app or cast.status.session_id != binding.get("receiverSession"):
            return False
        content = cast.media_controller.status.content_id
        return (permit_empty and not content) or bool(content and digest(content) in binding["media"])

    def state(self, receiver_id: str, cast, binding: dict | None) -> dict:
        status = cast.media_controller.status
        owned = self.owned(cast, binding)
        entry = binding["media"].get(digest(status.content_id)) if owned else None
        if entry and binding.get("queued") == entry["mediaUid"]:
            binding["queued"] = None
            binding["media"] = {digest(status.content_id): entry}
        return {"receiverId": receiver_id, "owned": owned, "busy": bool(cast.status and cast.status.app_id not in (None, self.backdrop)), "state": status.player_state if owned else "UNOWNED", "episodeId": entry["episodeId"] if entry else None, "mediaUid": entry["mediaUid"] if entry else None, "positionSeconds": status.current_time if owned else None, "durationSeconds": entry["durationSeconds"] if entry else None, "subtitleEnabled": bool(owned and 1 in (status.current_subtitle_tracks or [])), "volume": cast.status.volume_level if owned else None, "muted": cast.status.volume_muted if owned else None, "idleReason": status.idle_reason if owned else None}

    def admitted(self, data: dict, *, permit_empty: bool = False):
        receiver_id = data.get("receiverId")
        cast = self.device(receiver_id)
        binding = self.bindings.get(receiver_id)
        require(binding is not None and binding["context"] == self.context(data.get("context")), "cast-ownership-lost")
        if not self.recent_admitted(cast, binding):
            self.refresh(cast)
        require(self.owned(cast, binding, permit_empty=permit_empty), "cast-ownership-lost")
        # MediaStatus merges partial updates into cached fields. A fresh callback
        # alone cannot authorize a command (particularly STOP) against that cache.
        require(self.recent_admitted(cast, binding), "cast-status-not-fresh")
        self.state(receiver_id, cast, binding)
        return receiver_id, cast, binding

    def wait_state(self, receiver_id: str, cast, binding: dict, predicate, timeout: float = 8) -> dict:
        until = time.monotonic() + timeout
        while time.monotonic() < until:
            self.refresh(cast)
            if self.owned(cast, binding):
                require(self.recent_admitted(cast, binding), "cast-status-not-fresh")
            state = self.state(receiver_id, cast, binding)
            if predicate(state):
                return state
            if cast.status and cast.status.app_id != self.receiver_app:
                raise CastError("cast-ownership-lost")
            time.sleep(0.15)
        raise CastError("cast-command-not-confirmed")

    def load(self, data: dict) -> dict:
        context, episode = self.context(data.get("context")), self.episode(data.get("episode"))
        receiver_id, cast = data.get("receiverId"), self.device(data.get("receiverId"))
        self.refresh(cast)
        previous = self.bindings.get(receiver_id)
        ours = (previous is not None and previous["context"]["uid"] == context["uid"]
                and self.recent_admitted(cast, previous))
        require(ours or self.empty_default(cast) or data.get("takeover") is True, "cast-tv-busy")
        position = data.get("positionSeconds", 0)
        require(type(position) in (int, float) and math.isfinite(position) and 0 <= position <= episode["durationSeconds"], "cast-seek")
        binding = {"context": context, "receiverSession": None, "media": {digest(episode["mediaUrl"]): episode}, "queued": None}
        self.bindings[receiver_id] = binding
        cast.media_controller.play_media(episode["mediaUrl"], episode["contentType"], title=f"One Piece · Episode {int(episode['episodeId'][-4:])}", stream_type="BUFFERED", current_time=position, subtitles=episode["subtitleUrl"], subtitles_lang="en", subtitle_id=1, media_info={"duration": episode["durationSeconds"]})
        until = time.monotonic() + 18
        while time.monotonic() < until:
            platform_version = self.platform_receipts.get(receiver_id, {}).get("version", 0)
            try:
                self.refresh(cast, admission=binding)
                platform = self.platform_receipts.get(receiver_id, {})
                require(platform.get("version", 0) > platform_version and time.monotonic() - platform.get("receivedAt", -10) <= 3, "cast-status-not-fresh")
                if cast.status and cast.status.app_id == self.receiver_app:
                    require(not platform.get("uncertain", True) and platform.get("appId") == self.receiver_app
                            and platform.get("receiverSession") == cast.status.session_id, "cast-status-not-fresh")
            except self.request_timeout:
                continue
            except self.status_failed:
                # This covers only refresh's read-only receiver GET_STATUS. The
                # single play_media(LOAD) above is outside this retry scope, so a
                # rejected LOAD is never repeated or treated as successful.
                time.sleep(0.15)
                continue
            except self.connection_errors:
                # SocketClient reconnects its existing connection in the background.
                # Do not re-send LOAD or grant cached ownership during this gap:
                # the next iteration still needs fresh platform and raw MEDIA_STATUS
                # and must match the admitted receiver session and exact media URL.
                time.sleep(0.15)
                continue
            except CastError as error:
                if str(error) == "cast-status-not-fresh":
                    time.sleep(0.15)
                    continue
                raise
            if cast.status and cast.status.app_id == self.receiver_app:
                binding["receiverSession"] = binding["receiverSession"] or cast.status.session_id
            state = self.state(receiver_id, cast, binding)
            if state["owned"] and state["state"] in ("PLAYING", "PAUSED") and self.recent_admitted(cast, binding):
                return state
            if cast.status and cast.status.app_id not in (None, self.backdrop, self.receiver_app):
                raise CastError("cast-ownership-lost")
            time.sleep(0.15)
        raise CastError("cast-load-not-confirmed")

    def execute(self, command: str, data: dict):
        if command == "discover":
            return self.discover()
        if command == "load":
            return self.load(data)
        if command == "status":
            receiver_id = data.get("receiverId")
            cast = self.device(receiver_id)
            binding = self.bindings.get(receiver_id)
            require(not binding or binding["context"] == self.context(data.get("context")), "cast-ownership-lost")
            self.refresh(cast)
            if self.owned(cast, binding):
                require(self.recent_admitted(cast, binding), "cast-status-not-fresh")
            return self.state(receiver_id, cast, binding)
        receiver_id, cast, binding = self.admitted(data, permit_empty=command == "disconnect")
        controller = cast.media_controller
        if command == "queue":
            require(not binding["queued"], "cast-queue-already-admitted")
            episode = self.episode(data.get("episode"))
            current = self.state(receiver_id, cast, binding)
            require(int(episode["episodeId"][-4:]) == int(current["episodeId"][-4:]) + 1, "cast-next-episode")
            item = {"media": {"contentId": episode["mediaUrl"], "contentType": episode["contentType"], "duration": episode["durationSeconds"], "streamType": "BUFFERED", "metadata": {"metadataType": 0, "title": f"One Piece · Episode {int(episode['episodeId'][-4:])}"}, "tracks": [{"trackId": 1, "type": "TEXT", "subtype": "SUBTITLES", "language": "en", "trackContentId": episode["subtitleUrl"], "trackContentType": "text/vtt"}]}, "autoplay": True, "startTime": 0, "activeTrackIds": [1], "preloadTime": 0}
            item["activeTrackIds"] = [1] if current["subtitleEnabled"] else []
            response = self.wait_response(5, "queue next episode")
            controller.send_message({"type": "QUEUE_INSERT", "mediaSessionId": controller.status.media_session_id, "items": [item]}, inc_session_id=True, callback_function=response.callback)
            response.wait_response()
            binding["media"][digest(episode["mediaUrl"])] = episode
            binding["queued"] = episode["mediaUid"]
            return {**current, "queuedEpisodeId": episode["episodeId"]}
        if command in ("pause", "play"):
            getattr(controller, command)(timeout=5)
            desired = "PAUSED" if command == "pause" else "PLAYING"
            return self.wait_state(receiver_id, cast, binding, lambda state: state["owned"] and state["state"] == desired)
        if command == "seek":
            value = data.get("value")
            duration = self.state(receiver_id, cast, binding)["durationSeconds"]
            require(type(value) in (int, float) and math.isfinite(value) and 0 <= value < duration, "cast-seek")
            controller.seek(value, timeout=5)
            return self.wait_state(receiver_id, cast, binding, lambda state: state["owned"] and abs(state["positionSeconds"] - value) < 3)
        if command == "volume":
            value = data.get("value")
            require(type(value) in (int, float) and math.isfinite(value) and 0 <= value <= 1, "cast-volume")
            cast.set_volume(value, timeout=5)
            return self.wait_state(receiver_id, cast, binding, lambda state: state["owned"] and abs(state["volume"] - value) < 0.03)
        if command == "subtitles":
            value = data.get("value")
            require(type(value) is bool, "cast-subtitles")
            controller.enable_subtitle(1, timeout=5) if value else controller.disable_subtitle(timeout=5)
            return self.wait_state(receiver_id, cast, binding, lambda state: state["owned"] and state["subtitleEnabled"] == value)
        if command == "next":
            require(binding["queued"] is not None, "cast-next-not-ready")
            expected = binding["queued"]
            controller.queue_next(timeout=5)
            result = self.wait_state(receiver_id, cast, binding, lambda state: state["owned"] and state["mediaUid"] == expected and state["state"] in ("PLAYING", "PAUSED"))
            binding["queued"] = None
            return result
        if command == "disconnect":
            state = self.state(receiver_id, cast, binding)
            # Stop uses the mediaSessionId already proven ours. Receiver STOP
            # explicitly names our captured receiver session, preventing a race.
            if controller.status.media_session_id is not None:
                controller.stop(timeout=5)
            response = self.wait_response(5, "stop owned receiver session")
            cast.socket_client.receiver_controller.send_message({"type": "STOP", "sessionId": binding["receiverSession"]}, callback_function=response.callback)
            response.wait_response()
            self.bindings.pop(receiver_id, None)
            return {**state, "disconnected": True}
        raise CastError("cast-command")

    def close(self) -> None:
        # Pipe loss/process restart never sends STOP to a possibly changed TV.
        # The Node owner explicitly disconnects its admitted sessions first.
        for cast in self.devices.values():
            cast.disconnect()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tools", required=True)
    args = parser.parse_args()
    sys.path.insert(0, args.tools)
    logging.disable(logging.CRITICAL)
    worker = None
    try:
        worker = Worker(json.loads(os.environ.get("ONE_PIECE_CAST_CONFIG", "{}")))
        for line in sys.stdin:
            request_id = None
            try:
                require(len(line) <= 131072, "cast-message-limit")
                message = json.loads(line)
                request_id = message.get("id")
                require(isinstance(request_id, str) and re.fullmatch(r"[0-9a-f-]{36}", request_id) is not None, "cast-request-id")
                require(message.get("command") in ("discover", "load", "queue", "pause", "play", "seek", "volume", "subtitles", "next", "disconnect", "status"), "cast-command")
                result = worker.execute(message["command"], message)
                response = {"id": request_id, "ok": True, "result": result}
            except CastError as error:
                response = {"id": request_id, "ok": False, "error": str(error)}
            except Exception:
                response = {"id": request_id, "ok": False, "error": "cast-unavailable"}
            print(json.dumps(response, allow_nan=False), flush=True)
    except Exception:
        # No exception details: library errors may contain capability URLs.
        print(json.dumps({"event": "unavailable", "error": "cast-unavailable"}), flush=True)
    finally:
        if worker:
            worker.close()


if __name__ == "__main__":
    main()
