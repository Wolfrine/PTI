import os
from pathlib import Path
import tempfile
import unittest
from local_run import GIB, gpu_mutex, violation


class RuntimeTests(unittest.TestCase):
    def sample(self, **changes):
        return dict({'ram_available': 8*GIB, 'vram_mib': 6000, 'temp_c': 60,
                     'H_free': 30*GIB, 'F_free': 20*GIB}, **changes)

    def test_existing_guard_thresholds_preserved(self):
        self.assertIsNone(violation(self.sample()))
        for changes, expected in [({'ram_available': 5*GIB-1}, 'ram'),
                                  ({'vram_mib': 7501}, 'vram'), ({'temp_c': 78}, 'temperature'),
                                  ({'H_free': 20*GIB-1}, 'disk_H'), ({'F_free': 10*GIB-1}, 'disk_F')]:
            self.assertEqual(violation(self.sample(**changes)), expected)
        self.assertEqual(violation(self.sample(ram_available=6*GIB-1), start=True), 'ram')
        self.assertIsNone(violation(self.sample(ram_available=6*GIB-1)))

    @unittest.skipUnless(os.name == 'nt', 'Windows byte-range lock; verified locally on Windows')
    def test_mutex_conflict_and_exception_release(self):
        scratch = Path('F:/Workspace/Codex/Tests/velum-preservation')
        scratch.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch) as directory:
            path = Path(directory)/'fixture.lock'
            with self.assertRaisesRegex(RuntimeError, 'fixture'):
                with gpu_mutex(path):
                    with self.assertRaises(OSError):
                        with gpu_mutex(path): self.fail('second lock acquired')
                    raise RuntimeError('fixture')
            with gpu_mutex(path): pass
            self.assertTrue(path.exists())


if __name__ == '__main__': unittest.main()
