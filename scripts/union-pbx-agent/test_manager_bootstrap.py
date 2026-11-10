from contextlib import ExitStack,nullcontext
import grp
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import manager_bootstrap as setup


class ManagerBootstrapTests(unittest.TestCase):
    def fixture(self,root,stack,fail_auth=False):
        main=root/'manager.conf';private=root/'local-manager.json'
        stack.enter_context(patch.object(setup,'MANAGER_FILE',main))
        stack.enter_context(patch.object(setup,'PRIVATE_CONFIG',private))
        stack.enter_context(patch.object(setup,'BACKUP_DIR',root/'backups'))
        stack.enter_context(patch.object(setup.pbx,'require_root'))
        stack.enter_context(patch.object(setup.pbx,'operation_lock',return_value=nullcontext()))
        stack.enter_context(patch.object(setup.pbx,'assert_no_calls'))
        stack.enter_context(patch.object(setup.pbx.grp,'getgrnam',return_value=grp.getgrgid(os.getgid())))
        stack.enter_context(patch.object(setup.pbx.os,'chown'))
        state={'enabled':False,'reloads':0}
        stack.enter_context(patch.object(setup.pbx,'command',side_effect=lambda *args:
            b'LISTEN 0 100 127.0.0.1:5038 0.0.0.0:*\n' if state['enabled'] else b''))
        def cli(command):
            if command=='manager reload':
                state['enabled']='enabled=yes\n' in main.read_text();state['reloads']+=1
                return 'Manager reloaded'
            if command=='manager show settings':
                return ('Manager (AMI): Yes\nWeb Manager (AMI/HTTP): No\nTCP Bindaddress: 127.0.0.1:5038\nTLS Enable: No\n' if state['enabled'] else
                        'Manager (AMI): No\nWeb Manager (AMI/HTTP): No\nTCP Bindaddress: Disabled\nTLS Enable: No\n')
            raise AssertionError('Unexpected Asterisk command: '+command)
        stack.enter_context(patch.object(setup.pbx,'asterisk',side_effect=cli))
        auth=stack.enter_context(patch.object(setup.local_queue_reload,'check_ready',
                                            side_effect=setup.local_queue_reload.ManagerError('test auth failure') if fail_auth else None))
        return main,private,state,auth

    def test_template_is_loopback_only_and_grants_no_call_or_command_permissions(self):
        text=setup.render_manager('x'*64)
        for setting in ('bindaddr=127.0.0.1','port=5038','webenabled=no','tlsenable=no','read=none','write=none',
                        'deny=0.0.0.0/0.0.0.0','permit=127.0.0.1/255.255.255.255'):
            self.assertIn(setting+'\n',text)
        self.assertNotIn('bindaddr=0.0.0.0',text)
        with self.assertRaises(setup.SetupError):setup.render_manager('bad\r\nwrite=all')

    def test_apply_creates_private_credentials_and_only_reloads_manager(self):
        with tempfile.TemporaryDirectory() as directory,ExitStack() as stack:
            main,private,state,auth=self.fixture(Path(directory),stack)
            setup.activate()
            data=json.loads(private.read_text())
            self.assertEqual(set(data),{'username','secret'})
            self.assertIn('secret='+data['secret']+'\n',main.read_text())
            self.assertEqual(private.stat().st_mode & 0o777,0o600)
            self.assertEqual(main.stat().st_mode & 0o777,0o640)
            self.assertEqual(state['reloads'],1)
            auth.assert_called_once()

    def test_authentication_failure_disables_interface_and_restores_absent_files(self):
        with tempfile.TemporaryDirectory() as directory,ExitStack() as stack:
            main,private,state,auth=self.fixture(Path(directory),stack,fail_auth=True)
            with self.assertRaises(setup.local_queue_reload.ManagerError):setup.activate()
            self.assertFalse(state['enabled'])
            self.assertEqual(state['reloads'],2)
            self.assertFalse(main.exists());self.assertFalse(private.exists())

    def test_existing_configuration_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as directory,ExitStack() as stack:
            main,private,state,auth=self.fixture(Path(directory),stack)
            main.write_text('; existing configuration\n')
            with self.assertRaises(setup.SetupError):setup.activate()
            self.assertEqual(main.read_text(),'; existing configuration\n')
            self.assertFalse(private.exists());self.assertEqual(state['reloads'],0)
            auth.assert_not_called()

    def test_call_in_progress_blocks_changes_before_creating_credentials(self):
        with tempfile.TemporaryDirectory() as directory,ExitStack() as stack:
            main,private,state,auth=self.fixture(Path(directory),stack)
            stack.enter_context(patch.object(setup.pbx,'assert_no_calls',side_effect=setup.pbx.Busy('active')))
            with self.assertRaises(setup.pbx.Busy):setup.activate()
            self.assertFalse(main.exists());self.assertFalse(private.exists())
            self.assertEqual(state['reloads'],0);auth.assert_not_called()

    def test_new_call_before_reload_removes_prepared_files_without_activating_interface(self):
        with tempfile.TemporaryDirectory() as directory,ExitStack() as stack:
            main,private,state,auth=self.fixture(Path(directory),stack)
            stack.enter_context(patch.object(setup.pbx,'assert_no_calls',side_effect=[None,setup.pbx.Busy('active')]))
            with self.assertRaises(setup.pbx.Busy):setup.activate()
            self.assertFalse(main.exists());self.assertFalse(private.exists())
            self.assertEqual(state['reloads'],0);auth.assert_not_called()

    def test_occupied_public_port_blocks_changes(self):
        with tempfile.TemporaryDirectory() as directory,ExitStack() as stack:
            main,private,state,auth=self.fixture(Path(directory),stack)
            stack.enter_context(patch.object(setup.pbx,'command',return_value=b'LISTEN 0 100 0.0.0.0:5038 0.0.0.0:*\n'))
            with self.assertRaises(setup.SetupError):setup.activate()
            self.assertFalse(main.exists());self.assertFalse(private.exists())
            self.assertEqual(state['reloads'],0);auth.assert_not_called()

    def test_failed_rollback_preserves_private_recovery_files(self):
        with tempfile.TemporaryDirectory() as directory,ExitStack() as stack:
            main,private,state,auth=self.fixture(Path(directory),stack,fail_auth=True)
            original=setup.pbx.asterisk.side_effect
            def cli(command):
                if command=='manager reload' and state['reloads']==1:
                    raise setup.pbx.AgentError('simulated rollback failure')
                return original(command)
            setup.pbx.asterisk.side_effect=cli
            with self.assertRaisesRegex(setup.SetupError,'CRITICO'):setup.activate()
            self.assertTrue(private.exists());self.assertTrue(main.exists())
            self.assertIn('enabled=no\n',main.read_text())
            self.assertEqual(private.stat().st_mode & 0o777,0o600)

    def test_preview_and_missing_acknowledgement_never_activate(self):
        with patch.object(setup,'activate') as apply,patch('sys.stdout',new_callable=io.StringIO) as out,\
             patch('sys.stderr',new_callable=io.StringIO):
            self.assertEqual(setup.main([]),0)
            self.assertTrue(json.loads(out.getvalue())['preview'])
            self.assertEqual(setup.main(['--apply']),1)
            apply.assert_not_called()


if __name__=='__main__':unittest.main()
