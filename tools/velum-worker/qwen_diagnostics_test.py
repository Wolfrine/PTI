"""Deterministic, CPU-only checks; no private media, inference or cloud."""
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace as NS
from qwen_diagnostics import collect, evaluate, Diagnostics, SamplingProgress, GIB, encoder_threads


def safe():
    return dict(observed=dict(parent=dict(matches=True), ramAvailableBytes=6*GIB,
        diskFreeFBytes=10*GIB, diskFreeHBytes=20*GIB, elapsedSeconds=7200,
        vramUsedMiB=7500, gpuTempC=77), queries={})


class GuardTests(unittest.TestCase):
    def test_all_original_limits_and_equalities(self):
        self.assertEqual(evaluate(safe())['failed'], [])
        self.assertEqual(evaluate(safe(), startup=True)['failed'], [])
        for field, bad, name in (
            ('ramAvailableBytes', 5*GIB-1, 'ram-available'),
            ('diskFreeFBytes', 10*GIB-1, 'disk-f-free'),
            ('diskFreeHBytes', 20*GIB-1, 'disk-h-free'),
            ('elapsedSeconds', 7200.001, 'elapsed'),
            ('vramUsedMiB', 7501, 'vram-used'),
            ('gpuTempC', 78, 'gpu-temperature'),
        ):
            sample = safe()
            sample['observed'][field] = bad
            report = evaluate(sample)
            self.assertEqual(report['failed'], [name])
            self.assertEqual(next(c for c in report['predicates'] if c['predicate']==name)['actual'], bad)
        sample = safe()
        sample['observed']['ramAvailableBytes'] = 5*GIB
        self.assertEqual(evaluate(sample)['failed'], [])
        self.assertEqual(evaluate(sample, startup=True)['failed'], ['ram-available'])

    def test_missing_nonfinite_and_multiple_predicates_fail_closed(self):
        for value in (None, float('nan'), float('inf'), '77', True):
            sample = safe()
            sample['observed']['gpuTempC'] = value
            self.assertIn('gpu-temperature', evaluate(sample)['failed'])
        sample = safe()
        sample['observed']['parent']['matches'] = False
        sample['observed']['gpuTempC'] = 78
        sample['queries']['gpu'] = dict(exceptionType='TimeoutExpired')
        self.assertEqual(evaluate(sample)['failed'], ['parent-identity','gpu-temperature','query-gpu'])
        sample = safe()
        sample['queries']['cuda'] = dict(exceptionType='RuntimeError', required=False)
        self.assertEqual(evaluate(sample)['failed'], [])

    def fixture(self, gpu=lambda *args,**kwargs:'7500, 77\n', created=123):
        parent = NS(create_time=lambda:created, is_running=lambda:True)
        system = NS(Process=lambda *args:parent,
            virtual_memory=lambda:NS(available=6*GIB,total=32*GIB),
            disk_usage=lambda drive:NS(free=30*GIB))
        return collect(system, 100, 123, 0, now=lambda:100, execute=gpu)

    def test_query_timeout_malformed_gpu_and_recycled_parent_are_identified(self):
        sample = self.fixture()
        self.assertEqual(evaluate(sample)['failed'], [])
        self.assertEqual(sample['observed']['parent']['observedCreated'], 123)
        for raw in ('N/A, 70', '1, 50\n2, 60', 'nan, 50', '-1, 50', '1'):
            sample = self.fixture(gpu=lambda *a,**k:raw)
            self.assertEqual(sample['queries']['gpu']['exceptionType'], 'ValueError')
            self.assertIn('query-gpu', evaluate(sample)['failed'])
        def timeout(*args, **kwargs):
            self.assertEqual(kwargs['timeout'], 5)
            self.assertIn('--id=0', args[0])
            raise subprocess.TimeoutExpired('private-not-recorded', 5)
        sample = self.fixture(gpu=timeout)
        self.assertEqual(sample['queries']['gpu']['exceptionType'], 'TimeoutExpired')
        self.assertNotIn('private-not-recorded', json.dumps(sample))
        self.assertEqual(evaluate(self.fixture(created=124))['failed'], ['parent-identity'])

    def test_query_failures_do_not_skip_other_safety_readings(self):
        def unavailable(*args):
            raise PermissionError('private-error-message')
        system=NS(Process=unavailable,virtual_memory=unavailable,
            disk_usage=lambda drive:NS(free=30*GIB))
        sample=collect(system,100,123,0,now=lambda:100,execute=lambda *a,**k:'1000, 50')
        self.assertEqual(sample['observed']['vramUsedMiB'],1000)
        self.assertEqual(sample['observed']['diskFreeHBytes'],30*GIB)
        self.assertEqual(sample['queries']['ram']['exceptionType'],'PermissionError')
        self.assertEqual(sample['queries']['parent']['exceptionType'],'PermissionError')
        self.assertNotIn('private-error-message',json.dumps(sample))
        self.assertIn('query-ram',evaluate(sample)['failed'])
        self.assertTrue(all(q['latencyMs']>=0 for q in sample['queries'].values()))

    def test_trip_is_durable_before_event_and_stages_require_real_first_step(self):
        # Runtime scratch stays within the checked-out repository on every OS.
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            path = Path(directory)
            events = []
            def emit(**event):
                if event['event']=='guard-trip':
                    self.assertTrue((path/'guard-trip.json').exists())
                events.append(event)
            diagnostics = Diagnostics(path, 0, emit, now=lambda:10)
            diagnostics.transition('encoding-prompt')
            diagnostics.transition('loading-diffusion')
            progress = SamplingProgress(diagnostics, emit)
            progress(0,40)
            self.assertEqual(diagnostics.stage, 'loading-diffusion')
            self.assertFalse(any(e['event']=='progress' for e in events))
            progress(1,40)
            progress(2,40)
            self.assertEqual(diagnostics.stage, 'sampling')
            self.assertEqual([e['step'] for e in events if e['event']=='progress'], [1,2])
            records=[json.loads(line) for line in (path/'diagnostics.jsonl').read_text().splitlines()]
            self.assertEqual([r['step'] for r in records if r['event']=='sampling-step'],[1,2])
            self.assertEqual([s['stage'] for s in diagnostics.stages], ['encoding-prompt','loading-diffusion','sampling'])
            sample = safe()
            sample['observed']['gpuTempC'] = 78
            self.assertTrue(diagnostics.observe(sample))
            self.assertEqual(json.loads((path/'guard-trip.json').read_text())['failed'], ['gpu-temperature'])
            diagnostics.observe(sample)
            self.assertEqual(sum(e['event']=='guard-trip' for e in events), 1)
            self.assertEqual(diagnostics.peaks['gpuTempC'],78)

    def test_thread_experiment_is_bounded_and_default_is_unchanged(self):
        self.assertEqual(encoder_threads({}), 4)
        self.assertEqual(encoder_threads({'VELUM_QWEN_CPU_THREADS':'6'}), 6)
        for value in ('0','8','12','six','6.0'):
            with self.assertRaises(ValueError):
                encoder_threads({'VELUM_QWEN_CPU_THREADS':value})


if __name__=='__main__':
    unittest.main()
