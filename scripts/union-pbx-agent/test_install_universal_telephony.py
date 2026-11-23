"""Local fixtures only: no real root paths, systemd, Asterisk or network."""
from contextlib import nullcontext
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).parent
SPEC = importlib.util.spec_from_file_location('universal_installer', SOURCE / 'install-universal-telephony.py')
installer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(installer)


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.stage = self.root / 'stage'
        self.stage.mkdir()
        self.subject = installer.Installer(self.stage, self.root)
        for folder in (self.subject.target, self.subject.units, self.subject.config,
                       self.subject.state, self.subject.backups.parent):
            folder.mkdir(parents=True, exist_ok=True)
        self.pins = {}
        for name in installer.INSTALL + installer.PRESERVE:
            raw = (SOURCE / 'universal_capacity.py').read_bytes() if name == 'universal_capacity.py' else b'REVIEWED = True\n'
            (self.stage / name).write_bytes(raw)
            self.pins[name] = hashlib.sha256(raw).hexdigest()
            if name in installer.PRESERVE:
                (self.subject.target / name).write_bytes(raw)
        self.old_agent = b'PREVIOUS = True\n'
        (self.subject.target / 'agent.py').write_bytes(self.old_agent)
        (self.subject.units / 'union-pbx-agent.service').write_bytes(b'[Service]\n')
        self.tenant = 'union-pbx-agent@aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.service'
        (self.subject.units / 'union-pbx-agent@.service').write_bytes(b'[Service]\n')
        self.commands = []
        self.fail = None
        self.failed = False
        self.idle_checks = 0
        self.locked = False
        self.worker = SimpleNamespace(operation_lock=self.operation_lock, assert_no_calls=self.idle)
        # Emulate Linux ownership/mode on every host. The actual path/type and
        # symlink checks still execute against the fixture filesystem.
        original_stat = Path.stat
        def fake_stat(path, *args, **kwargs):
            value = original_stat(path, *args, **kwargs)
            return SimpleNamespace(st_mode=stat.S_IFMT(value.st_mode) | (0o700 if stat.S_ISDIR(value.st_mode) else 0o600),
                                   st_uid=0, st_gid=0, st_size=value.st_size)
        self.addCleanup(patch.stopall)
        patch.object(Path, 'stat', fake_stat).start()
        patch.object(installer.os, 'geteuid', return_value=0, create=True).start()
        patch.object(installer.os, 'chown', create=True).start()
        patch.object(installer.os, 'chmod').start()
        patch.object(installer, 'PINS', self.pins).start()
        patch.object(installer, 'PREVIOUS_SHA', hashlib.sha256(self.old_agent).hexdigest()).start()
        patch.object(installer, 'service', self.service).start()
        patch.object(installer, 'atomic', self.atomic).start()
        patch.object(installer.Installer, 'load_previous', return_value=self.worker).start()
        # grp is a Linux-only module; importing it remains inside apply().
        patch.dict('sys.modules', {'grp': SimpleNamespace(getgrnam=lambda name: SimpleNamespace(gr_gid=123))}).start()

    def operation_lock(self):
        from contextlib import contextmanager
        @contextmanager
        def held():
            self.locked = True
            try:
                yield
            finally:
                self.locked = False
        return held()

    def trigger(self, stage):
        if self.fail == stage and not self.failed:
            self.failed = True
            raise RuntimeError('injected ' + stage)

    def idle(self):
        self.idle_checks += 1
        self.assertTrue(self.locked)
        self.trigger('calls' if self.idle_checks == 1 else 'calls_after_stop' if self.idle_checks == 3 else '')

    def service(self, *args, check=True):
        self.commands.append(args)
        if args[0] == 'list-units':
            return SimpleNamespace(returncode=0, stdout='union-pbx-agent.service loaded active running Agent\n' + self.tenant + ' loaded active running Tenant\n')
        if args[:3] == ('is-active', '--quiet', installer.OBSERVER) and not check:
            return SimpleNamespace(returncode=3, stdout='')
        if args[:3] == ('is-active', '--quiet', installer.OBSERVER) and check:
            self.trigger('observer_verify')
        if args[0] in ('stop', 'start', 'daemon-reload'):
            self.assertTrue(self.locked)
            if args[0] == 'stop' and args[1] != installer.OBSERVER:
                self.trigger('stop')
            if args[0] == 'start':
                self.trigger('observer' if args[1] == installer.OBSERVER else 'start')
            if args[0] == 'daemon-reload':
                self.trigger('daemon')
        return SimpleNamespace(returncode=0, stdout='')

    def atomic(self, path, raw, mode, uid=0, gid=0):
        if path.parent == self.subject.target:
            self.trigger('write')
        path.write_bytes(raw)

    def assert_restored(self):
        self.assertEqual((self.subject.target / 'agent.py').read_bytes(), self.old_agent)
        for name in installer.INSTALL:
            if name != 'agent.py':
                self.assertFalse((self.subject.target / name).exists(), name)
        self.assertFalse(self.subject.engine.exists())
        self.assertFalse(self.subject.policies.exists())
        self.assertFalse((self.subject.units / installer.OBSERVER).exists())
        for unit in ('union-pbx-agent.service', self.tenant):
            self.assertFalse((self.subject.units / (unit + '.d')).exists())

    def test_release_pins_are_explicit_and_fail_closed_until_finalized(self):
        with patch.object(installer, 'PINS', {name: 'RELEASE_PIN_REQUIRED' for name in self.pins}):
            with self.assertRaisesRegex(RuntimeError, 'RELEASE_PIN_REQUIRED'):
                self.subject.preflight()
        self.assertEqual(self.commands, [])

    def test_requires_root_and_explicit_acknowledgement(self):
        with self.assertRaisesRegex(RuntimeError, 'acknowledge'):
            self.subject.apply()
        with patch.object(installer.os, 'geteuid', return_value=12):
            with self.assertRaisesRegex(RuntimeError, 'Root'):
                self.subject.preflight()

    def test_inspect_is_read_only_and_pins_every_preserved_helper(self):
        result = self.subject.inspect()
        self.assertEqual(result['services'], ['union-pbx-agent.service', self.tenant])
        self.assertTrue(result['idle_verified'])
        self.assertFalse(self.subject.backups.exists())
        self.assertEqual((self.subject.target / 'agent.py').read_bytes(), self.old_agent)
        for name in installer.PRESERVE:
            path = self.subject.target / name
            original = path.read_bytes()
            path.write_bytes(b'UNREVIEWED = True\n')
            with self.assertRaisesRegex(RuntimeError, 'Preserved helper differs'):
                self.subject.preflight()
            path.write_bytes(original)

    def test_staged_pin_and_predecessor_mismatch_block_before_stop(self):
        path = self.stage / 'agent.py'
        path.write_bytes(b'unreviewed = True\n')
        with self.assertRaisesRegex(RuntimeError, 'Staged pin'):
            self.subject.apply(True)
        path.write_bytes(b'REVIEWED = True\n')
        (self.subject.target / 'agent.py').write_bytes(b'different = True\n')
        with self.assertRaisesRegex(RuntimeError, 'predecessor'):
            self.subject.apply(True)
        self.assertFalse(any(args[0] == 'stop' for args in self.commands))

    def test_symlink_anywhere_in_target_path_blocks(self):
        with patch.object(Path, 'is_symlink', lambda path: path == self.subject.target):
            with self.assertRaisesRegex(RuntimeError, 'Symlink'):
                self.subject.apply(True)

    def test_existing_universal_state_is_not_modified(self):
        state = self.subject.state / 'universal-telephony.json'
        state.write_bytes(b'{"routing_enabled":true}')
        with self.assertRaisesRegex(RuntimeError, 'runtime state'):
            self.subject.apply(True)
        self.assertEqual(state.read_bytes(), b'{"routing_enabled":true}')

    def test_success_records_backups_installs_ledger_and_only_restarts_active_agents(self):
        result = self.subject.apply(True)
        self.assertFalse(result['asterisk_reloaded'])
        self.assertFalse(result['routing_activated'])
        self.assertEqual(self.subject.ledger.read_bytes()[:16], b'SQLite format 3\x00')
        manifest = json.loads((Path(result['backup']) / 'manifest.json').read_text())
        entry = manifest['paths'][str(self.subject.target / 'agent.py')]
        self.assertEqual((Path(result['backup']) / entry['file']).read_bytes(), self.old_agent)
        self.assertIn('uid', entry)
        self.assertIn('gid', entry)
        self.assertIn('mode', entry)
        self.assertEqual([a[1] for a in self.commands if a[0] == 'start'], [installer.OBSERVER, 'union-pbx-agent.service', self.tenant])
        self.assertFalse(any('restart' in a or 'reload' in a or 'enable' in a for a in self.commands))

    def test_live_calls_block_before_backup_and_services(self):
        self.fail = 'calls'
        with self.assertRaisesRegex(RuntimeError, 'calls'):
            self.subject.apply(True)
        self.assertFalse(self.subject.backups.exists())
        self.assertFalse(any(args[0] == 'stop' for args in self.commands))

    def test_transaction_rolls_back_every_failure_stage(self):
        # Separate fixtures ensure rollback does not accidentally rely on a prior run.
        for stage in ('stop', 'calls_after_stop', 'write', 'daemon', 'observer', 'observer_verify', 'start'):
            with self.subTest(stage=stage):
                self.fail = stage
                self.failed = False
                self.idle_checks = 0
                self.commands = []
                with self.assertRaisesRegex(RuntimeError, 'injected ' + stage):
                    self.subject.apply(True)
                self.assertTrue(self.failed)
                self.assert_restored()
                self.assertIn(('start', 'union-pbx-agent.service'), self.commands)
                self.assertIn(('start', self.tenant), self.commands)

    def test_permission_failure_restores_code_units_and_directory_metadata(self):
        self.fail = 'permissions'
        def chmod(path, mode):
            if path == self.subject.engine:
                self.trigger('permissions')
        with patch.object(installer.os, 'chmod', side_effect=chmod):
            with self.assertRaisesRegex(RuntimeError, 'permissions'):
                self.subject.apply(True)
        self.assert_restored()

    def test_ledger_failure_rolls_back_installed_code(self):
        self.fail = 'ledger'
        def ledger_failure(path):
            path.write_bytes(b'partial database')
            self.trigger('ledger')
        with patch.object(installer, 'load_module', return_value=SimpleNamespace(Ledger=ledger_failure)):
            with self.assertRaisesRegex(RuntimeError, 'ledger'):
                self.subject.apply(True)
        self.assert_restored()

    def test_observer_unit_has_no_network_listener_or_asterisk_reload(self):
        text = self.subject.observer_unit().decode()
        for expected in ('User=root', 'ProtectSystem=strict', 'UMask=0007',
                         'RestrictAddressFamilies=AF_UNIX', 'NoNewPrivileges=true'):
            self.assertIn(expected, text)
        self.assertNotIn('ExecReload', text)
        self.assertNotIn('Listen', text)


if __name__ == '__main__':
    unittest.main()
