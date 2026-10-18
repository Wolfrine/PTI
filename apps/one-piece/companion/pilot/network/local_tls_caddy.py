"""Isolated Caddy private-CA probe; never installs a trust root or logs URLs."""
from __future__ import annotations

import csv
import hashlib
import io
import json
from pathlib import Path
import re
import select
import socket
import socketserver
import ssl
import subprocess
import threading
import time


class LocalTlsCaddy:
    def __init__(self, address: str, upstream_port: int, port: int = 8796) -> None:
        self.address = address
        self.upstream_port = upstream_port
        self.port = port
        self.hostname = "onepiece-tls.local"
        self.binary = Path("H:/PTI-OnePiece/pilot/network/runtime/caddy.exe")
        self.runtime = Path("H:/PTI-OnePiece/pilot/network/private-ca-pilot")
        self.process = None
        self.reader = None
        self.forwarder = None
        self.forwarder_thread = None
        self.internal_port = 8798
        self.phase = "local certificate validation"
        self.receiver_address = None
        self.evidence = {"hostname": self.hostname, "port": port, "private_ca_installed": False, "external_dns_account": False, "firewall_changed": False, "admin_enabled": False, "diagnostics": [], "tls_tcp_connections": [], "transport": "LAN Python TCP forwarder preserves encrypted TLS bytes to loopback-only Caddy, avoiding a new executable firewall exception"}

    def _collect_logs(self) -> None:
        for line in self.process.stdout:
            try:
                record = json.loads(line)
            except ValueError:
                continue
            logger = record.get("logger", "")
            message = str(record.get("msg", ""))
            if not (logger.startswith("tls.") or logger == "http.stdlib" or "certificate" in message.lower()):
                continue
            # Keep only TLS diagnostics. Access/request logs and URIs never leave
            # process memory, so a media capability cannot be persisted here.
            sanitized = re.sub(r"\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b", "[LAN peer]", message)
            entry = {"timestamp_unix": record.get("ts"), "logger": logger, "message": sanitized[:600]}
            error = record.get("error")
            if error and ("TLS" in str(error) or "tls" in str(error) or "certificate" in str(error)):
                entry["error"] = re.sub(r"\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b", "[LAN peer]", str(error))[:400]
            if self.receiver_address and self.receiver_address in message:
                entry["peer"] = "receiver"
            elif self.address in message:
                entry["peer"] = "same PC"
            if len(self.evidence["diagnostics"]) < 160:
                self.evidence["diagnostics"].append(entry)

    def start(self) -> None:
        digest = hashlib.sha256(self.binary.read_bytes()).hexdigest().upper()
        if digest != "4B709838F21C4A641DF02D4561E2243C100B862011444EBABB1517AC88C11243":
            raise ValueError("Retained Caddy binary no longer matches inspected provenance")
        self.evidence["caddy_sha256"] = digest
        self.evidence["caddy_version"] = subprocess.check_output([str(self.binary), "version"], text=True, timeout=5).strip()
        self.runtime.mkdir(parents=True, exist_ok=True)
        user_csv = subprocess.check_output(["whoami", "/user", "/fo", "csv", "/nh"], text=True, timeout=5)
        sid = next(csv.reader(io.StringIO(user_csv.strip())))[1]
        # Restrict only this newly owned runtime. Children inherit owner/SYSTEM
        # access; no existing user's directory ACL is modified.
        acl = subprocess.run(["icacls", str(self.runtime), "/inheritance:r", "/grant:r", f"*{sid}:(OI)(CI)F", "*S-1-5-18:(OI)(CI)F"], capture_output=True, text=True, timeout=10)
        if acl.returncode:
            raise RuntimeError("Could not protect isolated private-CA storage")
        self.evidence["runtime_acl_restricted_to_current_user_and_system"] = True
        config = self.runtime / "Caddyfile"
        config.write_text("\n".join([
            "{", "  debug", "  admin off", "  persist_config off", "  skip_install_trust", "  auto_https disable_redirects", f"  storage file_system {self.runtime.as_posix()}/storage", "  servers {", "    protocols h1 h2", "  }", "}",
            f"https://{self.hostname}:{self.internal_port} {{", "  bind 127.0.0.1", "  tls internal", f"  reverse_proxy {self.address}:{self.upstream_port}", "}", ""
        ]), encoding="utf-8")
        validated = subprocess.run([str(self.binary), "adapt", "--config", str(config), "--adapter", "caddyfile", "--validate"], capture_output=True, timeout=15)
        if validated.returncode:
            raise RuntimeError("Caddy configuration validation failed")
        self.evidence["configuration_validated"] = True
        self.process = subprocess.Popen([str(self.binary), "run", "--config", str(config), "--adapter", "caddyfile"], cwd=self.runtime, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
        self.reader = threading.Thread(target=self._collect_logs, daemon=True)
        self.reader.start()
        helper = self
        class Forwarder(socketserver.BaseRequestHandler):
            def handle(self) -> None:
                entry = {"phase": helper.phase, "peer": "receiver" if self.client_address[0] == helper.receiver_address else "same PC" if self.client_address[0] == helper.address else "other LAN", "started_unix": time.time(), "client_to_tls_bytes": 0, "tls_to_client_bytes": 0}
                helper.evidence["tls_tcp_connections"].append(entry)
                try:
                    with socket.create_connection(("127.0.0.1", helper.internal_port), timeout=3) as upstream:
                        self.request.settimeout(3)
                        until = time.monotonic() + 35
                        peers = (self.request, upstream)
                        while time.monotonic() < until:
                            ready, _, _ = select.select(peers, [], [], 0.5)
                            for source in ready:
                                data = source.recv(65536)
                                if not data:
                                    return
                                if source is self.request:
                                    entry["client_to_tls_bytes"] += len(data)
                                    upstream.sendall(data)
                                else:
                                    entry["tls_to_client_bytes"] += len(data)
                                    self.request.sendall(data)
                                if entry["client_to_tls_bytes"] + entry["tls_to_client_bytes"] > 20 * 1024 * 1024:
                                    entry["limit_reached"] = True
                                    return
                except OSError as error:
                    entry["error"] = type(error).__name__
                finally:
                    entry["finished_unix"] = time.time()
        class Server(socketserver.ThreadingTCPServer):
            daemon_threads = True
        self.forwarder = Server((self.address, self.port), Forwarder)
        self.forwarder_thread = threading.Thread(target=self.forwarder.serve_forever, daemon=True)
        self.forwarder_thread.start()
        root = self.runtime / "storage/pki/authorities/local/root.crt"
        until = time.monotonic() + 12
        while time.monotonic() < until:
            if self.process.poll() is not None:
                raise RuntimeError("Caddy exited before TLS readiness")
            if root.is_file():
                try:
                    self._probe_explicit_ca(root)
                    break
                except OSError:
                    pass
            time.sleep(0.3)
        else:
            raise TimeoutError("Local certificate readiness exceeded 12 seconds")
        root_der = ssl.PEM_cert_to_DER_cert(root.read_text(encoding="utf-8"))
        root_digest = hashlib.sha256(root_der).hexdigest()
        self.evidence["root_ca_certificate_sha256"] = root_digest
        self.evidence["root_ca_present_in_windows_root_store"] = any(hashlib.sha256(item[0]).hexdigest() == root_digest for item in ssl.enum_certificates("ROOT"))
        default_context = ssl.create_default_context()
        try:
            with socket.create_connection((self.address, self.port), timeout=3) as raw:
                with default_context.wrap_socket(raw, server_hostname=self.hostname):
                    self.evidence["default_pc_trust"] = {"accepted": True}
        except ssl.SSLCertVerificationError as error:
            self.evidence["default_pc_trust"] = {"accepted": False, "error": type(error).__name__, "verify_code": error.verify_code, "verify_message": error.verify_message}

    def _probe_explicit_ca(self, root: Path) -> None:
        # A process-scoped, known CA trust anchor with hostname checking. This is
        # certificate validation, not CERT_NONE or a browser security bypass.
        context = ssl.create_default_context(cafile=str(root))
        with socket.create_connection((self.address, self.port), timeout=3) as raw:
            with context.wrap_socket(raw, server_hostname=self.hostname) as connection:
                certificate = connection.getpeercert()
                self.evidence["explicit_process_ca_probe"] = {"accepted": True, "check_hostname": context.check_hostname, "verify_mode": "CERT_REQUIRED", "tls_version": connection.version(), "subject_alt_names": certificate.get("subjectAltName"), "issuer": certificate.get("issuer")}

    def stop(self) -> None:
        if self.forwarder:
            self.forwarder.shutdown()
            self.forwarder.server_close()
            self.forwarder = None
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
        if self.reader:
            self.reader.join(timeout=2)
        self.evidence["caddy_stopped"] = not self.process or self.process.poll() is not None
