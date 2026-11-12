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


class SipTrunkInstallerTests(unittest.TestCase):
    def test_archived_sip_installer_rejects_the_new_recording_sources(self):
        text = (ROOT / 'activate-sip-trunks.sh').read_text()
        pins = dict(re.findall(r"^    '([a-z_]+\.py)': '([A-Za-z0-9_]+)',", text, re.M))
        self.assertEqual(set(pins), {'agent.py', 'sip_trunk_runtime.py', 'sip_trunks.py'})
        for name, pin in pins.items():
            self.assertRegex(pin, r'^[a-f0-9]{64}$', name + ': finalize release pin')
            canonical = (ROOT / name).read_bytes().replace(b'\r\n', b'\n')
            if name == 'sip_trunks.py':
                self.assertEqual(pin, hashlib.sha256(canonical).hexdigest(), name)
            else:
                self.assertNotEqual(pin, hashlib.sha256(canonical).hexdigest(), name)
        self.assertEqual(pins['agent.py'],'d4b1bcf28ffc31cc768bd0b7a72f11efad91a48036c6a2b2099636304c769a42')
        self.assertEqual(pins['sip_trunk_runtime.py'],'865f1e96b19c56c6f66d0c01c45be477c75b169957a7338da3b20c0e93015d3e')
        self.assertIn("PREVIOUS_SHA = 'd119546868b5581f24c31d2fe365f01e5547aa7b2cd1cd2fe525b504f41aa884'", text)

    def test_installer_requires_explicit_gate_and_pins_all_three_sources(self):
        text = (ROOT / 'activate-sip-trunks.sh').read_text()
        self.assertIn('--acknowledge-sip-trunk-update', text)
        self.assertIn('d119546868b5581f24c31d2fe365f01e5547aa7b2cd1cd2fe525b504f41aa884', text)
        for name in ('agent.py', 'sip_trunk_runtime.py', 'sip_trunks.py'):
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

    def exercise(self, failure='', existing_dropin=False):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            stage, target, units, sounds, backups = [base / name for name in ('stage', 'target', 'units', 'sounds', 'backups')]
            for folder in (stage, target, units, sounds, backups):
                folder.mkdir()
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
            for name in ('agent.py', 'sip_trunk_runtime.py', 'sip_trunks.py'):
                (stage / name).write_bytes(('# staged ' + name + '\n').encode())
            for name in ('union-pbx-agent.service', 'union-pbx-agent@.service'):
                (units / name).write_bytes(b'# preserve existing unit\n')
            text = (ROOT / 'activate-sip-trunks.sh').read_text()
            code = text.split("<<'PY'\n", 1)[1].rsplit('\nPY', 1)[0]
            code = code.replace('OWNER_UID = 0', 'OWNER_UID = os.getuid()')
            code = code.replace('group = grp.getgrnam("asterisk").gr_gid', 'group = os.getgid()')
            code = code.replace("Path('/opt/union-pbx-agent')", 'Path(' + repr(str(target)) + ')')
            code = code.replace("Path('/etc/systemd/system')", 'Path(' + repr(str(units)) + ')')
            code = code.replace("Path('/var/lib/asterisk/sounds/union')", 'Path(' + repr(str(sounds / 'union')) + ')')
            code = code.replace("Path('/root')", 'Path(' + repr(str(backups)) + ')')
            code = code.replace('d119546868b5581f24c31d2fe365f01e5547aa7b2cd1cd2fe525b504f41aa884', hashlib.sha256(original).hexdigest())
            pins = dict(re.findall(r"^    '([a-z_]+\.py)': '([A-Za-z0-9_]+)',", text, re.M))
            self.assertEqual(set(pins), {'agent.py', 'sip_trunk_runtime.py', 'sip_trunks.py'})
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
is-active) [ "$3" = asterisk ] || test -f "$FIXTURE/active" ;;
stop) [ "$2" = union-pbx-agent ] || exit 99; rm -f "$FIXTURE/active";
 if [ "$FAILURE" = stop ] && [ ! -e "$FIXTURE/failed" ]; then touch "$FIXTURE/failed"; exit 1; fi ;;
start) [ "$2" = union-pbx-agent ] || exit 99; touch "$FIXTURE/active" ;;
daemon-reload) if [ "$FAILURE" = daemon ] && [ ! -e "$FIXTURE/failed" ]; then touch "$FIXTURE/failed"; exit 1; fi ;;
*) exit 99 ;;
esac
''')
            systemctl.chmod(0o755)
            (base / 'active').touch()
            if failure == 'conflict':
                drop = units / 'union-pbx-agent.service.d' / '70-union-call-flow-sounds.conf'
                drop.parent.mkdir()
                drop.write_bytes(b'# somebody else owns this dropin\n')
            elif existing_dropin:
                drop = units / 'union-pbx-agent.service.d' / '70-union-call-flow-sounds.conf'
                drop.parent.mkdir()
                drop.write_text('[Service]\nReadWritePaths=' + str(sounds / 'union') + '\n')
                drop.chmod(0o600)
            env = {**os.environ, 'PATH': str(binary) + os.pathsep + os.environ['PATH'], 'FIXTURE': str(base), 'FAILURE': failure}
            result = subprocess.run([sys.executable, '-c', code, str(stage)], env=env, capture_output=True, timeout=20)
            success = failure in ('', 'lock')
            self.assertEqual(result.returncode == 0, success, result.stderr.decode())
            self.assertTrue((base / 'active').exists(), result.stderr.decode())
            self.assertFalse((base / 'locked').exists())
            for name in ('union-pbx-agent.service', 'union-pbx-agent@.service'):
                self.assertEqual((units / name).read_bytes(), b'# preserve existing unit\n')
                drop = units / (name + '.d') / '70-union-call-flow-sounds.conf'
                if success or existing_dropin and name == 'union-pbx-agent.service':
                    self.assertEqual(drop.read_text(), '[Service]\nReadWritePaths=' + str(sounds / 'union') + '\n')
                    if existing_dropin and name == 'union-pbx-agent.service':
                        self.assertEqual(drop.stat().st_mode & 0o777, 0o600)
                elif failure == 'conflict' and name == 'union-pbx-agent.service':
                    self.assertEqual(drop.read_bytes(), b'# somebody else owns this dropin\n')
                else:
                    self.assertFalse(drop.exists())
            if success:
                for name in ('agent.py', 'sip_trunk_runtime.py', 'sip_trunks.py'):
                    self.assertEqual((target / name).read_bytes(), (stage / name).read_bytes())
                self.assertEqual((sounds / 'union').stat().st_mode & 0o777, 0o750)
            else:
                for name, content in originals.items():
                    self.assertEqual((target / name).read_bytes(), content)
                self.assertFalse((target / 'sip_trunk_runtime.py').exists())
                self.assertFalse((sounds / 'union').exists())
            if failure in ('calls', 'conflict'):
                self.assertFalse((base / 'service.log').exists() and 'stop ' in (base / 'service.log').read_text())


if __name__ == '__main__':
    unittest.main()
