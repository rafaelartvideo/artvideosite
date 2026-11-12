import tempfile
from pathlib import Path
from types import SimpleNamespace
import unittest
import os
import json
from unittest.mock import Mock

import recording_runtime as runtime


class RecordingRuntimeTests(unittest.TestCase):
    def test_unprepared_runtime_never_advertises_or_modifies_routes(self):
        with tempfile.TemporaryDirectory() as folder:
            agent = SimpleNamespace(STATE_DIR=Path(folder))
            self.assertEqual(runtime.capability(agent, '00000000-0000-4000-8000-000000000001'), [])
            self.assertEqual(runtime.decorate(agent, b'original', 'internal'), b'original')
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_active_call_blocks_transaction_before_any_write(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'routing.conf'
            path.write_bytes(b'original')
            def busy():
                raise RuntimeError('active call')
            agent = SimpleNamespace(assert_no_calls=busy)
            with self.assertRaises(RuntimeError):
                runtime.transaction(agent, {path: (b'changed', 0o640, 0, 0)}, lambda: None)
            self.assertEqual(path.read_bytes(), b'original')

    @unittest.skipUnless(os.name == 'posix', 'POSIX metadata and ownership')
    def test_failed_verification_restores_bytes_mode_and_new_file(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            path, new = root/'existing.conf', root/'new.conf'
            path.write_bytes(b'original')
            path.chmod(0o600)
            def atomic(target, raw, mode=0o600, gid=None):
                target.write_bytes(raw)
                target.chmod(mode)
            agent = SimpleNamespace(assert_no_calls=Mock(), BACKUP_DIR=root/'backup',
                                    write_atomic=atomic, json_bytes=lambda value:json.dumps(value).encode(),
                                    asterisk=Mock(return_value='Registered'), guarded_reload=Mock(return_value='Reloaded'),
                                    assert_fvx=Mock())
            def failed():
                raise RuntimeError('verification failed')
            with self.assertRaises(RuntimeError):
                runtime.transaction(agent, {path:(b'changed',0o640,os.getuid(),os.getgid()),
                                            new:(b'new',0o640,os.getuid(),os.getgid())}, failed)
            self.assertEqual(path.read_bytes(),b'original')
            self.assertEqual(path.stat().st_mode&0o777,0o600)
            self.assertFalse(new.exists())
            self.assertTrue(any((root/'backup').glob('recordings-*/manifest.json')))


if __name__ == '__main__':
    unittest.main()
