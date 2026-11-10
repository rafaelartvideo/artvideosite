import importlib.util
from contextlib import ExitStack,nullcontext
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import uuid


class RuntimeAdmissionTests(unittest.TestCase):
    def setUp(self):
        spec=importlib.util.spec_from_file_location('admission_'+uuid.uuid4().hex,Path(__file__).with_name('agent.py'))
        self.agent=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.agent)

    def test_legacy_keeps_protocol_two_without_claiming_profile(self):
        with patch.object(self.agent,'asterisk') as cli:
            self.assertEqual(self.agent.runtime_capability(2),{'protocol_version':2})
            cli.assert_not_called()

    def test_unprepared_profile_never_claims_protocol_three(self):
        self.agent.select_profile(str(uuid.uuid4()))
        with patch.object(self.agent,'verify_profile_runtime',side_effect=self.agent.Busy('not ready')):
            self.assertEqual(self.agent.runtime_capability(2),{'protocol_version':1})
        with patch.object(self.agent,'verify_profile_runtime') as verify:
            self.assertEqual(self.agent.runtime_capability(1),{'protocol_version':1})
            verify.assert_not_called()

    def test_endpoint_requires_unique_own_context_and_transfer_in_both_cli_formats(self):
        a=self.agent;a.select_profile(str(uuid.uuid4()));ctx=a.DIALPLAN_CONTEXT
        for transfer in (' set_var : TRANSFER_CONTEXT='+ctx+'\n',' TRANSFER_CONTEXT : '+ctx+'\n'):
            detail=' context : '+ctx+'\n'+transfer
            self.assertTrue(a.endpoint_matches_profile(detail))
            self.assertFalse(a.endpoint_matches_profile(detail.replace(ctx,'union-internal',1)))
            self.assertFalse(a.endpoint_matches_profile(detail+transfer))

    def fixture(self,root,stack):
        a=self.agent;org=str(uuid.uuid4());a.select_profile(org)
        for name in ('MASTER_FILE','DIALPLAN_MANAGED','QUEUE_FILE','QUEUE_TEST_FILE','PJSIP_FILE','DIALPLAN_MAIN','QUEUE_MAIN'):
            stack.enter_context(patch.object(a,name,root/name))
        stack.enter_context(patch.object(a,'STATE_DIR',root/'state'))
        stack.enter_context(patch.object(a,'QUEUE_STATE_DIR',root/'state'/'queues'))
        stack.enter_context(patch.object(a,'operation_lock',return_value=nullcontext()))
        stack.enter_context(patch.object(a,'ensure_queue_control_ready'))
        endpoint='uw-'+uuid.uuid4().hex;identity=str(uuid.uuid4())
        (a.STATE_DIR/'extensions').mkdir(parents=True)
        state={'id':identity,'organization_id':org,'endpoint':endpoint,'number':301,'enabled':True,'password':'a'*48}
        (a.STATE_DIR/'extensions'/(identity+'.json')).write_text(json.dumps(state))
        a.QUEUE_FILE.write_bytes(a.render_queue_configs()[0]);a.QUEUE_TEST_FILE.write_bytes(a.render_queue_configs()[1])
        a.MASTER_FILE.write_bytes(a.render_master());a.DIALPLAN_MANAGED.write_bytes(a.render_internal_routes()[0])
        for path,line in ((a.PJSIP_FILE,a.INCLUDE),(a.DIALPLAN_MAIN,a.DIALPLAN_FILE_INCLUDE),(a.QUEUE_MAIN,a.QUEUE_MAIN_INCLUDE)):
            path.write_text(line+'\n')
        outputs={
            'dialplan show '+a.DIALPLAN_CONTEXT:
                "[ Context '"+a.DIALPLAN_CONTEXT+"' created by 'pbx_config' ]\n"
                " '301' => 1. Dial(PJSIP/"+endpoint+",25) [fixture:1]\n 2. Hangup() [fixture:2]\n"
                " '900' => 1. Answer() [fixture:3]\n 2. Echo() [fixture:4]\n 3. Hangup() [fixture:5]\n"
                " Include => '"+a.QUEUE_TEST_CONTEXT+"' [pbx_config]\n",
            'dialplan show '+a.QUEUE_TEST_CONTEXT:"[ Context '"+a.QUEUE_TEST_CONTEXT+"' created by 'pbx_config' ]\n",
            'pjsip show endpoint '+endpoint:' Endpoint: '+endpoint+'/301\n context : '+a.DIALPLAN_CONTEXT+'\n set_var : TRANSFER_CONTEXT='+a.DIALPLAN_CONTEXT+'\n',
        }
        stack.enter_context(patch.object(a,'asterisk',side_effect=lambda command:outputs[command]))
        return org,outputs,endpoint

    def test_disabling_member_waits_for_queue_reconciliation_without_losing_admission(self):
        a=self.agent
        with tempfile.TemporaryDirectory() as folder,ExitStack() as stack:
            org,outputs,endpoint=self.fixture(Path(folder),stack)
            identity=next((a.STATE_DIR/'extensions').glob('*.json')).stem
            job={'id':identity,'organization_id':org,'number':301,'endpoint_name':endpoint,
                 'desired_enabled':False,'updated_at':'2026-11-10T00:00:00Z'}
            with patch.object(a,'queue_states',return_value={'fixture':{'enabled':True,'members':[{'endpoint_name':endpoint}]}}),\
                 patch.object(a,'write_atomic') as write:
                with self.assertRaises(a.Busy):a.apply_job(job,org)
                write.assert_not_called()
            self.assertEqual(a.runtime_capability(2)['protocol_version'],3)
            # The queued removal has now reached the local queue state. The next
            # poll can still receive and apply the deferred extension operation.
            outputs['pjsip show registrations']=''
            outputs['pjsip show endpoint '+endpoint]='Unable to find object'
            outputs['dialplan show '+a.DIALPLAN_CONTEXT]=(
                "[ Context '"+a.DIALPLAN_CONTEXT+"' created by 'pbx_config' ]\n"
                " '900' => 1. Answer() [fixture:3]\n 2. Echo() [fixture:4]\n 3. Hangup() [fixture:5]\n"
                " Include => '"+a.QUEUE_TEST_CONTEXT+"' [pbx_config]\n")
            with patch.object(a,'guarded_reload',return_value='reloaded successfully'),\
                 patch.object(a.grp,'getgrnam',create=True,return_value=type('Group',(),{'gr_gid':17})()),\
                 patch.object(a.os,'chown',create=True),patch.object(a,'assert_no_calls'):
                a.apply_job(job,org)
            self.assertEqual(a.runtime_capability(2)['protocol_version'],3)

    def test_protocol_three_requires_real_matching_files_and_runtime(self):
        with tempfile.TemporaryDirectory() as folder,ExitStack() as stack:
            org,outputs,endpoint=self.fixture(Path(folder),stack);a=self.agent
            self.assertEqual(a.runtime_capability(2),{'protocol_version':3,'profile_id':org,'profile_context':a.DIALPLAN_CONTEXT})
            original=a.MASTER_FILE.read_bytes();a.MASTER_FILE.write_bytes(original+b'; external edit\n')
            self.assertEqual(a.runtime_capability(2),{'protocol_version':1})
            a.MASTER_FILE.write_bytes(original)
            for command,suffix in (
                ('dialplan show '+a.DIALPLAN_CONTEXT," Include => 'union-internal' [pbx_config]\n"),
                ('dialplan show '+a.DIALPLAN_CONTEXT," '999' => 1. Dial(PJSIP/foreign,25) [fixture:9]\n"),
                ('dialplan show '+a.QUEUE_TEST_CONTEXT," '850' => 1. Queue(foreign) [fixture:9]\n")):
                before=outputs[command];outputs[command]+=suffix
                self.assertEqual(a.runtime_capability(2),{'protocol_version':1})
                outputs[command]=before
            command='pjsip show endpoint '+endpoint;outputs[command]=outputs[command].replace('context : '+a.DIALPLAN_CONTEXT,'context : union-internal')
            self.assertEqual(a.runtime_capability(2),{'protocol_version':1})

    def test_reserved_extension_numbers_are_rejected_before_writes(self):
        org=str(uuid.uuid4());a=self.agent;a.select_profile(org)
        for number in (850,899,900):
            with self.assertRaises(a.AgentError):
                a.validate_job({'id':str(uuid.uuid4()),'organization_id':org,'number':number,
                    'endpoint_name':'uw-'+uuid.uuid4().hex,'desired_enabled':True,'updated_at':'2026-11-10T00:00:00Z'},org)

    def test_empty_profile_init_matches_the_state_before_any_job_is_admitted(self):
        from types import SimpleNamespace
        a=self.agent;a.select_profile(str(uuid.uuid4()))
        with tempfile.TemporaryDirectory() as folder,ExitStack() as stack:
            root=Path(folder)
            for name in ('CONFIG_DIR','STATE_DIR','MASTER_FILE','PJSIP_FILE','PRIVATE_KEY','PUBLIC_KEY'):
                stack.enter_context(patch.object(a,name,root/name))
            a.PJSIP_FILE.write_text(a.INCLUDE+'\n')
            stack.enter_context(patch.object(a,'require_root'))
            stack.enter_context(patch.object(a.grp,'getgrnam',create=True,return_value=SimpleNamespace(gr_gid=17)))
            stack.enter_context(patch.object(a.os,'chown',create=True))
            def command(*args):
                if 'genpkey' in args:a.PRIVATE_KEY.write_bytes(b'fixture private key, not a credential')
                return bytes.fromhex('302a300506032b6570032100')+bytes(32)
            stack.enter_context(patch.object(a,'command',side_effect=command))
            a.init()
            self.assertEqual(a.MASTER_FILE.read_bytes(),a.render_master())


if __name__=='__main__':unittest.main()
