import base64
import ast
import hashlib
import io
import json
import inspect
from pathlib import Path
import stat
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import audit_sip_trunks as audit
import sip_trunks


class SipAuditTests(unittest.TestCase):
    def test_preview_missing_ack_or_missing_directory_never_import_runtime(self):
        with patch.object(audit, 'load_runtime') as load, patch('sys.stdout', new_callable=io.StringIO) as output, patch('sys.stderr', new_callable=io.StringIO):
            self.assertEqual(audit.main([]), 0)
            preview = json.loads(output.getvalue())
            self.assertTrue(preview['preview']); self.assertEqual(preview['calls_originated'], 0)
            self.assertEqual(preview['host'], '127.0.0.1')
            self.assertEqual(audit.main(['--apply']), 1)
            self.assertEqual(audit.main(['--apply', '--acknowledge-sip-audit']), 1)
            self.assertEqual(audit.main(['--apply', '--runtime-directory', '/opt/runtime']), 1)
            self.assertEqual(audit.main(['--apply', '--preview']), 1)
            load.assert_not_called()

    def test_cleanup_dispatch_requires_exact_explicit_flags(self):
        with patch.object(audit, 'cleanup') as cleanup, patch.object(audit, 'run') as run:
            self.assertEqual(audit.main(['--apply', '--acknowledge-sip-audit', '--runtime-directory', '/opt/reviewed', '--cleanup', 'a'*32]), 0)
            cleanup.assert_called_once_with(Path('/opt/reviewed'), 'a'*32); run.assert_not_called()

    def test_cleanup_rejects_noncanonical_ids_before_any_fs_or_import(self):
        with patch.object(audit, 'load_runtime') as load, patch.object(audit, 'private_directory') as directory:
            for value in ('../root', '/etc/asterisk', '', 'A'*32, 'a'*33):
                with self.assertRaises(audit.AuditError): audit.cleanup(Path('/opt/reviewed'), value)
            load.assert_not_called(); directory.assert_not_called()

    def test_synthetic_plan_and_loopback_snapshot_compile_with_own_whitelist(self):
        plan = audit.make_plan(); audit.validate_plan(plan)
        row = audit.trunk_row(plan); job = audit.extension_job(plan)
        self.assertEqual(len(set(plan.values())), 5)
        self.assertEqual(row['host'], '127.0.0.1'); self.assertEqual(row['port'], 59999)
        self.assertFalse(row['inbound_enabled']); self.assertEqual(job['number'], 301)
        self.assertNotEqual(audit.trunk_row(plan)['password'], row['password'])
        self.assertEqual(row['allowed_extension_ids'], [job['id']])
        result = sip_trunks.compile_trunks(plan['organization_id'], [{key: row[key] for key in sip_trunks.FIELDS}],
            {job['id']: {'organization_id': plan['organization_id'], 'endpoint': job['endpoint_name']}}, {'transport-udp-local': 'udp'})
        self.assertIn(b'sip:127.0.0.1:59999;transport=udp', result.pjsip)
        self.assertNotIn(row['password'], repr(result)); self.assertNotIn(b'union-301', result.dialplan)
        self.assertIn(job['endpoint_name'].encode(), result.dialplan)
        plan['organization_id'] = '../../escape'
        with self.assertRaises(audit.AuditError): audit.validate_plan(plan)

    def test_unknown_plan_fields_and_reused_identities_rejected(self):
        plan = audit.make_plan(); plan['path'] = '/etc/asterisk'
        with self.assertRaises(audit.AuditError): audit.validate_plan(plan)
        plan = audit.make_plan(); plan['agent_id'] = plan['organization_id']
        with self.assertRaises(audit.AuditError): audit.validate_plan(plan)

    def test_write_ahead_journal_authorizes_both_sides_before_mutation(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); target = root / 'pjsip.conf'; target.write_bytes(b'; original\n')
            state = {'main': {'pjsip.conf': {'allowed_sha': [hashlib.sha256(target.read_bytes()).hexdigest()]}}}
            worker = SimpleNamespace(write_atomic=lambda path, data, *args: path.write_bytes(data), json_bytes=lambda value: json.dumps(value).encode())
            after = audit.include_after(target.read_bytes(), '#include "synthetic.conf"')
            with patch.object(audit, 'ASTERISK_ROOT', root), patch.object(audit.os, 'open', return_value=15), patch.object(audit.os, 'fsync'), patch.object(audit.os, 'close'), patch.object(audit.os, 'O_DIRECTORY', 0, create=True):
                audit.authorize_main(worker, root, state, 'pjsip.conf', after)
                saved = json.loads((root / 'state.json').read_bytes())
                self.assertIn(hashlib.sha256(after).hexdigest(), saved['main']['pjsip.conf']['allowed_sha'])
                self.assertEqual(target.read_bytes(), b'; original\n')
                target.write_bytes(b'; unrelated operator change\n')
                with self.assertRaises(audit.AuditError): audit.authorize_main(worker, root, state, 'pjsip.conf', after)

    def test_bundle_placeholder_and_modified_sources_cannot_execute(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in audit.BUNDLE_NAMES: (root / name).write_bytes(b'# reviewed source\n')
            with patch.object(audit, 'private_directory'), patch.object(audit, 'safe_path'):
                # Windows has no POSIX permission semantics; provide protected metadata.
                real_stat = Path.stat
                def protected(path, *args, **kwargs):
                    info = real_stat(path, *args, **kwargs)
                    return SimpleNamespace(st_mode=stat.S_IFREG | 0o600, st_uid=0, st_nlink=1, st_size=info.st_size)
                with patch.object(Path, 'stat', protected):
                    with self.assertRaises(audit.AuditError): audit.bundle_sources(root)
                    digest = hashlib.sha256()
                    for name in sorted(audit.BUNDLE_NAMES): digest.update(name.encode() + b'\0' + (root / name).read_bytes() + b'\0')
                    with patch.object(audit, 'REVIEWED_BUNDLE_SHA', digest.hexdigest()):
                        self.assertEqual(set(audit.bundle_sources(root)), set(audit.BUNDLE_NAMES))
                        (root / 'agent.py').write_bytes(b'# changed\n')
                        with self.assertRaises(audit.AuditError): audit.bundle_sources(root)

    def test_unregistered_presence_is_distinct_from_registered(self):
        plan = audit.make_plan(); names = sip_trunks.trunk_names(plan['organization_id'], plan['trunk_id'])
        worker = Mock(); worker.strip_ansi.side_effect = lambda value: value
        for status in ('Unregistered', 'Rejected'):
            worker.asterisk.return_value = names['registration'] + '/sip:127.0.0.1:59999 fake ' + status
            audit.registration_unregistered(worker, sip_trunks, plan)
        for output in ('No objects found.', names['registration'] + '/sip:127.0.0.1:59999 fake Registered'):
            worker.asterisk.return_value = output
            with self.assertRaises(audit.AuditError): audit.registration_unregistered(worker, sip_trunks, plan)

    def test_restore_refuses_unjournaled_change_before_any_write_or_reload(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); state = {'plan': audit.make_plan(), 'main': {}}
            for name in audit.MAIN_NAMES:
                (root / name).write_bytes(b'; original\n')
                state['main'][name] = {'allowed_sha': [hashlib.sha256(b'; original\n').hexdigest()]}
            (root / 'queues.conf').write_bytes(b'; operator change\n')
            worker = Mock(unsafe=True); runtime = Mock()
            with patch.object(audit, 'ASTERISK_ROOT', root), patch.object(audit, 'check_owned'), patch.object(audit, 'safe_path'):
                with self.assertRaises(audit.AuditError): audit.restore_locked(worker, runtime, Mock(), root, state)
            worker.write_atomic.assert_not_called(); worker.guarded_reload.assert_not_called()
            self.assertNotIn('cleaned', state)

    def test_restore_checks_files_engine_and_production_before_marking_clean(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); plan = audit.make_plan(); state = {'plan': plan, 'main': {}, 'cleaned': False}
            for name in audit.MAIN_NAMES:
                original = b'; original\n'; (root / name).write_bytes(original)
                info = (root / name).stat()
                state['main'][name] = dict(before=base64.b64encode(original).decode(), allowed_sha=[hashlib.sha256(original).hexdigest()], mode=stat.S_IMODE(info.st_mode), uid=info.st_uid, gid=info.st_gid, atime_ns=info.st_atime_ns, mtime_ns=info.st_mtime_ns)
            worker = Mock(unsafe=True); worker.DIALPLAN_CONTEXT = 'uwi-fake'; worker.QUEUE_TEST_CONTEXT = 'uwiq-fake'
            worker.guarded_reload.return_value = 'Module reloaded successfully'
            worker.write_atomic.side_effect = lambda path, data, *args: path.write_bytes(data)
            worker.strip_ansi.side_effect = lambda value: value
            worker.asterisk.side_effect = lambda command: ('There is no existence of ' + command.split()[-1] + ' context' if command.startswith('dialplan show ') else "Global variable '" + command.split()[-2] + "' set to '0'" if command.startswith('dialplan set global ') else 'No objects found.')
            runtime = Mock(); runtime.paths.return_value = (root/'sip', root/'routes', root/'state', 'uwto-fake')
            with patch.object(audit, 'ASTERISK_ROOT', root), patch.object(audit, 'check_owned'), patch.object(audit, 'safe_path'), patch.object(audit, 'owned_paths', return_value=([], [])), patch.object(audit, 'verify_baseline') as verify, patch.object(audit, 'save'), patch.object(audit.os, 'chown', create=True):
                audit.restore_locked(worker, runtime, Mock(), root, state)
                self.assertTrue(state['cleaned']); verify.assert_called_once()
                self.assertEqual([call.args[0] for call in worker.guarded_reload.call_args_list],
                    ['module reload res_pjsip.so', 'module reload res_pjsip_outbound_registration.so', 'dialplan reload'])
                for invalid_command in ('module reload res_pjsip.so', 'module reload res_pjsip_outbound_registration.so', 'dialplan reload'):
                    state['cleaned'] = False
                    worker.guarded_reload.side_effect = lambda command: 'No such command' if command == invalid_command else 'Module reloaded successfully'
                    with self.assertRaises(audit.AuditError): audit.restore_locked(worker, runtime, Mock(), root, state)
                    self.assertFalse(state['cleaned'])
                worker.guarded_reload.side_effect = None
                state['cleaned'] = False
                verify.side_effect = audit.AuditError('baseline mismatch')
                with self.assertRaises(audit.AuditError): audit.restore_locked(worker, runtime, Mock(), root, state)
                self.assertFalse(state['cleaned'])

    def test_runtime_exception_text_is_never_echoed(self):
        with patch.object(audit, 'run', side_effect=RuntimeError('SECRET-password-123')), patch('sys.stderr', new_callable=io.StringIO) as output:
            self.assertEqual(audit.main(['--apply', '--acknowledge-sip-audit', '--runtime-directory', '/opt/reviewed']), 1)
            self.assertNotIn('SECRET', output.getvalue()); self.assertNotIn('password', output.getvalue())

    def test_diagnostics_emit_bounded_class_and_locations_without_secret_messages(self):
        def fail(*args):
            try: raise ValueError('SECRET-provider-password')
            except ValueError: raise RuntimeError('SECRET-queued-message') from None
        with patch.object(audit, 'run', side_effect=fail), patch('sys.stderr', new_callable=io.StringIO) as output:
            self.assertEqual(audit.main(['--apply', '--acknowledge-sip-audit', '--runtime-directory', '/opt/reviewed', '--diagnostics']), 1)
        text = output.getvalue(); self.assertNotIn('SECRET', text); self.assertNotIn('password', text)
        details = json.loads(text.splitlines()[-1])['diagnostics']
        self.assertEqual([item['type'] for item in details], ['RuntimeError', 'ValueError'])
        for item in details:
            self.assertLessEqual(len(item['frames']), 6)
            self.assertTrue(item['frames'])
            for frame in item['frames']:
                self.assertEqual(set(frame), {'file', 'line', 'function'})
                self.assertGreater(frame['line'], 0)
                self.assertEqual(Path(frame['file']).name, frame['file'])
        with patch.object(audit, 'load_runtime') as load, patch('sys.stdout', new_callable=io.StringIO), patch('sys.stderr', new_callable=io.StringIO) as output:
            self.assertEqual(audit.main(['--apply', '--diagnostics']), 1)
            self.assertNotIn('diagnostics', output.getvalue()); load.assert_not_called()

    def test_baseline_uses_fresh_legacy_worker_after_fake_config_removed(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            fake = SimpleNamespace(PROFILE_ID=audit.make_plan()['organization_id'], __file__=str(root/'agent.py'), AGENT_CONFIG=root/'removed-agent.json')
            self.assertFalse(fake.AGENT_CONFIG.exists())
            legacy = Mock(unsafe=True); legacy.PROFILE_ID = None
            legacy.strip_ansi.side_effect = lambda value: value
            legacy.asterisk.side_effect = lambda command: 'original route' if command.startswith('dialplan show ') else 'queue detail'
            legacy.queue_identity.return_value = 'union-queue'
            availability = Mock(); availability.paused_state.return_value = True
            job = {'organization_id': 'production-union', 'enabled': True, 'members': []}
            state = {'baseline': {'routes': {'301@union-internal': 'original route'}, 'queues': {'queue-id': job}, 'pauses': {'queue-id': {'union-301': True}}}}
            with patch.object(audit, 'load_runtime', return_value=(legacy, Mock(), sip_trunks, availability)) as load:
                audit.verify_baseline(fake, Mock(), state)
            load.assert_called_once_with(root)
            legacy.verify_queue_members.assert_called_once_with(job, 'queue detail')
            availability.paused_state.assert_called_once_with('queue detail', 'union-queue', 'union-301')
            legacy.assert_fvx.assert_called_once()
            self.assertIsNotNone(fake.PROFILE_ID)

    def test_lease_cleanup_targets_only_synthetic_uuid_and_requires_ack(self):
        plan = audit.make_plan(); name = 'UW_SIP_LEASE_' + plan['organization_id'].replace('-', '')
        worker = Mock(unsafe=True); worker.asterisk.return_value = "Global variable '" + name + "' set to '0'"
        audit.expire_own_lease(worker, plan)
        worker.assert_no_calls.assert_called_once()
        worker.asterisk.assert_called_once_with('dialplan set global ' + name + ' 0')
        worker.asterisk.return_value = 'Unknown command'
        with self.assertRaises(audit.AuditError): audit.expire_own_lease(worker, plan)

    def test_orchestration_never_nests_runtime_owned_operation_locks(self):
        tree = ast.parse(inspect.getsource(audit.run)); observed = set()
        def visit(node, depth=0):
            if isinstance(node, ast.With):
                holds_lock = any(isinstance(item.context_expr, ast.Call) and isinstance(item.context_expr.func, ast.Attribute)
                    and item.context_expr.func.attr == 'operation_lock' for item in node.items)
                for item in node.body: visit(item, depth + int(holds_lock))
                return
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name):
                owner, method = node.func.value.id, node.func.attr
                if owner == 'runtime' and method in ('init', 'apply_snapshot'):
                    self.assertEqual(depth, 0, method + ' has its own lock'); observed.add(method)
                if owner == 'worker' and method in ('init', 'configure', 'install_profile_routes', 'apply_job'):
                    self.assertGreater(depth, 0, method + ' needs caller lock'); observed.add(method)
            for child in ast.iter_child_nodes(node): visit(child, depth)
        visit(tree)
        self.assertEqual(observed, {'init', 'apply_snapshot', 'configure', 'install_profile_routes', 'apply_job'})


if __name__ == '__main__': unittest.main()
