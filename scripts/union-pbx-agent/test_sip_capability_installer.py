from contextlib import nullcontext
import hashlib
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).with_name('activate-sip-capability.sh')


class InstallerTests(unittest.TestCase):
    def setUp(self):
        text = SCRIPT.read_text()
        code = text.split("<<'PY'\n", 1)[1].rsplit('\nPY', 1)[0]
        self.ns = {'__name__': 'fixture'}
        with patch('sys.argv', ['fixture', '/fixture', '11111111-1111-4111-8111-111111111111']): exec(compile(code, str(SCRIPT), 'exec'), self.ns)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.path = root/'sip_trunk_runtime.py'
        self.path.write_bytes(b'old')
        self.path.chmod(0o640)
        self.ns.update(BACKUP_ROOT=root, OLD_SHA=hashlib.sha256(b'old').hexdigest(), checked=lambda path, private=False: path.stat())
        self.events = []
        self.failure = None
        self.busy = False
        def service(*args):
            self.events.append(args)
            if self.failure == args[0]:
                self.failure = None
                raise RuntimeError('fixture service failure')
        def calls():
            if self.busy: raise RuntimeError('busy')
        self.ns['service'] = service
        self.agent = SimpleNamespace(operation_lock=nullcontext, assert_no_calls=calls)
        self.addCleanup(patch.stopall)
        patch('os.fchown', create=True).start()
        if self.ns['os'].name != 'posix': patch('os.fchmod', create=True).start()
        # Windows cannot open directories for fsync; production uses native fsync.
        if self.ns['os'].name != 'posix':
            def atomic(path, raw, info):
                temporary = path.with_suffix('.tmp')
                temporary.write_bytes(raw)
                temporary.replace(path)
            self.ns['atomic'] = atomic

    def run_update(self): self.ns['activate'](self.agent, '11111111-1111-4111-8111-111111111111', self.path, b'new')

    def test_success_replaces_only_runtime_and_selected_unit(self):
        self.run_update()
        self.assertEqual(self.path.read_bytes(), b'new')
        mutations = [event for event in self.events if event[0] in ('start', 'stop')]
        self.assertEqual([event[0] for event in mutations], ['stop', 'start'])
        self.assertTrue(all(event[1].startswith('union-pbx-agent@11111111-') for event in mutations))
        backups = list(self.path.parent.glob('union-sip-capability-*'))
        self.assertEqual((backups[0]/'runtime').read_bytes(), b'old')

    def test_stop_and_start_failure_restore(self):
        for failure in ('stop', 'start'):
            with self.subTest(failure=failure):
                self.path.write_bytes(b'old')
                self.failure = failure
                with self.assertRaises(RuntimeError): self.run_update()
                self.assertEqual(self.path.read_bytes(), b'old')
                self.assertEqual([e[0] for e in self.events[-2:]], ['start','is-active'])

    def test_calls_and_inactive_unit_do_not_stop_or_write(self):
        self.busy = True
        with self.assertRaises(RuntimeError): self.run_update()
        self.assertFalse(any(event[0] == 'stop' for event in self.events))
        self.assertEqual(self.path.read_bytes(), b'old')
        self.busy = False
        self.failure = 'is-active'
        with self.assertRaises(RuntimeError): self.run_update()
        self.assertFalse(any(event[0] == 'stop' for event in self.events))

    def test_failed_health_check_stops_started_worker_before_disk_rollback(self):
        original=self.ns['service'];failed=False
        def service(*args):
            nonlocal failed
            original(*args)
            if args[0]=='is-active' and any(event[0]=='start' for event in self.events) and not failed:
                failed=True
                raise RuntimeError('health failed after starting worker')
        self.ns['service']=service
        with self.assertRaises(RuntimeError):self.run_update()
        self.assertEqual([e[0] for e in self.events if e[0] in ('start','stop')],['stop','start','stop','start'])
        self.assertEqual(self.path.read_bytes(),b'old')

    def test_calls_after_stop_restart_without_write(self):
        count = [0]
        def calls():
            count[0] += 1
            if count[0] == 2: raise RuntimeError('busy')
        self.agent.assert_no_calls = calls
        with self.assertRaises(RuntimeError): self.run_update()
        self.assertEqual(self.path.read_bytes(), b'old')
        self.assertEqual([e[0] for e in self.events[-2:]], ['start','is-active'])

    def test_static_gates_no_reload_and_pins(self):
        text = SCRIPT.read_text()
        self.assertIn('--acknowledge-sip-capability-update', text)
        self.assertIn("'--profile'", text)
        self.assertIn("OLD_SHA = '0f71121881cea72614a98a0fa2c473eafbc7dde22d52d35f2cf8b9220bf605c0'", text)
        self.assertNotIn('pjsip reload', text)
        self.assertNotIn('service(\'restart\', \'asterisk', text)
        self.assertIn('digest(installed_agent.read_bytes()) != AGENT_SHA', text)
        self.assertIn('digest(new) != RUNTIME_SHA', text)

    def test_finalized_pins_match_canonical_lf_sources(self):
        if self.ns['RUNTIME_SHA'].startswith('FINALIZE_') or self.ns['AGENT_SHA'].startswith('FINALIZE_'):
            self.skipTest('Parent must finalize reviewed source pins before delivery')
        for name, key in (('agent.py', 'AGENT_SHA'), ('sip_trunk_runtime.py', 'RUNTIME_SHA')):
            raw = SCRIPT.with_name(name).read_bytes().replace(b'\r\n', b'\n')
            self.assertEqual(self.ns[key],{'AGENT_SHA':'0c51c5d15d20ae3977f2e00d75763c30a87de9a766d2792af7c7407515bc5a26','RUNTIME_SHA':'f23513b6b46fccad256882c474eda29cc5cc09ad05d60f3036775f1bb80aab6c'}[key]); self.assertNotEqual(hashlib.sha256(raw).hexdigest(), self.ns[key])


if __name__ == '__main__': unittest.main()
