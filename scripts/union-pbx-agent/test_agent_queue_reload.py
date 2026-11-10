from contextlib import ExitStack
import grp
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import uuid

from test_agent_profiles import fresh_agent
import local_queue_reload as manager


class IsolatedQueueIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.agent=fresh_agent()
        self.org=str(uuid.uuid4())
        self.job={'id':str(uuid.uuid4()),'organization_id':self.org,'name':'Own queue','test_extension':850,
                  'strategy':'ringall','ring_seconds':20,'max_wait_seconds':120,'enabled':True,
                  'updated_at':'2026-11-10T13:00:00Z','members':[{'organization_id':self.org,'number':301,
                  'endpoint_name':'uw-'+uuid.uuid4().hex,'position':1,'desired_enabled':True,'provisioning_status':'applied'}]}

    def fixture(self,root,stack,profile=True,manager_config=True):
        if profile:self.agent.select_profile(self.org)
        else:self.job['members'][0]['number']=302
        for name in ('QUEUE_FILE','QUEUE_TEST_FILE','DIALPLAN_MANAGED'):
            path=root/name;path.write_text('; previous\n')
            stack.enter_context(patch.object(self.agent,name,path))
        stack.enter_context(patch.object(self.agent,'STATE_DIR',root/'state'))
        stack.enter_context(patch.object(self.agent,'QUEUE_STATE_DIR',root/'queues'))
        private=root/'manager.json'
        if manager_config:private.write_text('{}')
        stack.enter_context(patch.object(self.agent,'LOCAL_MANAGER_CONFIG',private))
        stack.enter_context(patch.object(self.agent,'TENANT_CONFIG_ROOT',root/'tenants'))
        stack.enter_context(patch.object(self.agent,'assert_no_calls'))
        stack.enter_context(patch.object(self.agent.grp,'getgrnam',return_value=grp.getgrgid(os.getgid())))
        stack.enter_context(patch.object(self.agent.os,'chown'))
        extensions=root/'state'/'extensions';extensions.mkdir(parents=True)
        extension_id=str(uuid.uuid4());member=self.job['members'][0]
        (extensions/(extension_id+'.json')).write_text(json.dumps({'id':extension_id,'organization_id':self.org,
            'number':member['number'],'endpoint':member['endpoint_name'],'enabled':True,'password':'safePassword_'+'x'*40}))
        return private

    def test_profile_authentication_failure_is_deferred_before_writing_files(self):
        with tempfile.TemporaryDirectory() as directory,ExitStack() as stack:
            root=Path(directory);self.fixture(root,stack)
            auth=stack.enter_context(patch.object(manager,'check_ready',side_effect=manager.ManagerError('unavailable')))
            cli=stack.enter_context(patch.object(self.agent,'asterisk'))
            with self.assertRaises(self.agent.Busy):self.agent.apply_queue_job(self.job,self.org)
            auth.assert_called_once();cli.assert_not_called()
            self.assertEqual(self.agent.QUEUE_FILE.read_text(),'; previous\n')
            self.assertFalse((root/'queues').exists())

    def test_borrowed_endpoint_state_is_rejected_before_authentication(self):
        with tempfile.TemporaryDirectory() as directory,ExitStack() as stack:
            root=Path(directory);self.fixture(root,stack)
            path=next((root/'state'/'extensions').glob('*.json'))
            state=json.loads(path.read_text());state['organization_id']=str(uuid.uuid4())
            path.write_text(json.dumps(state))
            auth=stack.enter_context(patch.object(manager,'check_ready',side_effect=AssertionError('must not authenticate')))
            with self.assertRaises(self.agent.AgentError):self.agent.apply_queue_job(self.job,self.org)
            auth.assert_not_called()

    def test_profile_queue_application_uses_its_validated_job_for_reload_and_keeps_own_state(self):
        with tempfile.TemporaryDirectory() as directory,ExitStack() as stack:
            root=Path(directory);self.fixture(root,stack)
            stack.enter_context(patch.object(manager,'check_ready'))
            stack.enter_context(patch.object(self.agent,'asterisk',return_value=''))
            reload=stack.enter_context(patch.object(self.agent,'_check_queue_reload'))
            self.agent.apply_queue_job(self.job,self.org)
            self.assertEqual(json.loads((root/'queues'/(self.job['id']+'.json')).read_text()),self.job)
            self.assertEqual(reload.call_args.kwargs['changed_queue'],self.job)
            self.assertNotIn('union-301',self.agent.QUEUE_FILE.read_text())

    def test_only_exact_changed_queue_is_sent_to_manager_even_with_other_configured_names(self):
        with tempfile.TemporaryDirectory() as directory,ExitStack() as stack:
            self.fixture(Path(directory),stack)
            reload=stack.enter_context(patch.object(manager,'reload_queue'))
            cli=stack.enter_context(patch.object(self.agent,'asterisk'))
            own=self.agent.queue_identity(self.job['id'])
            self.agent.reload_queue_definitions([own,'uwq-'+uuid.uuid4().hex],changed_queue=self.job)
            reload.assert_called_once()
            self.assertEqual(reload.call_args.args[0],own)
            self.assertIs(reload.call_args.kwargs['before_reload'],self.agent.assert_no_calls)
            cli.assert_not_called()

    def test_legacy_worker_with_local_manager_also_uses_scoped_reload(self):
        with tempfile.TemporaryDirectory() as directory,ExitStack() as stack:
            self.fixture(Path(directory),stack,profile=False)
            reload=stack.enter_context(patch.object(manager,'reload_queue'))
            cli=stack.enter_context(patch.object(self.agent,'asterisk'))
            self.agent.reload_queue_definitions([self.agent.queue_identity(self.job['id'])],changed_queue=self.job)
            reload.assert_called_once();cli.assert_not_called()

    def test_global_legacy_fallback_is_blocked_when_another_profile_has_been_configured(self):
        with tempfile.TemporaryDirectory() as directory,ExitStack() as stack:
            root=Path(directory);self.fixture(root,stack,profile=False,manager_config=False)
            other=root/'tenants'/str(uuid.uuid4());other.mkdir(parents=True)
            (other/'agent.json').write_text('{}')
            cli=stack.enter_context(patch.object(self.agent,'asterisk',return_value='reloaded successfully'))
            with self.assertRaises(self.agent.Busy):self.agent.reload_queue_definitions(['uwq-'+uuid.uuid4().hex])
            cli.assert_not_called()

    def test_legacy_bulk_setup_after_local_manager_is_blocked_before_any_write_or_engine_command(self):
        with tempfile.TemporaryDirectory() as directory,ExitStack() as stack:
            root=Path(directory);self.fixture(root,stack,profile=False)
            for name in ('QUEUE_MAIN','MASTER_FILE'):
                path=root/name;path.write_text('; existing\n')
                stack.enter_context(patch.object(self.agent,name,path))
            stack.enter_context(patch.object(self.agent,'require_root'))
            write=stack.enter_context(patch.object(self.agent,'write_atomic'))
            cli=stack.enter_context(patch.object(self.agent,'asterisk',side_effect=AssertionError('must defer before engine access')))
            with self.assertRaises(self.agent.Busy):self.agent.install_queues()
            write.assert_not_called();cli.assert_not_called()

    def test_runtime_member_confirmation_rejects_missing_foreign_duplicate_and_wrong_strategy(self):
        name=self.agent.queue_identity(self.job['id']);endpoint=self.job['members'][0]['endpoint_name']
        header=name+" has 0 calls (max unlimited) in 'ringall' strategy\n   Members:\n"
        line='      Ramal 301 (PJSIP/'+endpoint+') (ringinuse disabled) (Unavailable)\n'
        valid=header+line+'   No Callers\n'
        self.agent.verify_queue_members(self.job,valid)
        for invalid in (header+'   No Members\n',valid.replace(endpoint,'uw-'+uuid.uuid4().hex),
                        header+line+line+'   No Callers\n',valid.replace("'ringall'","'linear'"),
                        valid.replace(name,'uwq-'+uuid.uuid4().hex),
                        header+line+'      Foreign (SIP/foreign) (Unavailable)\n   No Callers\n'):
            with self.assertRaises(self.agent.AgentError):self.agent.verify_queue_members(self.job,invalid)

    def test_local_ownership_checks_independent_extension_id_owner_number_and_enabled_state(self):
        self.agent.select_profile(self.org)
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);extensions=root/'extensions';extensions.mkdir()
            identity=str(uuid.uuid4());member=self.job['members'][0]
            path=extensions/(identity+'.json')
            state={'id':identity,'organization_id':self.org,'number':member['number'],
                   'endpoint':member['endpoint_name'],'enabled':True,'password':'safePassword_'+'x'*40}
            with patch.object(self.agent,'STATE_DIR',root):
                path.write_text(json.dumps(state));self.agent.validate_queue_member_ownership(self.job,self.org)
                for bad in ({**state,'organization_id':str(uuid.uuid4())},{**state,'number':302},
                            {**state,'enabled':False},{**state,'id':str(uuid.uuid4())},
                            {**state,'endpoint':'uw-'+uuid.uuid4().hex}):
                    path.write_text(json.dumps(bad))
                    with self.assertRaises(self.agent.AgentError):self.agent.validate_queue_member_ownership(self.job,self.org)


if __name__=='__main__':unittest.main()
