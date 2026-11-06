"""Offline safety contracts; no production credentials or network."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('backup.py')

class SafetyTests(unittest.TestCase):
    # Removing the dry-run guard would create files or execute a network tool.
    def test_dry_run_is_offline_and_creates_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = {'PATH': os.environ['PATH'], 'BACKUP_ROOT': tmp + '/absent'}
            result = subprocess.run([sys.executable, str(SCRIPT), '--dry-run'], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('NOT ACTIVE', result.stdout)
            self.assertFalse(Path(tmp, 'absent').exists())

    # Removing required-config validation could start a dump to an accidental destination.
    def test_execute_missing_configuration_fails_without_leaking_values(self):
        env = {'PATH': os.environ['PATH'], 'PGPASSWORD': 'never-print-this'}
        result = subprocess.run([sys.executable, str(SCRIPT), '--execute'], env=env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('BACKUP_ROOT', result.stderr)
        self.assertNotIn('never-print-this', result.stderr + result.stdout)

class ArchiveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('backup', SCRIPT)
        cls.backup = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.backup)

    # A duplicate/path traversal object must fail instead of silently overwriting recovery data.
    def test_invalid_storage_listing_fails_closed(self):
        self.assertTrue(callable(getattr(self.backup, 'normalize_listing', None)), 'storage validation missing')
        for path in ('../escape', '/absolute', 'bucket/../escape'):
            with self.assertRaises(ValueError):
                self.backup.normalize_listing([{'Path': path, 'Size': 3, 'ModTime': '2026-10-30', 'Hashes': {}}])
        item = {'Path': 'bucket/file', 'Size': 3, 'ModTime': '2026-10-30', 'Hashes': {}}
        with self.assertRaises(ValueError):
            self.backup.normalize_listing([item, item])

    # Reusing objects without a reliable source hash could silently miss a same-sized rewrite.
    def test_incremental_reuse_requires_content_hash(self):
        self.assertTrue(callable(getattr(self.backup, 'cache_key', None)), 'incremental cache missing')
        item = {'Path': 'bucket/file', 'Size': 3, 'ModTime': '2026-10-30', 'Hashes': {}}
        self.assertIsNone(self.backup.cache_key(item))
        item['Hashes'] = {'MD5': '900150983cd24fb0d6963f7d28e17f72'}
        first = self.backup.cache_key(item)
        item['Hashes'] = {'MD5': '4ed9407630eb1000c0f6b63842defa7d'}
        self.assertNotEqual(first, self.backup.cache_key(item))

    # A failing producer must not become a ready encrypted file. This isolates process handling;
    # the synthetic encryptor copies bytes and does not claim to test GPG cryptography.
    def test_pipeline_rejects_partial_producer_output(self):
        from unittest.mock import patch
        real_popen = subprocess.Popen
        def boundary(command, **kwargs):
            if command[0] == 'gpg':
                command = [sys.executable, '-c', 'import sys;sys.stdout.buffer.write(sys.stdin.buffer.read())']
            return real_popen(command, **kwargs)
        with tempfile.TemporaryDirectory() as tmp, patch.object(self.backup.subprocess, 'Popen', side_effect=boundary):
            broken = Path(tmp, 'broken.gpg')
            with self.assertRaises(RuntimeError):
                self.backup.encrypted_stream([sys.executable, '-c', 'import sys;sys.stdout.write("partial");sys.exit(2)'], broken, 'test')
            self.assertFalse(broken.exists())
            self.assertFalse(broken.with_suffix('.gpg.partial').exists())

    # Missing role capture prevents restoring grants/ownership; losing old object blobs
    # prevents restoring a historical manifest. External binaries alone are simulated.
    def test_complete_capture_reuses_objects_and_rejects_tampering(self):
        import hashlib
        import json
        from unittest.mock import patch
        item = {'Path': 'bucket/photo', 'Size': 3, 'ModTime': '2026-10-30', 'Hashes': {'MD5': '900150983cd24fb0d6963f7d28e17f72'}, 'IsDir': False}
        real_popen = subprocess.Popen
        def boundary(command, **kwargs):
            if command[0] == 'gpg':
                command = [sys.executable, '-c', 'import sys;sys.stdout.buffer.write(sys.stdin.buffer.read())']
            elif command[0] in ('pg_dump', 'pg_dumpall', 'rclone'):
                command = [sys.executable, '-c', 'import sys;sys.stdout.buffer.write(b"abc")']
            return real_popen(command, **kwargs)
        with tempfile.TemporaryDirectory() as tmp:
            env = {'BACKUP_ROOT': tmp, 'BACKUP_RECIPIENT': 'A' * 40, 'BACKUP_STORAGE_SOURCE': 'source:'}
            with patch.dict(os.environ, env), patch.object(self.backup.subprocess, 'Popen', side_effect=boundary), patch.object(self.backup, 'storage_listing', return_value=self.backup.normalize_listing([item])):
                self.backup.run_backup()
                first = next(Path(tmp, 'runs').iterdir())
                ready = json.loads((first / 'READY.json').read_text())
                self.assertIn('roles.sql.gpg', ready)
                self.assertEqual(ready['downloaded'], 1)
                self.backup.run_backup()
                markers = [json.loads(p.read_text()) for p in Path(tmp, 'runs').glob('*/READY.json')]
                self.assertEqual(sorted(p['downloaded'] for p in markers), [0, 1])
                blob = next(Path(tmp, 'objects').rglob('*.gpg'))
                blob.write_bytes(b'corrupt')
                with self.assertRaises(RuntimeError):
                    self.backup.run_backup()
                self.assertEqual(len(list(Path(tmp, 'runs').glob('*/READY.json'))), 2)
                self.assertTrue((first / 'manifest.json.gpg').exists())

    def test_verify_rejects_corrupt_ciphertext(self):
        import json
        import hashlib
        from unittest.mock import patch
        verifier_path = SCRIPT.with_name('verify.py')
        self.assertTrue(verifier_path.is_file(), 'recovery verifier missing')
        spec = importlib.util.spec_from_file_location('backup_verify', verifier_path)
        verifier = importlib.util.module_from_spec(spec)
        # Make the adjacent module importable during file-based test discovery.
        sys.path.insert(0, str(SCRIPT.parent))
        spec.loader.exec_module(verifier)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); run = root / 'runs' / 'test'; run.mkdir(parents=True)
            marker = {'format': 1}
            for name in ('database.dump.gpg', 'roles.sql.gpg', 'manifest.json.gpg'):
                (run / name).write_bytes(b'abc')
                marker[name] = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
            (run / 'READY.json').write_text(json.dumps(marker))
            manifest = {'format': 1, 'recipient': 'A' * 40, 'storage': []}
            with patch.object(verifier.subprocess, 'check_output', return_value=json.dumps(manifest).encode()):
                self.assertEqual(verifier.verify(root, 'test', False), 0)
                (run / 'database.dump.gpg').write_bytes(b'corrupt')
                with self.assertRaises(ValueError):
                    verifier.verify(root, 'test', False)

    # Producer failure must not publish a truncated encrypted artifact as successful.
    def test_real_encryption_roundtrip_and_producer_failure(self):
        self.assertTrue(callable(getattr(self.backup, 'encrypted_stream', None)), 'encrypted pipeline missing')
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp, 'gpg'); home.mkdir(mode=0o700)
            env = dict(os.environ, GNUPGHOME=str(home))
            generated = subprocess.run(['gpg', '--batch', '--pinentry-mode', 'loopback', '--passphrase', '', '--quick-generate-key', 'Offline Backup Test', 'rsa2048', 'encr', '1d'], env=env, capture_output=True)
            if generated.returncode:
                self.skipTest('GPG test key generation unavailable (gpg-agent socket restricted); real encryption drill still required')
            keys = subprocess.check_output(['gpg', '--with-colons', '--list-keys'], env=env, text=True, stderr=subprocess.DEVNULL)
            fingerprint = next(line.split(':')[9] for line in keys.splitlines() if line.startswith('fpr:'))
            from unittest.mock import patch
            with patch.dict(os.environ, env):
                output = Path(tmp, 'sample.gpg')
                result = self.backup.encrypted_stream([sys.executable, '-c', "import sys;sys.stdout.buffer.write(b'abc')"], output, fingerprint)
                self.assertEqual(result['size'], 3)
                self.assertEqual(result['sha256'], 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
                self.assertEqual(subprocess.check_output(['gpg', '--batch', '--decrypt', str(output)], env=env, stderr=subprocess.DEVNULL), b'abc')
                broken = Path(tmp, 'broken.gpg')
                with self.assertRaises(RuntimeError):
                    self.backup.encrypted_stream([sys.executable, '-c', 'import sys;sys.stdout.write("partial");sys.exit(2)'], broken, fingerprint)
                self.assertFalse(broken.exists())

if __name__ == '__main__':
    unittest.main()
