import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import uuid
from unittest.mock import patch
from contextlib import nullcontext, ExitStack


def fresh_agent():
    spec=importlib.util.spec_from_file_location('profile_agent_'+uuid.uuid4().hex,Path(__file__).with_name('agent.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


class AgentProfileTests(unittest.TestCase):
    def setUp(self):
        self.agent=fresh_agent()
        self.org=str(uuid.uuid4())
        self.runtime=tempfile.TemporaryDirectory()
        self.addCleanup(self.runtime.cleanup)
        for name,filename in (('LOCAL_MANAGER_CONFIG','absent-manager.json'),('TENANT_CONFIG_ROOT','tenants')):
            replacement=patch.object(self.agent,name,Path(self.runtime.name)/filename)
            replacement.start();self.addCleanup(replacement.stop)

    def test_profile_binds_private_config_state_and_sip_context(self):
        self.agent.select_profile(self.org)
        self.assertEqual(self.agent.PROFILE_ID,self.org)
        self.assertIn(self.org,str(self.agent.PRIVATE_KEY))
        self.assertIn(self.org,str(self.agent.SEQUENCE_FILE))
        text=self.agent.sip_conf('uw-'+'a'*32,301,'validPassword_'+'x'*40)
        context='uwi-'+uuid.UUID(self.org).hex
        self.assertIn('context='+context+'\n',text)
        self.assertIn('set_var=TRANSFER_CONTEXT='+context+'\n',text)
        self.assertNotIn('context=union-internal',text)
        with self.assertRaises(self.agent.AgentError):self.agent.select_profile(str(uuid.uuid4()))

    def test_profile_config_cannot_bind_another_organization(self):
        self.agent.select_profile(self.org)
        with self.assertRaisesRegex(self.agent.AgentError,'perfil'):
            self.agent.validate_profile_config({'organization_id':str(uuid.uuid4())})

    def test_profile_job_cannot_apply_a_different_org_even_with_matching_job_owner(self):
        self.agent.select_profile(self.org)
        other=str(uuid.uuid4())
        job={'id':str(uuid.uuid4()),'organization_id':other,'number':302,
             'endpoint_name':'uw-'+uuid.uuid4().hex,'desired_enabled':True,
             'updated_at':'2026-11-10T03:00:00Z'}
        with self.assertRaises(self.agent.AgentError):self.agent.validate_job(job,other)

    def test_profile_cli_selects_namespace_before_dispatch(self):
        with patch('sys.argv',['agent.py','--profile',self.org,'public-key']),\
             patch.object(Path,'read_text',return_value='public') as read:
            self.assertEqual(self.agent.main(),0)
            self.assertEqual(self.agent.PROFILE_ID,self.org)
            self.assertIn(self.org,str(self.agent.PRIVATE_KEY))

    def test_profile_bootstrap_does_not_use_legacy_browser_context(self):
        self.agent.select_profile(self.org)
        with patch.object(self.agent,'install_profile_routes') as setup:
            self.agent.install_internal_routes()
            self.agent.install_queues()
            self.assertEqual(setup.call_count,2)

    def bootstrap_fixture(self, root, stack):
        self.agent.select_profile(self.org)
        paths={name:root/name for name in ('MASTER_FILE','PJSIP_FILE','DIALPLAN_MAIN','QUEUE_MAIN',
               'DIALPLAN_MANAGED','QUEUE_FILE','QUEUE_TEST_FILE','DIALPLAN_BROWSER')}
        for name,path in paths.items():stack.enter_context(patch.object(self.agent,name,path))
        stack.enter_context(patch.object(self.agent,'STATE_DIR',root/'state'))
        stack.enter_context(patch.object(self.agent,'QUEUE_STATE_DIR',root/'state'/'queues'))
        stack.enter_context(patch.object(self.agent,'BACKUP_DIR',root/'backups'))
        stack.enter_context(patch.object(self.agent,'require_root'))
        # Mock the VPS-only Asterisk group and root ownership in this isolated fixture.
        stack.enter_context(patch.object(self.agent.grp,'getgrnam',
            return_value=self.agent.grp.getgrgid(self.agent.os.getgid())))
        stack.enter_context(patch.object(self.agent.os,'chown'))
        stack.enter_context(patch.object(self.agent,'assert_no_calls'))
        stack.enter_context(patch.object(self.agent,'assert_fvx'))
        for name in ('DIALPLAN_MAIN','QUEUE_MAIN','DIALPLAN_BROWSER'):
            paths[name].write_text('; preserve legacy\n[union-internal]\nexten => 301,1,Hangup()\n')
        paths['MASTER_FILE'].write_text('; initially empty\n')
        paths['PJSIP_FILE'].write_text(self.agent.INCLUDE+'\n')
        return paths

    def test_bootstrap_creates_only_own_routes_and_restores_files_if_reload_fails(self):
        for fail in (False,True):
            self.agent=fresh_agent()
            with tempfile.TemporaryDirectory() as directory,ExitStack() as stack:
                paths=self.bootstrap_fixture(Path(directory),stack)
                before={name:path.read_bytes() for name,path in paths.items() if path.exists()}
                def cli(command):
                    nonlocal fail
                    if command=='module reload res_pjsip.so' and fail:
                        fail=False
                        raise self.agent.AgentError('test reload failed')
                    if command=='module reload res_pjsip.so':return 'reloaded successfully'
                    if command=='dialplan reload':return 'reloaded'
                    if command.startswith('dialplan show '):return "900 => 1. Answer()"
                    return ''
                stack.enter_context(patch.object(self.agent,'asterisk',side_effect=cli))
                if fail:
                    with self.assertRaises(self.agent.AgentError):self.agent.install_profile_routes()
                    for name,content in before.items():self.assertEqual(paths[name].read_bytes(),content)
                    for name in ('DIALPLAN_MANAGED','QUEUE_FILE','QUEUE_TEST_FILE'):self.assertFalse(paths[name].exists())
                else:
                    self.agent.install_profile_routes()
                    self.assertEqual(paths['DIALPLAN_BROWSER'].read_bytes(),before['DIALPLAN_BROWSER'])
                    self.assertIn(self.agent.DIALPLAN_FILE_INCLUDE,paths['DIALPLAN_MAIN'].read_text())
                    self.assertIn(self.agent.QUEUE_MAIN_INCLUDE,paths['QUEUE_MAIN'].read_text())
                    own=paths['DIALPLAN_MANAGED'].read_text()
                    self.assertIn('[uwi-'+uuid.UUID(self.org).hex+']',own)
                    self.assertIn('900,1,Answer()',own)
                    self.assertNotIn('union-301',own)
                    self.assertTrue(any((Path(directory)/'backups').iterdir()))

    def test_profile_queue_reload_is_blocked_until_safe_integration_is_available(self):
        self.agent.select_profile(self.org)
        own='uwq-'+uuid.uuid4().hex
        with patch.object(self.agent,'queue_states',return_value={}),\
             patch.object(self.agent,'assert_no_calls'),\
             patch.object(self.agent,'asterisk',return_value='reloaded') as cli,\
             patch.object(self.agent,'assert_fvx'):
            with self.assertRaises(self.agent.Busy):self.agent.reload_queue_definitions([own])
            cli.assert_not_called()
            self.agent.reload_queue_definitions([])
            cli.assert_not_called()

    def test_queue_rollback_restores_files_without_reload_if_a_call_has_started(self):
        job={'id':str(uuid.uuid4()),'organization_id':self.org,'name':'Own queue','test_extension':850,
             'strategy':'ringall','ring_seconds':20,'max_wait_seconds':120,'enabled':False,
             'updated_at':'2026-11-10T03:00:00Z','members':[]}
        with tempfile.TemporaryDirectory() as directory,ExitStack() as stack:
            root=Path(directory)
            originals={}
            for name in ('QUEUE_FILE','QUEUE_TEST_FILE','DIALPLAN_MANAGED'):
                path=root/name;path.write_bytes(b'; original\n');originals[path]=path.read_bytes()
                stack.enter_context(patch.object(self.agent,name,path))
            stack.enter_context(patch.object(self.agent,'QUEUE_STATE_DIR',root/'queues'))
            stack.enter_context(patch.object(self.agent,'STATE_DIR',root/'state'))
            stack.enter_context(patch.object(self.agent.grp,'getgrnam',
                return_value=self.agent.grp.getgrgid(self.agent.os.getgid())))
            stack.enter_context(patch.object(self.agent.os,'chown'))
            stack.enter_context(patch.object(self.agent,'assert_no_calls',side_effect=[None,self.agent.Busy('active')]))
            stack.enter_context(patch.object(self.agent,'_check_queue_reload',side_effect=self.agent.Busy('active')))
            cli=stack.enter_context(patch.object(self.agent,'asterisk',return_value=''))
            with self.assertRaises(self.agent.Busy):self.agent.apply_queue_job(job,self.org)
            for path,content in originals.items():self.assertEqual(path.read_bytes(),content)
            self.assertFalse((root/'queues'/(job['id']+'.json')).exists())
            self.assertFalse(any('reload' in call.args[0] for call in cli.call_args_list))

    def test_same_number_in_two_profiles_has_only_own_endpoint_and_no_legacy_301(self):
        first=self.agent;second=fresh_agent()
        other_org=str(uuid.uuid4())
        endpoints=['uw-'+uuid.uuid4().hex,'uw-'+uuid.uuid4().hex]
        rendered=[]
        for index,(module,org) in enumerate(((first,self.org),(second,other_org))):
            module.select_profile(org)
            with tempfile.TemporaryDirectory() as directory:
                root=Path(directory);(root/'extensions').mkdir()
                identity=str(uuid.uuid4())
                (root/'extensions'/(identity+'.json')).write_text(json.dumps({
                    'id':identity,'organization_id':org,'endpoint':endpoints[index],
                    'number':301,'enabled':True,'password':'validPassword_'+'x'*40,
                }))
                with patch.object(module,'STATE_DIR',root),patch.object(module,'QUEUE_TEST_FILE',root/'absent-queue-routes.conf'):
                    text,numbers=module.render_internal_routes()
                self.assertEqual(numbers,[301]);text=text.decode();rendered.append(text)
                self.assertIn('Dial(PJSIP/'+endpoints[index]+',25)',text)
                self.assertNotIn(endpoints[1-index],text)
                self.assertNotIn('union-301',text)
                self.assertNotIn('include => union-',text)
                self.assertIn('900',text)
        self.assertNotEqual(first.DIALPLAN_CONTEXT,second.DIALPLAN_CONTEXT)

    def test_profile_rejects_foreign_local_extension_and_manual_union_member(self):
        self.agent.select_profile(self.org)
        state={'id':str(uuid.uuid4()),'organization_id':str(uuid.uuid4()),
               'endpoint':'uw-'+uuid.uuid4().hex,'number':302,'enabled':True,'password':'validPassword_'+'x'*40}
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'extensions').mkdir()
            (root/'extensions'/(state['id']+'.json')).write_text(json.dumps(state))
            with patch.object(self.agent,'STATE_DIR',root):
                with self.assertRaises(self.agent.AgentError):self.agent.render_master()
                with self.assertRaises(self.agent.AgentError):self.agent.render_internal_routes()
        queue={'id':str(uuid.uuid4()),'organization_id':self.org,'name':'Own queue','test_extension':850,
               'strategy':'ringall','ring_seconds':20,'max_wait_seconds':120,'enabled':True,
               'updated_at':'2026-11-10T03:00:00Z','members':[{'organization_id':self.org,
               'number':301,'endpoint_name':'union-301','position':1,'desired_enabled':True,'provisioning_status':'manual'}]}
        with self.assertRaises(self.agent.AgentError):self.agent.validate_queue_job(queue,self.org)

    def test_busy_extension_provisioning_does_not_block_browser_login(self):
        identity=str(uuid.uuid4());login_id=str(uuid.uuid4())
        item={'id':identity,'organization_id':self.org,'number':302,'endpoint_name':'uw-'+uuid.uuid4().hex,
              'desired_enabled':True,'updated_at':'2026-11-10T03:00:00Z'}
        with tempfile.TemporaryDirectory() as directory:
            config=Path(directory)/'agent.json';config.write_text(json.dumps({'organization_id':self.org}))
            with patch.object(self.agent,'AGENT_CONFIG',config),patch.object(self.agent,'gather_queue_telemetry',return_value=[]),\
                 patch.object(self.agent,'operation_lock',return_value=nullcontext()),\
                 patch.object(self.agent,'signed_request',side_effect=[{'jobs':[item],'login_requests':[{}]},{'accepted':True}]),\
                 patch.object(self.agent,'apply_job',side_effect=self.agent.Busy('Calls active')),\
                 patch.object(self.agent,'encrypt_login_for_browser',return_value=(login_id,'encrypted')) as deliver:
                self.agent.cycle()
                deliver.assert_called_once()


if __name__=='__main__':unittest.main()
