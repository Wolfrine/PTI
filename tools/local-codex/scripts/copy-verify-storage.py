"""Owner-operated copy/integrity receipt. Never deletes or changes the source."""
import argparse
import ctypes
from ctypes import wintypes
import hashlib
import json
import msvcrt
import os
from pathlib import Path
import time
from datetime import datetime

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('source')
p.add_argument('destination')
p.add_argument('receipt')
a = p.parse_args()
source = Path(a.source).resolve(strict=True)
destination = Path(a.destination).resolve()
protected = Path(r'F:\Workspace\Programs\Independent-Products\PTI\pti-app\.angular')
if source == protected or source.is_relative_to(protected):
    raise SystemExit('Prior denied Angular-cache target is excluded.')
if source.drive.upper() != 'F:' or destination.drive.upper() != 'H:':
    raise SystemExit('This operation requires an exact F: source and H: destination.')
if destination.exists():
    raise SystemExit('Destination exists; preserve it and reconcile before copying.')

def inventory(root):
    files = {}
    directories = []
    stack = [root]
    while stack:
        parent = stack.pop()
        for e in os.scandir(parent):
            s = e.stat(follow_symlinks=False)
            if s.st_file_attributes & 0x400:
                raise RuntimeError('Reparse entry: ' + e.path)
            relative = str(Path(e.path).relative_to(root))
            if e.is_dir(follow_symlinks=False):
                directories.append(relative)
                stack.append(Path(e.path))
            elif e.is_file(follow_symlinks=False):
                files[relative] = (s.st_size, s.st_mtime_ns)
            else:
                raise RuntimeError('Non-regular entry: ' + e.path)
    return files, directories

create = ctypes.WinDLL('kernel32', use_last_error=True).CreateFileW
create.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                   wintypes.LPVOID, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
create.restype = wintypes.HANDLE

def exclusive_read(file):
    handle = create(str(file), 0x80000000, 0, None, 3, 0x08000000, None)
    if handle == ctypes.c_void_p(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    return os.fdopen(msvcrt.open_osfhandle(handle, os.O_RDONLY | os.O_BINARY), 'rb')

files, directories = inventory(source)
# Each copy acquires an exclusive read handle. A failure preserves the entire
# source; no source release is part of this utility.
destination.mkdir(parents=True)
for relative in directories:
    (destination / relative).mkdir(parents=True, exist_ok=True)
rows = []
started = datetime.now().astimezone().isoformat()
last = time.monotonic()
for relative, (size, modified) in files.items():
    output = destination / relative
    digest = hashlib.sha256()
    with exclusive_read(source / relative) as src, open(output, 'xb') as dst:
        while data := src.read(4 * 1024 * 1024):
            digest.update(data)
            dst.write(data)
    with open(output, 'rb') as check:
        actual = hashlib.file_digest(check, 'sha256').hexdigest()
    if output.stat().st_size != size or actual != digest.hexdigest():
        raise RuntimeError('Destination verification failed: ' + relative)
    os.utime(output, ns=(modified, modified))
    rows.append({'path': relative, 'bytes': size, 'mtimeNs': modified, 'sha256': actual})
    if time.monotonic() - last >= 20:
        print(json.dumps({'phase': 'copy-verify', 'files': len(rows), 'totalFiles': len(files)}), flush=True)
        last = time.monotonic()
if inventory(source)[0] != files:
    raise RuntimeError('Concurrent source change; preserve source and partial backup.')
receipt = {'operation': '035cd5429dd257ed2b70dc001debf190', 'source': str(source),
           'destination': str(destination), 'rootFileId': source.stat().st_ino,
           'startedAt': started, 'verifiedAt': datetime.now().astimezone().isoformat(),
           'state': 'copy-sha256-verified-source-retained', 'sourceReleased': False,
           'bytes': sum(v[0] for v in files.values()), 'fileCount': len(files), 'files': rows}
with open(a.receipt, 'x', encoding='utf-8') as out:
    json.dump(receipt, out, indent=2)
print(json.dumps({k: v for k, v in receipt.items() if k != 'files'}), flush=True)
