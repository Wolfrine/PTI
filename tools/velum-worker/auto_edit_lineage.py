"""Validate the live Studio process lineage across Windows venv redirectors.

This is a resource/process guard, not a substitute for device authorization.
Only a direct Node parent or the explicitly configured Python launcher between
the Python child and that same Node process is accepted.
"""
import math
import os

def _same_path(a, b):
    return os.path.normcase(os.path.realpath(a)) == os.path.normcase(os.path.realpath(b))

def worker_lineage(psutil, worker_pid, launcher_path, expected_created=None, expected_chain=None):
    if type(worker_pid) is not int or worker_pid <= 0 or not isinstance(launcher_path, str) or not os.path.isabs(launcher_path):
        raise ValueError('parent-identity')
    try:
        child = psutil.Process()
        direct = child.parent()
        if direct is None or not direct.is_running():
            raise ValueError('parent-identity')
        if direct.pid == worker_pid:
            worker = direct
            parents = [worker]
        else:
            # Windows Python venv may launch the actual interpreter through
            # its redirector. Never accept an arbitrary intermediary.
            if not _same_path(direct.exe(), launcher_path):
                raise ValueError('parent-identity')
            worker = direct.parent()
            if worker is None or worker.pid != worker_pid or not worker.is_running():
                raise ValueError('parent-identity')
            parents = [direct, worker]
        created = worker.create_time()
        if worker.name().lower() not in ('node.exe', 'node') or not math.isfinite(created):
            raise ValueError('parent-identity')
        if expected_created is not None and created != expected_created:
            raise ValueError('parent-identity')
        previous = child.create_time()
        chain = []
        for parent in parents:
            t = parent.create_time()
            if not parent.is_running() or not math.isfinite(t) or t > previous:
                raise ValueError('parent-identity')
            chain.append((parent.pid, t))
            previous = t
        if expected_chain is not None and chain != expected_chain:
            raise ValueError('parent-identity')
        return created, chain
    except (psutil.Error, OSError):
        raise ValueError('parent-identity') from None
