"""Installer transaction tests: no real service, PBX, root path or remote access."""
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).parent


class RecordingInstallerTests(unittest.TestCase):
    def test_archived_recording_installer_preserves_its_reviewed_predecessor(self):
        text = (ROOT / 'activate-recordings.sh').read_text()
        pins = dict(re.findall(r"^    '([a-z_]+\.py)': '([A-Za-z0-9_]+)',", text, re.M))
        self.assertEqual(set(pins), set(('agent.py', 'sip_trunk_runtime.py', 'recordings.py', 'recording_agi.py', 'recording_runtime.py', 'recording_upload.py', 'inbound_router.py', 'outbound_router.py')))
        for name, pin in pins.items():
            self.assertRegex(pin, r'^[a-f0-9]{64}$', name + ': finalize release pin')
            canonical = (ROOT / name).read_bytes().replace(b'\r\n', b'\n')
            if name in ('agent.py','sip_trunk_runtime.py'):
                self.assertEqual(pin,{'agent.py':'356d59d1b27c77682b4ab1bd5d9fbc6f99b1ffe91253666d3b0df0bd8ae60acb','sip_trunk_runtime.py':'0f71121881cea72614a98a0fa2c473eafbc7dde22d52d35f2cf8b9220bf605c0'}[name])
                self.assertNotEqual(pin,hashlib.sha256(canonical).hexdigest(),name)
            else:
                self.assertEqual(pin, hashlib.sha256(canonical).hexdigest(), name)
        self.assertIn("PREVIOUS_SHA = 'd4b1bcf28ffc31cc768bd0b7a72f11efad91a48036c6a2b2099636304c769a42'", text)

    def test_installer_requires_explicit_gate_and_pins_all_eight_sources(self):
        text = (ROOT / 'activate-recordings.sh').read_text()
        self.assertIn('--acknowledge-recording-update', text)
        self.assertIn('d4b1bcf28ffc31cc768bd0b7a72f11efad91a48036c6a2b2099636304c769a42', text)
        for name in ('agent.py', 'sip_trunk_runtime.py', 'recordings.py', 'recording_agi.py', 'recording_runtime.py', 'recording_upload.py', 'inbound_router.py', 'outbound_router.py'):
            self.assertIn("'" + name + "':", text)
        self.assertNotIn('enable --now', text)
        self.assertNotIn("'dialplan reload'", text)

    @unittest.skipUnless(os.name == 'posix', 'Linux service installer')
    def test_success_preserves_units_and_installs_both_dropins(self):
        self.exercise()

    @unittest.skipUnless(os.name == 'posix', 'Linux service installer')
    def test_stop_failure_after_service_stops_restores_and_restarts(self):
        self.exercise('stop')

    @unittest.skipUnless(os.name == 'posix', 'Linux service installer')
    def test_partial_bundle_write_restores_existing_and_removes_new_files(self):
        self.exercise('write', existing_dropin=True)

    @unittest.skipUnless(os.name == 'posix', 'Linux service installer')
    def test_matching_existing_dropin_is_preserved_with_its_original_mode(self):
        self.exercise(existing_dropin=True)

    @unittest.skipUnless(os.name == 'posix', 'Linux service installer')
    def test_daemon_reload_failure_restores_bundle_dropins_and_directory(self):
        self.exercise('daemon')

    @unittest.skipUnless(os.name == 'posix', 'Linux service installer')
    def test_different_dropin_is_rejected_before_stopping(self):
        self.exercise('conflict')

    @unittest.skipUnless(os.name == 'posix', 'Linux service installer')
    def test_live_calls_block_before_any_changes(self):
        self.exercise('calls')

    @unittest.skipUnless(os.name == 'posix', 'Linux service installer')
    def test_operation_lock_is_held_through_install_and_service_restart(self):
        self.exercise('lock')

    @unittest.skipUnless(os.name == 'posix', 'Linux profile service installer')
    def test_restarts_only_an_existing_active_profile(self):
        self.exercise(active_profile=True)

    def exercise(self, failure='', existing_dropin=False, active_profile=False):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            stage, target, units, sounds, backups = [base / name for name in ('stage', 'target', 'units', 'sounds', 'backups')]
            for folder in (stage, target, units, sounds, backups):
                folder.mkdir()
            profile_id='11111111-1111-4111-8111-111111111111'
            tenant=base/'tenants'/profile_id
            tenant.mkdir(parents=True)
            (tenant/'agent.json').write_text('{"organization_id":"'+profile_id+'"}')
            (tenant/'agent.json').chmod(0o600)
            if active_profile:(base/'profile-active').touch()
            original = b'''from contextlib import contextmanager
import os
from pathlib import Path
def require_root(): pass
def assert_no_calls():
    if os.environ.get('FAILURE') == 'calls': raise RuntimeError('calls active')
@contextmanager
def operation_lock():
    marker = Path(os.environ['FIXTURE']) / 'locked'
    marker.touch()
    try: yield
    finally: marker.unlink()
'''
            (target / 'agent.py').write_bytes(original)
            (target / 'sip_trunks.py').write_bytes(b'# existing helper\n')
            originals = {'agent.py': original, 'sip_trunks.py': b'# existing helper\n'}
            for name in ('agent.py', 'sip_trunk_runtime.py', 'recordings.py', 'recording_agi.py', 'recording_runtime.py', 'recording_upload.py', 'inbound_router.py', 'outbound_router.py'):
                (stage / name).write_bytes(('# staged ' + name + '\n').encode())
            for name in ('union-pbx-agent.service', 'union-pbx-agent@.service'):
                (units / name).write_bytes(b'# preserve existing unit\n')
            text = (ROOT / 'activate-recordings.sh').read_text()
            code = text.split("<<'PY'\n", 1)[1].rsplit('\nPY', 1)[0]
            code = code.replace('OWNER_UID = 0', 'OWNER_UID = os.getuid()')
            code = code.replace('group = grp.getgrnam("asterisk").gr_gid', 'group = os.getgid()')
            code = code.replace("Path('/opt/union-pbx-agent')", 'Path(' + repr(str(target)) + ')')
            code = code.replace("Path('/etc/systemd/system')", 'Path(' + repr(str(units)) + ')')
            code = code.replace("Path('/var/lib/asterisk/sounds/union')", 'Path(' + repr(str(sounds / 'union')) + ')')
            code = code.replace("Path('/root')", 'Path(' + repr(str(backups)) + ')')
            code = code.replace("Path('/etc/asterisk/union-recording-policies')", 'Path(' + repr(str(base / 'policies')) + ')')
            code = code.replace("Path('/var/spool/asterisk/union-recordings')", 'Path(' + repr(str(base / 'recordings')) + ')')
            code = code.replace("Path('/etc/union-pbx-agent/tenants')", 'Path(' + repr(str(base / 'tenants')) + ')')
            code = code.replace('d4b1bcf28ffc31cc768bd0b7a72f11efad91a48036c6a2b2099636304c769a42', hashlib.sha256(original).hexdigest())
            pins = dict(re.findall(r"^    '([a-z_]+\.py)': '([A-Za-z0-9_]+)',", text, re.M))
            self.assertEqual(set(pins), set(('agent.py', 'sip_trunk_runtime.py', 'recordings.py', 'recording_agi.py', 'recording_runtime.py', 'recording_upload.py', 'inbound_router.py', 'outbound_router.py')))
            for name, current_pin in pins.items():
                code = code.replace("'" + current_pin + "'", "'" + hashlib.sha256((stage / name).read_bytes()).hexdigest() + "'")
            # Inject a one-time filesystem failure at the actual atomic replace boundary.
            code = code.replace('os.replace(temporary, path)', '''
        if os.environ.get('FAILURE') == 'write' and path.name == 'sip_trunk_runtime.py' and not (BACKUP_ROOT / 'write-failed').exists():
            (BACKUP_ROOT / 'write-failed').touch()
            raise OSError('injected partial install')
        os.replace(temporary, path)''')
            binary = base / 'bin'
            binary.mkdir()
            systemctl = binary / 'systemctl'
            systemctl.write_text('''#!/bin/sh
test -f "$FIXTURE/locked" || exit 88
printf '%s\n' "$*" >> "$FIXTURE/service.log"
case "$1" in
is-active) case "$3" in
 asterisk) exit 0;;
 union-pbx-agent) test -f "$FIXTURE/active";;
 union-pbx-agent@11111111-1111-4111-8111-111111111111.service) test -f "$FIXTURE/profile-active";;
 *) exit 99;; esac ;;
stop) case "$2" in
 union-pbx-agent) rm -f "$FIXTURE/active";;
 union-pbx-agent@11111111-1111-4111-8111-111111111111.service) rm -f "$FIXTURE/profile-active";;
 *) exit 99;; esac
 if [ "$FAILURE" = stop ] && [ ! -e "$FIXTURE/failed" ]; then touch "$FIXTURE/failed"; exit 1; fi ;;
start) case "$2" in
 union-pbx-agent) touch "$FIXTURE/active";;
 union-pbx-agent@11111111-1111-4111-8111-111111111111.service) touch "$FIXTURE/profile-active";;
 *) exit 99;; esac ;;
daemon-reload) if [ "$FAILURE" = daemon ] && [ ! -e "$FIXTURE/failed" ]; then touch "$FIXTURE/failed"; exit 1; fi ;;
*) exit 99 ;;
esac
''')
            systemctl.chmod(0o755)
            (base / 'active').touch()
            if failure == 'conflict':
                drop = units / 'union-pbx-agent.service.d' / '80-union-recordings.conf'
                drop.parent.mkdir()
                drop.write_bytes(b'# somebody else owns this dropin\n')
            elif existing_dropin:
                drop = units / 'union-pbx-agent.service.d' / '80-union-recordings.conf'
                drop.parent.mkdir()
                drop.write_text('[Service]\nReadWritePaths=' + str(base / 'policies') + ' ' + str(base / 'recordings') + '\n')
                drop.chmod(0o600)
            env = {**os.environ, 'PATH': str(binary) + os.pathsep + os.environ['PATH'], 'FIXTURE': str(base), 'FAILURE': failure}
            result = subprocess.run([sys.executable, '-c', code, str(stage)], env=env, capture_output=True, timeout=20)
            success = failure in ('', 'lock')
            self.assertEqual(result.returncode == 0, success, result.stderr.decode())
            self.assertTrue((base / 'active').exists(), result.stderr.decode())
            self.assertEqual((base/'profile-active').exists(),active_profile)
            self.assertFalse((base / 'locked').exists())
            for name in ('union-pbx-agent.service', 'union-pbx-agent@.service'):
                self.assertEqual((units / name).read_bytes(), b'# preserve existing unit\n')
                drop = units / (name + '.d') / '80-union-recordings.conf'
                if success or existing_dropin and name == 'union-pbx-agent.service':
                    self.assertEqual(drop.read_text(), '[Service]\nReadWritePaths=' + str(base / 'policies') + ' ' + str(base / 'recordings') + '\n')
                    if existing_dropin and name == 'union-pbx-agent.service':
                        self.assertEqual(drop.stat().st_mode & 0o777, 0o600)
                elif failure == 'conflict' and name == 'union-pbx-agent.service':
                    self.assertEqual(drop.read_bytes(), b'# somebody else owns this dropin\n')
                else:
                    self.assertFalse(drop.exists())
            if success:
                for name in ('agent.py', 'sip_trunk_runtime.py', 'recordings.py', 'recording_agi.py', 'recording_runtime.py', 'recording_upload.py', 'inbound_router.py', 'outbound_router.py'):
                    self.assertEqual((target / name).read_bytes(), (stage / name).read_bytes())
                self.assertEqual((sounds / 'union').stat().st_mode & 0o777, 0o750)
                self.assertEqual((target / 'sip_trunks.py').read_bytes(), b'# existing helper\n')
                self.assertEqual((base/'policies').stat().st_mode&0o777,0o750)
                self.assertEqual((base/'recordings').stat().st_mode&0o777,0o750)
            else:
                for name, content in originals.items():
                    self.assertEqual((target / name).read_bytes(), content)
                self.assertFalse((target / 'sip_trunk_runtime.py').exists())
                self.assertFalse((sounds / 'union').exists())
                self.assertFalse((base/'policies').exists())
                self.assertFalse((base/'recordings').exists())
            if failure in ('calls', 'conflict'):
                self.assertFalse((base / 'service.log').exists() and 'stop ' in (base / 'service.log').read_text())


if __name__ == '__main__':
    unittest.main()
