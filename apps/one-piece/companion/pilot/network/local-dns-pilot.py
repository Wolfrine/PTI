"""Ephemeral LAN-only mDNS + non-sensitive HTTP health experiment.

No OS DNS, hosts file, router, firewall, CA trust, or permanent service changes.
This is NOT the authenticated media companion or a production transport choice.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.metadata
import ipaddress
import json
from pathlib import Path
import signal
import socket
import struct
import sys
import threading
import time
import urllib.request


def dns_name(name: str) -> bytes:
    return b"".join(bytes([len(part)]) + part.encode("ascii") for part in name.rstrip(".").split(".")) + b"\0"


def skip_name(packet: bytes, offset: int) -> int:
    while packet[offset]:
        if packet[offset] & 0xC0 == 0xC0:
            return offset + 2
        offset += 1 + packet[offset]
    return offset + 1


def raw_mdns_query(hostname: str, address: str) -> dict:
    """Send a real legacy-unicast mDNS A query; retain only answer addresses."""
    packet = struct.pack("!6H", 0x4F50, 0, 1, 0, 0, 0) + dns_name(hostname) + struct.pack("!HH", 1, 1)
    started = time.monotonic()
    result = {"method": "UDP multicast query 224.0.0.251:5353, ephemeral return port", "query": hostname, "answers": []}
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP) as client:
        client.bind((address, 0))
        client.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(address))
        client.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 255)
        client.settimeout(4)
        client.sendto(packet, ("224.0.0.251", 5353))
        try:
            response, _ = client.recvfrom(9000)
            ident, flags, qd, an, ns, ar = struct.unpack("!6H", response[:12])
            offset = 12
            for _ in range(qd):
                offset = skip_name(response, offset) + 4
            for _ in range(an + ns + ar):
                offset = skip_name(response, offset)
                kind, _, ttl, size = struct.unpack_from("!HHIH", response, offset)
                offset += 10
                if kind == 1 and size == 4:
                    result["answers"].append({"type": "A", "address": socket.inet_ntoa(response[offset:offset + size]), "ttl_seconds": ttl})
                offset += size
            result.update({"response_id_matches": ident == 0x4F50, "response_bytes": len(response), "response_flag": bool(flags & 0x8000)})
        except (OSError, IndexError, struct.error) as error:
            result["error"] = type(error).__name__
    result["elapsed_seconds"] = round(time.monotonic() - started, 3)
    result["passed"] = any(item["address"] == address for item in result["answers"])
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--address", default="192.168.68.105")
    parser.add_argument("--hostname", default="onepiece-pilot.local.")
    parser.add_argument("--port", type=int, default=8794)
    parser.add_argument("--seconds", type=int, default=1800)
    parser.add_argument("--tools", type=Path, default=Path("H:/PTI-OnePiece/pilot/tools/python"))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not ipaddress.ip_address(args.address).is_private or args.address.startswith("127."):
        parser.error("Bind only a private LAN interface address, not wildcard/public/loopback.")
    if not args.hostname.endswith(".local.") or not 1 <= args.seconds <= 3600:
        parser.error("This bounded mDNS pilot requires .local. and a duration of 1..3600 seconds.")
    sys.path.insert(0, str(args.tools.resolve()))
    from zeroconf import IPVersion, ServiceInfo, Zeroconf

    result = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "experiment": "Ephemeral local hostname discovery and health transport only",
        "hostname": args.hostname,
        "address": args.address,
        "port": args.port,
        "python_version": sys.version.split()[0],
        "zeroconf_version": importlib.metadata.version("zeroconf"),
        "production_transport_accepted": False,
        "limits": ["No auth, tokens, media or engine administration", "No permanent OS/router/DNS/firewall changes", "No TLS certificate issuance or trust installation", "Same-PC resolution is not Android/receiver compatibility evidence"],
        "requests": [],
    }
    lock = threading.Lock()

    def save() -> None:
        with lock:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args) -> None:
            pass

        def respond_headers(self, status: int, length: int = 0) -> None:
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(length))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            if self.headers.get("Origin") == "https://pti-app-2ab59.web.app":
                self.send_header("Access-Control-Allow-Origin", "https://pti-app-2ab59.web.app")
                self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
                self.send_header("Vary", "Origin")
            self.end_headers()

        def do_OPTIONS(self) -> None:
            self.respond_headers(204)

        def do_GET(self) -> None:
            valid = self.path in ("/", "/health.json")
            data = json.dumps({"status": "pilot-only", "service": "one-piece-local-dns", "media": False, "tls": False} if valid else {"error": "not_found"}).encode()
            self.respond_headers(200 if valid else 404, len(data))
            self.wfile.write(data)
            with lock:
                result["requests"].append({"timestamp": datetime.now(timezone.utc).isoformat(), "path": self.path if valid else "other", "origin": self.headers.get("Origin"), "user_agent": self.headers.get("User-Agent", "")[:180], "status": 200 if valid else 404})
            save()

    # Bind only the chosen LAN interface. Access still depends on existing firewall policy.
    server = ThreadingHTTPServer((args.address, args.port), Handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    zc = Zeroconf(interfaces=[args.address], ip_version=IPVersion.V4Only)
    info = ServiceInfo("_http._tcp.local.", "One Piece health-only pilot._http._tcp.local.", addresses=[socket.inet_aton(args.address)], port=args.port, properties={"path": "/health.json", "pilot": "health-only"}, server=args.hostname)
    stopped = threading.Event()
    for signum in (signal.SIGINT, signal.SIGTERM):
        signal.signal(signum, lambda *_: stopped.set())
    try:
        zc.register_service(info)
        result["advertisement_registered"] = True
        result["mdns_packet"] = raw_mdns_query(args.hostname, args.address)
        executor = ThreadPoolExecutor(max_workers=1)
        future = executor.submit(socket.getaddrinfo, args.hostname.rstrip("."), args.port, socket.AF_INET, socket.SOCK_STREAM)
        try:
            addresses = sorted({entry[4][0] for entry in future.result(timeout=6)})
            result["os_resolution"] = {"addresses": addresses, "passed": args.address in addresses}
        except (OSError, TimeoutError) as error:
            result["os_resolution"] = {"passed": False, "error": type(error).__name__}
        executor.shutdown(wait=False)
        # Bypass environment HTTP proxies only for this fixed health-only pilot.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        for label, host in (("ip_health", args.address), ("hostname_health", args.hostname.rstrip("."))):
            try:
                with opener.open(f"http://{host}:{args.port}/health.json", timeout=5) as response:
                    result[label] = {"status": response.status, "body": json.load(response)}
            except (OSError, ValueError) as error:
                result[label] = {"error": type(error).__name__}
        save()
        print(json.dumps({"ready": True, "url": f"http://{args.hostname.rstrip('.')}:{args.port}/health.json", "result": str(args.output), "lifetime_seconds": args.seconds}), flush=True)
        stopped.wait(args.seconds)
    finally:
        zc.unregister_service(info)
        zc.close()
        server.shutdown()
        server.server_close()
        result["stopped_at"] = datetime.now(timezone.utc).isoformat()
        save()


if __name__ == "__main__":
    main()
