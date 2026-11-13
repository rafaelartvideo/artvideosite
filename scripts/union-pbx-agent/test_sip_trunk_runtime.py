import copy
import json
import re
import tempfile
import unittest
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace
import sys
from unittest.mock import Mock, patch

import sip_trunk_runtime as rt
from test_sip_trunks import ORG, OTHER, TRUNK, EXT
REAL_SAFE_FILE=rt.safe_file


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        # Root ownership is a Linux deployment boundary; transaction tests run
        # unprivileged on CI and explicitly simulate that preflight separately.
        safe_patch=patch.object(rt,'safe_file',side_effect=lambda path,private=False,engine_group=None: None if path.is_file() and not path.is_symlink() else rt.fail())
        safe_patch.start();self.addCleanup(safe_patch.stop)
        root = Path(self.tmp.name)
        self.agent = SimpleNamespace(PROFILE_ID=ORG, STATE_DIR=root/'state', SIP_DIR=root/'pjsip.d',
            PJSIP_FILE=root/'pjsip.conf', DIALPLAN_MANAGED=root/'extensions.d'/'internal.conf',
            DIALPLAN_CONTEXT='uwi-'+ORG.replace('-', ''), BACKUP_DIR=root/'backups',
            operation_lock=lambda: nullcontext(), assert_no_calls=Mock(),
            _verify_profile_runtime_locked=Mock(), assert_fvx=Mock(), _verify_loaded_context=Mock(),
            grp=SimpleNamespace(getgrnam=lambda name:SimpleNamespace(gr_gid=777)),
            guarded_reload=Mock(side_effect=lambda command:"Module '"+command.removeprefix('module reload ')+"' reloaded successfully."), require_root=Mock(), Busy=type('Busy', (Exception,), {}),
            validate_local_owner=lambda item: self.assertEqual(item['organization_id'], ORG),
            strip_ansi=lambda text: text, json_bytes=lambda item: json.dumps(item).encode())
        a = self.agent
        def default_cli(command):
            if command.startswith('dialplan set global '):
                name,value=command.split()[-2:]
                return "\n    -- Global variable '"+name+"' set to '"+value+"'\n"
            return 'Transport: transport-udp-local udp 0 0 0.0.0.0:5060\n'
        a.asterisk = Mock(side_effect=default_cli)
        self.writes = []
        self.write_modes = []
        def write(path, content, mode=0o600, gid=None):
            self.writes.append(path);self.write_modes.append((path,mode,gid)); path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(content)
        a.write_atomic = write
        a.render_internal_routes = lambda: (('['+a.DIALPLAN_CONTEXT+']\n'+rt.internal_attachment(a)).encode(), [])
        self.row = dict(id=TRUNK, organization_id=ORG, enabled=True, host='sip.example.com', port=5060,
            transport='transport-udp-local', username='account', password='SECRET', realm='example.com',
            allowed_extension_ids=[EXT], inbound_enabled=False, revision=1, status='pending')
        ext_dir=a.STATE_DIR/'extensions'; ext_dir.mkdir(parents=True)
        (ext_dir/(EXT+'.json')).write_text(json.dumps(dict(id=EXT, organization_id=ORG,
            enabled=True, endpoint='uw-c7983c3e56cb424fbc8c7bb8ff9ec952')))
        sip, routes, state, _ = rt.paths(a)
        for path, content in [(sip,b''),(routes,rt.empty_routes(a)),
                              (state,a.json_bytes(rt.empty_state(ORG)))]: write(path,content)
        a.PJSIP_FILE.write_text(rt.pjsip_include(a)+'\n')
        a.DIALPLAN_MANAGED.write_bytes(a.render_internal_routes()[0]); self.writes.clear()

    def test_transports_parse_actual_names_and_ignore_headers(self):
        self.assertEqual(rt.transports(self.agent), {'transport-udp-local':'udp'})
        self.agent.asterisk.side_effect=None
        self.agent.asterisk.return_value='Transport: fake udp injected\n'
        self.assertEqual(rt.transports(self.agent), {})

    def test_apply_revision_and_steady_state_does_not_reload_or_write(self):
        original_state_gid=rt.paths(self.agent)[2].stat().st_gid
        with patch.object(rt, 'verify',return_value=None), patch.object(rt.os, 'chown', create=True), patch.object(rt.os, 'chmod'):
            reports=rt.apply_snapshot(self.agent,[self.row],ORG)
            self.assertEqual(reports,[dict(id=TRUNK,revision=1,status='applied')])
            self.assertIn(b'SECRET',rt.paths(self.agent)[0].read_bytes())
            for path in rt.paths(self.agent)[:2]:
                self.assertIn((path,0o640,777),self.write_modes)
            self.assertIn((rt.paths(self.agent)[2],0o600,original_state_gid),self.write_modes)
            self.assertEqual(self.agent.guarded_reload.call_count,3)
            self.assertEqual([call.args[0] for call in self.agent.guarded_reload.call_args_list],
                ['module reload res_pjsip.so','module reload res_pjsip_outbound_registration.so','dialplan reload'])
            self.agent.guarded_reload.reset_mock(); self.writes.clear()
            self.row['status']='applied'
            self.assertEqual(rt.apply_snapshot(self.agent,[self.row],ORG),[])
            self.assertEqual(self.writes,[]); self.agent.guarded_reload.assert_not_called()
            self.row['status']='pending'
            self.assertEqual(rt.apply_snapshot(self.agent,[self.row],ORG),reports)
            self.agent.guarded_reload.assert_not_called()

    def test_foreign_org_and_injection_rejected_before_writes(self):
        for mutation in [dict(organization_id=OTHER),dict(password='SECRET\n[evil]'),dict(revision=True),dict(transport='udp')]:
            row={**self.row,**mutation}
            with patch.object(rt,'verify',return_value=None),self.assertRaises(rt.TrunkRuntimeError) as err:
                rt.apply_snapshot(self.agent,[row],ORG)
            self.assertNotIn('SECRET',str(err.exception)); self.assertEqual(self.writes,[])

    def test_busy_blocks_before_writes(self):
        self.agent.assert_no_calls.side_effect=self.agent.Busy('call')
        with patch.object(rt,'verify',return_value=None),self.assertRaises(self.agent.Busy):
            rt.apply_snapshot(self.agent,[self.row],ORG)
        self.assertEqual(self.writes,[])

    def test_failure_rolls_back_every_file(self):
        before={path:path.read_bytes() for path in rt.paths(self.agent)[:3]+(self.agent.DIALPLAN_MANAGED,)}
        self.agent.guarded_reload.side_effect=self.agent.Busy('started')
        with patch.object(rt,'verify',return_value=None),patch.object(rt.os,'chown',create=True),patch.object(rt.os,'chmod'),self.assertRaises(self.agent.Busy):
            rt.apply_snapshot(self.agent,[self.row],ORG)
        for path, content in before.items(): self.assertEqual(path.read_bytes(),content)

    def test_exit_zero_unknown_reload_command_is_rejected_and_rolls_back(self):
        before={path:path.read_bytes() for path in rt.paths(self.agent)[:3]+(self.agent.DIALPLAN_MANAGED,)}
        self.agent.guarded_reload.side_effect=lambda command:"No such command '"+command+"' (type 'core show help' for other possible commands)"
        with patch.object(rt,'verify',return_value=None),patch.object(rt.os,'chown',create=True),patch.object(rt.os,'chmod'),self.assertRaises(rt.TrunkRuntimeError):
            rt.apply_snapshot(self.agent,[self.row],ORG)
        for path,content in before.items():self.assertEqual(path.read_bytes(),content)

    def test_revision_cannot_reuse_identity_with_changed_body(self):
        with patch.object(rt,'verify',return_value=None),patch.object(rt.os,'chown',create=True),patch.object(rt.os,'chmod'):
            rt.apply_snapshot(self.agent,[self.row],ORG); self.writes.clear()
            self.row['password']='CHANGED'
            with self.assertRaises(rt.TrunkRuntimeError):rt.apply_snapshot(self.agent,[self.row],ORG)
            self.assertEqual(self.writes,[])

    def test_active_trunk_cannot_disappear_without_explicit_disabled_tombstone(self):
        with patch.object(rt,'verify',return_value=None),patch.object(rt.os,'chown',create=True),patch.object(rt.os,'chmod'):
            rt.apply_snapshot(self.agent,[self.row],ORG);self.writes.clear()
            original=rt.paths(self.agent)[0].read_bytes()
            with self.assertRaises(rt.TrunkRuntimeError):rt.apply_snapshot(self.agent,[],ORG)
            self.assertEqual(self.writes,[])
            self.assertEqual(rt.paths(self.agent)[0].read_bytes(),original)
            self.agent.asterisk.reset_mock()
            self.row.update(enabled=False,revision=2,password=None,allowed_extension_ids=[OTHER])
            self.assertEqual(rt.apply_snapshot(self.agent,[self.row],ORG),[dict(id=TRUNK,revision=2,status='applied')])
            self.assertEqual(rt.paths(self.agent)[0].read_bytes(),b'')
            self.assertFalse(any(call.args[0].startswith('dialplan set global ') for call in self.agent.asterisk.call_args_list))

    def test_legacy_never_advertises_or_applies(self):
        self.agent.PROFILE_ID=None
        self.assertEqual(rt.capability(self.agent,ORG),[])
        with self.assertRaises(rt.TrunkRuntimeError):rt.apply_snapshot(self.agent,[self.row],ORG)

    def test_verify_loaded_endpoint_registration_and_contexts(self):
        with patch.object(rt,'verify',return_value=None),patch.object(rt.os,'chown',create=True),patch.object(rt.os,'chmod'):
            rt.apply_snapshot(self.agent,[self.row],ORG)
        names=rt.trunk_names(ORG,TRUNK)
        def cli(command):
            if command=='pjsip show endpoint '+names['endpoint']:
                return 'context : '+names['inbound']+'\ntransport : transport-udp-local\nallow_transfer : false\nallow_subscribe : false\n'
            if command=='pjsip show registration '+names['registration']:
                return 'endpoint : '+names['endpoint']+'\ncontact_user : '+names['contact']+'\nline : true\n'
            if command=='core show function CHANNEL': return ' endpoint - R/O Name\n'
            return ''
        self.agent.asterisk.side_effect=cli
        self.assertEqual(rt.verify(self.agent,ORG)['rows'][0]['revision'],1)
        self.assertEqual(rt.capability(self.agent,ORG),['sip_trunks_v1'])
        self.assertEqual(self.agent._verify_loaded_context.call_args_list[-1].args[2],['_55.'])
        self.agent.asterisk.side_effect=lambda command: cli(command).replace('line : true','line : false')
        with self.assertRaises(rt.TrunkRuntimeError):rt.verify(self.agent,ORG)
        self.assertEqual(rt.capability(self.agent,ORG),[])

    def test_corrupt_existing_config_blocks_capability_without_mutation(self):
        rt.paths(self.agent)[0].write_bytes(b'other config')
        self.assertEqual(rt.capability(self.agent,ORG),[])
        self.assertEqual(self.writes,[])

    def test_colored_asterisk_channel_documentation_still_admits_supported_runtime(self):
        self.agent.asterisk.side_effect=lambda command:'        \x1b[1;34mendpoint\x1b[1;36m - R/O The name of the endpoint associated with this channel.\n'
        self.agent.strip_ansi=lambda value:re.sub(r'\x1b\[[0-9;]*m','',value)
        with patch.object(rt,'verify'):
            self.assertEqual(rt.capability(self.agent,ORG),['sip_trunks_v1'])

    def test_call_start_after_first_write_restores_changed_file(self):
        before={path:path.read_bytes() for path in rt.paths(self.agent)[:3]}
        self.agent.assert_no_calls.side_effect=[None,None,None,self.agent.Busy('started')]
        with patch.object(rt,'verify',return_value=None),patch.object(rt.os,'chown',create=True),patch.object(rt.os,'chmod'),self.assertRaises(self.agent.Busy):
            rt.apply_snapshot(self.agent,[self.row],ORG)
        for path,content in before.items():self.assertEqual(path.read_bytes(),content)

    def test_failed_revision_waits_for_explicit_retry_and_safe_failure_reports(self):
        self.row['status']='failed'
        with patch.object(rt,'verify',return_value=None):
            self.assertEqual(rt.apply_snapshot(self.agent,[self.row],ORG),[])
        self.assertEqual(self.writes,[])
        self.assertEqual(rt.failure_reports([self.row],ORG),[])
        self.row['status']='pending'
        foreign={**self.row,'organization_id':OTHER}
        self.assertEqual(rt.failure_reports([self.row,foreign],ORG),[dict(id=TRUNK,revision=1,status='failed')])

    def test_opt_in_initialization_preserves_main_and_refuses_reinitialize(self):
        for path in rt.paths(self.agent)[:3]:path.unlink()
        self.agent.PJSIP_FILE.write_bytes(b'; other tenant and legacy includes\n')
        self.agent.DIALPLAN_MANAGED.write_bytes(self.agent.render_internal_routes()[0])
        with patch.object(rt,'verify',return_value=None),patch.object(rt.os,'chown',create=True),patch.object(rt.os,'chmod'):
            rt.init(self.agent,ORG)
            self.assertEqual(rt.paths(self.agent)[0].read_bytes(),b'')
            self.assertIn(b'; other tenant and legacy includes\n',self.agent.PJSIP_FILE.read_bytes())
            self.assertEqual(self.agent.DIALPLAN_MANAGED.read_bytes(),self.agent.render_internal_routes()[0])
            with self.assertRaises(rt.TrunkRuntimeError):rt.init(self.agent,ORG)

    def test_agent_internal_hook_attaches_only_selected_profile(self):
        from test_agent_profiles import fresh_agent
        with patch.dict(sys.modules,{'grp':SimpleNamespace()}):agent=fresh_agent()
        root=Path(self.tmp.name)
        agent.PROFILE_ID=ORG;agent.STATE_DIR=root/'empty-state';agent.SIP_DIR=self.agent.SIP_DIR
        agent.DIALPLAN_MANAGED=self.agent.DIALPLAN_MANAGED
        agent.DIALPLAN_CONTEXT=self.agent.DIALPLAN_CONTEXT
        agent.QUEUE_TEST_FILE=root/'absent-queues'
        agent.flow_support=lambda:None
        source,_=agent.render_internal_routes()
        self.assertIn(('include => '+rt.paths(agent)[3]).encode(),source)
        self.assertIn(rt.attachment(agent)[2].encode(),source)
        agent.PROFILE_ID=None
        source,_=agent.render_internal_routes()
        self.assertNotIn(b'uwto-',source)

    def test_engine_group_permissions_are_distinct_from_private_state(self):
        info=SimpleNamespace(st_uid=0,st_gid=777,st_mode=0o100640)
        path=SimpleNamespace(parents=(),is_symlink=lambda:False,is_file=lambda:True,stat=lambda:info)
        with patch.object(rt.os,'name','posix'),patch.dict(sys.modules,{'pwd':SimpleNamespace(getpwnam=lambda name:SimpleNamespace(pw_uid=999))}):
            REAL_SAFE_FILE(path,engine_group=777)
            info.st_uid=999
            REAL_SAFE_FILE(path,engine_group=777)
            for uid,gid,mode in [(42,777,0o640),(0,0,0o640),(0,777,0o666),(0,777,0o600)]:
                info.st_uid=uid;info.st_gid=gid;info.st_mode=mode
                with self.assertRaises(rt.TrunkRuntimeError):REAL_SAFE_FILE(path,engine_group=777)
            info.st_uid=0;info.st_gid=0;info.st_mode=0o600
            REAL_SAFE_FILE(path,True)
            info.st_mode=0o640
            with self.assertRaises(rt.TrunkRuntimeError):REAL_SAFE_FILE(path,True)

    def test_existing_engine_files_allow_asterisk_owner_without_permission_changes(self):
        info=SimpleNamespace(st_uid=999,st_gid=777,st_mode=0o100600)
        path=SimpleNamespace(parents=(),is_symlink=lambda:False,is_file=lambda:True,stat=lambda:info)
        with patch.object(rt.os,'name','posix'),patch.dict(sys.modules,{'pwd':SimpleNamespace(getpwnam=lambda name:SimpleNamespace(pw_uid=999))}):
            REAL_SAFE_FILE(path)
            info.st_uid=0;info.st_mode=0o100644
            REAL_SAFE_FILE(path)
            for uid,mode in [(42,0o600),(0,0o666),(999,0o620),(0,0o602),(0,0o4755)]:
                info.st_uid=uid;info.st_mode=mode
                with self.assertRaises(rt.TrunkRuntimeError):REAL_SAFE_FILE(path)
            info.st_uid=999;info.st_mode=0o600
            with self.assertRaises(rt.TrunkRuntimeError):REAL_SAFE_FILE(path,True)

    def test_cloud_snapshot_renews_lease_but_busy_failed_and_capability_do_not(self):
        prefix='dialplan set global UW_SIP_LEASE_'+ORG.replace('-','')+' '
        with patch.object(rt,'verify',return_value=None),patch.object(rt.os,'chown',create=True),patch.object(rt.os,'chmod'),patch.object(rt.time,'time',return_value=2000000000):
            rt.apply_snapshot(self.agent,[self.row],ORG)
            self.assertIn(prefix+'2000000095',[call.args[0] for call in self.agent.asterisk.call_args_list])
            self.agent.asterisk.reset_mock();self.agent.guarded_reload.reset_mock()
            self.row['status']='applied'
            rt.apply_snapshot(self.agent,[self.row],ORG)
            self.assertIn(prefix+'2000000095',[call.args[0] for call in self.agent.asterisk.call_args_list])
            self.agent.guarded_reload.assert_not_called()
            for status in ('failed',):
                self.agent.asterisk.reset_mock();self.row['status']=status
                rt.apply_snapshot(self.agent,[self.row],ORG)
                self.assertFalse(any(call.args[0].startswith(prefix) for call in self.agent.asterisk.call_args_list))
            self.agent.asterisk.reset_mock()
            rt.capability(self.agent,ORG)
            self.assertFalse(any(call.args[0].startswith(prefix) for call in self.agent.asterisk.call_args_list))
            self.agent.assert_no_calls.side_effect=self.agent.Busy('call')
            self.agent.asterisk.reset_mock();self.row['status']='pending'
            with self.assertRaises(self.agent.Busy):rt.apply_snapshot(self.agent,[self.row],ORG)
            self.assertFalse(any(call.args[0].startswith(prefix) for call in self.agent.asterisk.call_args_list))


if __name__ == '__main__':unittest.main()
