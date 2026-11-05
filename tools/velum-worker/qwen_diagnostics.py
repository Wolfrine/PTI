"""Private, bounded Qwen safety evidence. No prompts, media or cloud I/O.

Thresholds deliberately match the installed adapter. A failed observation is
unsafe, independently of the other observations; diagnostics never authorize a
retry or relax a limit.
"""
import json
import math
import subprocess
import threading
import time
from datetime import datetime, timezone

GIB = 1024**3
TIMEOUT_SECONDS = 7200


def evaluate(sample, startup=False):
    """Every predicate carries its actual reading, comparison and limit."""
    def check(name, actual, operator, threshold, passed):
        return dict(predicate=name, actual=actual, operator=operator,
                    threshold=threshold, passed=bool(passed))
    def reading(name, value, operator, limit, compare):
        valid = isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
        return check(name, value, operator, limit, valid and compare(value, limit))
    value = sample.get('observed', {})
    parent = value.get('parent', {})
    checks = [check('parent-identity', parent.get('matches'), '==', True, parent.get('matches') is True)]
    for name, field, operator, limit, compare in (
        ('ram-available', 'ramAvailableBytes', '>=', (6 if startup else 5)*GIB, lambda a,b:a>=b),
        ('disk-f-free', 'diskFreeFBytes', '>=', 10*GIB, lambda a,b:a>=b),
        ('disk-h-free', 'diskFreeHBytes', '>=', 20*GIB, lambda a,b:a>=b),
        ('elapsed', 'elapsedSeconds', '<=', TIMEOUT_SECONDS, lambda a,b:a<=b),
        ('vram-used', 'vramUsedMiB', '<=', 7500, lambda a,b:a<=b),
        ('gpu-temperature', 'gpuTempC', '<', 78, lambda a,b:a<b),
    ):
        checks.append(reading(name, value.get(field), operator, limit, compare))
    for name, query in sample.get('queries', {}).items():
        if query.get('required', True) is False:
            continue
        checks.append(check('query-'+name, query.get('exceptionType'), '==', None,
                            query.get('exceptionType') is None))
    return dict(predicates=checks, failed=[c['predicate'] for c in checks if not c['passed']])


def collect(psutil, parent_pid, parent_created, started, *, now=time.monotonic,
            execute=subprocess.check_output, cuda=None, clock=time.perf_counter):
    observed = dict(elapsedSeconds=round(now()-started, 3))
    queries = {}
    def query(name, operation, required=True):
        before = clock()
        try:
            operation()
            queries[name] = dict(exceptionType=None)
        except Exception as error:
            # Exception messages/command lines can contain private paths. Keep
            # only the class and fixed query identity.
            queries[name] = dict(exceptionType=type(error).__name__)
        queries[name]['latencyMs'] = round((clock()-before)*1000, 3)
        queries[name]['required'] = required
    def parent():
        process = psutil.Process(parent_pid)
        created = process.create_time()
        observed['parent'] = dict(pid=parent_pid, expectedCreated=parent_created,
                                  observedCreated=created, matches=created == parent_created and process.is_running())
    def ram():
        value = psutil.virtual_memory()
        observed.update(ramAvailableBytes=value.available, ramTotalBytes=value.total)
    def gpu():
        raw = execute(['nvidia-smi', '--id=0', '--query-gpu=memory.used,temperature.gpu',
                       '--format=csv,noheader,nounits'],
                      creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0), text=True, timeout=5)
        # Bounded raw observation aids diagnosis of malformed NVIDIA output.
        observed['gpuRaw'] = raw.strip()[:256]
        rows = raw.strip().splitlines()
        if len(rows) != 1:
            raise ValueError('invalid-gpu-row-count')
        values = [float(part.strip()) for part in rows[0].split(',')]
        if len(values) != 2 or not all(math.isfinite(v) and v >= 0 for v in values):
            raise ValueError('invalid-gpu-reading')
        observed.update(vramUsedMiB=values[0], gpuTempC=values[1])
    query('parent', parent)
    query('ram', ram)
    query('disk-f', lambda: observed.update(diskFreeFBytes=psutil.disk_usage('F:\\').free))
    query('disk-h', lambda: observed.update(diskFreeHBytes=psutil.disk_usage('H:\\').free))
    query('gpu', gpu)
    def process():
        current = psutil.Process()
        observed['processMemory'] = dict(current.memory_info()._asdict())
        observed['processCpuSeconds'] = dict(current.cpu_times()._asdict())
        observed['systemSwap'] = dict(psutil.swap_memory()._asdict())
    query('process', process, required=False)
    # Supplementary allocator telemetry never substitutes for whole-GPU limits.
    if cuda is not None:
        query('cuda', lambda: observed.update(cudaAllocatedBytes=cuda.memory_allocated(),
            cudaReservedBytes=cuda.memory_reserved(), cudaPeakAllocatedBytes=cuda.max_memory_allocated(),
            cudaPeakReservedBytes=cuda.max_memory_reserved()), required=False)
    return dict(observed=observed, queries=queries)


class Diagnostics:
    def __init__(self, directory, started, emit=lambda **value:None, now=time.monotonic):
        self.directory, self.started, self.emit, self.now = directory, started, emit, now
        self.lock = threading.RLock()
        self.stage = 'preparing'
        self.stages = []
        self.last = self.trip = None
        self.peaks = {}

    def write(self, event, **data):
        with self.lock:
            record = dict(event=event, utc=datetime.now(timezone.utc).isoformat(),
                          seconds=round(self.now()-self.started, 3), stage=self.stage, **data)
            with (self.directory/'diagnostics.jsonl').open('a', encoding='utf-8') as output:
                output.write(json.dumps(record, allow_nan=False)+'\n')
                output.flush()
            return record

    def transition(self, name, **data):
        with self.lock:
            self.stage = name
            record = self.write('stage', **data)
            self.stages.append(dict(stage=name, seconds=record['seconds'], utc=record['utc']))
            self.emit(event='stage', stage=name, seconds=record['seconds'])

    def observe(self, sample, startup=False):
        with self.lock:
            sample = {**sample, **evaluate(sample, startup)}
            for key in ('vramUsedMiB', 'gpuTempC', 'cudaPeakAllocatedBytes', 'cudaPeakReservedBytes'):
                value = sample['observed'].get(key)
                if value is not None:
                    self.peaks[key] = max(value, self.peaks.get(key, value))
            available = sample['observed'].get('ramAvailableBytes')
            if available is not None:
                self.peaks['minRamAvailableBytes'] = min(available, self.peaks.get('minRamAvailableBytes', available))
            self.last = self.write('guard-sample', **sample, peaks=dict(self.peaks))
            if sample['failed'] and self.trip is None:
                self.trip = self.last
                # Persist before interrupting the main thread, including a
                # watchdog hard exit that might bypass the adapter's finally.
                with (self.directory/'guard-trip.json').open('x', encoding='utf-8') as output:
                    json.dump(self.trip, output, allow_nan=False)
                self.emit(event='guard-trip', failed=sample['failed'])
            return bool(sample['failed'])


class SamplingProgress:
    """Sampler preparation lasts until the first real completed step."""
    def __init__(self, diagnostics, emit):
        self.diagnostics, self.emit, self.started = diagnostics, emit, False

    def __call__(self, step, total):
        if not self.started and step > 0:
            self.diagnostics.write('first-sampling-step', step=step, total=total)
            self.diagnostics.transition('sampling')
            self.started = True
        if self.started:
            self.emit(event='progress', step=step, total=total)


def encoder_threads(environment):
    """Local experimental switch; four remains the verified default."""
    value = environment.get('VELUM_QWEN_CPU_THREADS', '4')
    if value not in ('4', '6'):
        raise ValueError('invalid-encoder-threads')
    return int(value)
