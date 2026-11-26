"""One private, bounded llama.cpp call for a claimed Velum Auto Review job."""
import base64
import ctypes as c
from ctypes import wintypes as w
import json
import msvcrt
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import time
from urllib.request import Request, build_opener, HTTPRedirectHandler, ProxyHandler

import psutil

HERE = Path(__file__).resolve().parent
SPEC = json.loads((HERE / "review-vision-models.json").read_text(encoding="utf-8"))
ROOT = Path(SPEC["root"])
LOCK = Path(r"H:\AI-ImageGen\portrait-pilot\velum-studio\inference.lock")
GIB = 1024 ** 3
CALL_SECONDS = 180
class LocalOnly(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


OPENER = build_opener(ProxyHandler({}), LocalOnly())


class BasicLimits(c.Structure):
    _fields_ = [("processTime", c.c_int64), ("jobTime", c.c_int64),
                ("flags", w.DWORD), ("minWorkingSet", c.c_size_t),
                ("maxWorkingSet", c.c_size_t), ("activeProcesses", w.DWORD),
                ("affinity", c.c_size_t), ("priority", w.DWORD), ("scheduling", w.DWORD)]


class ExtendedLimits(c.Structure):
    _fields_ = [("basic", BasicLimits), ("ioCounters", c.c_uint64 * 6),
                ("memory", c.c_size_t * 4)]


class OwnedServer:
    def __init__(self, command, environment):
        kernel = self.kernel = c.WinDLL("kernel32", use_last_error=True)
        kernel.CreateJobObjectW.argtypes = (c.c_void_p, w.LPCWSTR)
        kernel.CreateJobObjectW.restype = w.HANDLE
        kernel.SetInformationJobObject.argtypes = (w.HANDLE, c.c_int, c.c_void_p, w.DWORD)
        kernel.AssignProcessToJobObject.argtypes = (w.HANDLE, w.HANDLE)
        kernel.OpenProcess.argtypes = (w.DWORD, w.BOOL, w.DWORD)
        kernel.OpenProcess.restype = w.HANDLE
        kernel.CloseHandle.argtypes = (w.HANDLE,)
        self.handle = kernel.CreateJobObjectW(None, None)
        if not self.handle:
            raise RuntimeError("vision-process-guard")
        self.process = None
        try:
            limits = ExtendedLimits()
            limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            if not kernel.SetInformationJobObject(self.handle, 9, c.byref(limits), c.sizeof(limits)):
                raise RuntimeError("vision-process-guard")
            self.process = subprocess.Popen(command, cwd=ROOT, env=environment,
                                            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                            stderr=subprocess.DEVNULL,
                                            creationflags=subprocess.CREATE_NO_WINDOW | subprocess.BELOW_NORMAL_PRIORITY_CLASS)
            target = kernel.OpenProcess(0x0101, False, self.process.pid)
            try:
                if not target or not kernel.AssignProcessToJobObject(self.handle, target):
                    raise RuntimeError("vision-process-guard")
            finally:
                if target:
                    kernel.CloseHandle(target)
        except BaseException:
            if self.process and self.process.poll() is None:
                self.process.kill()
            self.close()
            raise

    def close(self):
        self.kernel.CloseHandle(self.handle)
        if self.process:
            self.process.wait(timeout=8)


def available(role):
    return ((ROOT / "bin" / "llama-server.exe").is_file() and
            all((ROOT / "models" / item["file"]).stat().st_size == item["bytes"]
                for item in SPEC[role]["files"]))


def guard(parent_pid, parent_created, start=False):
    if parent_pid and (not psutil.pid_exists(parent_pid) or
                       abs(psutil.Process(parent_pid).create_time() - parent_created) > 0.05):
        raise RuntimeError("vision-parent-exited")
    try:
        gpu = subprocess.check_output(
            ["nvidia-smi", "--id=0", "--query-gpu=memory.used,temperature.gpu", "--format=csv,noheader,nounits"],
            text=True, timeout=2, creationflags=subprocess.CREATE_NO_WINDOW).strip().split(",")
        memory, temperature = map(int, gpu)
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        raise RuntimeError("resource-guard") from error
    if (psutil.virtual_memory().available < (6 if start else 5) * GIB or memory > 7500 or temperature >= 78 or
            shutil.disk_usage("H:/").free < 20 * GIB or shutil.disk_usage("F:/").free < 10 * GIB):
        raise RuntimeError("resource-guard")


def image_part(filename):
    source = Path(filename)
    if not 100 <= source.stat().st_size <= 7_200_000:
        raise RuntimeError("invalid-output")
    data = source.read_bytes()
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        mime = "image/png"
    elif data.startswith(b"\xff\xd8\xff"):
        mime = "image/jpeg"
    else:
        raise RuntimeError("invalid-output")
    return {"type": "image_url", "image_url": {
        "url": "data:" + mime + ";base64," + base64.b64encode(data).decode("ascii")}}


def request(port, token, route, payload=None, timeout=5):
    body = json.dumps(payload).encode() if payload is not None else None
    call = Request(f"http://127.0.0.1:{port}{route}", data=body, headers={
        "Content-Type": "application/json", "Authorization": "Bearer " + token})
    with OPENER.open(call, timeout=timeout) as response:
        return json.loads(response.read(128_001))


def invoke(options):
    role = options["role"]
    if not available(role):
        raise RuntimeError("vision-model-unavailable")
    parent_pid = options.get("parentPid")
    parent_created = psutil.Process(parent_pid).create_time() if parent_pid else None
    if parent_pid and parent_pid != os.getppid():
        raise RuntimeError("vision-parent-exited")
    state = ROOT / "work"
    state.mkdir(exist_ok=True)
    env = {key: value for key, value in os.environ.items()
           if key.upper() not in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY")}
    env.update({"TEMP": str(state), "TMP": str(state), "CUDA_CACHE_DISABLE": "1",
                "HF_HOME": str(state), "HF_HUB_OFFLINE": "1", "NO_PROXY": "127.0.0.1"})
    model, projector = [str(ROOT / "models" / item["file"]) for item in SPEC[role]["files"]]
    with LOCK.open("rb") as lock:
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError as error:
            raise RuntimeError("resource-guard") from error
        guard(parent_pid, parent_created, start=True)
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        token = secrets.token_hex(32)
        command = [str(ROOT / "bin" / "llama-server.exe"), "-m", model, "--mmproj", projector,
                   "--host", "127.0.0.1", "--port", str(port), "--api-key", token,
                   "-ngl", "99", "-c", "4096", "-t", "4", "--parallel", "1", "--image-max-tokens", "900",
                   "--no-webui", "--no-warmup"]
        server = OwnedServer(command, env)
        try:
            deadline = time.monotonic() + CALL_SECONDS
            while True:
                if server.process.poll() is not None or time.monotonic() >= deadline:
                    raise RuntimeError("vision-runtime-unavailable")
                guard(parent_pid, parent_created)
                try:
                    if request(port, token, "/health", timeout=1).get("status") == "ok":
                        break
                except (OSError, ValueError):
                    pass
                time.sleep(1)
            if options.get("probe"):
                return {"model": SPEC[role]["id"], "status": "ready"}
            content = [{"type": "text", "text": options["instruction"]}]
            content.extend(image_part(filename) for filename in options["images"])
            body = {"messages": [{"role": "user", "content": content}], "temperature": 0,
                    "max_tokens": 512, "stream": False, "response_format": {"type": "json_object"}}
            # The request runs concurrently with the resource/parent watchdog.
            from concurrent.futures import ThreadPoolExecutor, TimeoutError
            pool = ThreadPoolExecutor(max_workers=1)
            try:
                completion = pool.submit(request, port, token, "/v1/chat/completions", body,
                                         max(1, deadline - time.monotonic()))
                while time.monotonic() < deadline:
                    guard(parent_pid, parent_created)
                    try:
                        result = completion.result(timeout=2)
                        return json.loads(result["choices"][0]["message"]["content"])
                    except TimeoutError:
                        continue
                raise RuntimeError("vision-timeout")
            finally:
                pool.shutdown(wait=False, cancel_futures=True)
        finally:
            server.close()


if __name__ == "__main__":
    try:
        options = json.load(sys.stdin)
        print(json.dumps(invoke(options), ensure_ascii=True))
    except Exception as error:
        reason = str(error)
        allowed = {"vision-timeout", "vision-model-unavailable", "vision-runtime-unavailable", "resource-guard",
                   "invalid-output", "vision-parent-exited", "vision-process-guard"}
        print(json.dumps({"error": reason if reason in allowed else "vision-response-unavailable"}))
        sys.exit(1)
