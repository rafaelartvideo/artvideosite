import io
import json
import base64
import hashlib
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock,patch
import isolation_audit as audit


class IsolationAuditTests(unittest.TestCase):
    def test_pause_request_matches_the_real_availability_contract(self):
        from queue_availability import validate_job
        item=audit.make_plan()[0];_,queue=audit._jobs(item)
        name=validate_job(audit._pause_job(item),item['organization_id'],{queue['id']:queue})
        self.assertEqual(name,'uwq-'+queue['id'].replace('-',''))

    def test_plan_has_separate_org_extension_endpoint_and_queue_identities(self):
        plan=audit.make_plan();audit.validate_plan(plan)
        self.assertEqual({item['label'] for item in plan},{'A','B'})
        plan[1]['endpoint_id']=plan[0]['endpoint_id']
        with self.assertRaises(audit.AuditError):audit.validate_plan(plan)

    def test_plan_rejects_injection_and_unknown_fields(self):
        for key,value in (('organization_id','../../asterisk'),('label','\n#exec dangerous'),('path','/etc/asterisk/pjsip.conf')):
            plan=audit.make_plan();plan[0][key]=value
            with self.assertRaises(audit.AuditError):audit.validate_plan(plan)

    def test_preview_and_missing_approval_never_load_installed_runtime(self):
        with patch.object(audit,'_agent') as runtime,patch('sys.stdout',new_callable=io.StringIO) as out,\
             patch('sys.stderr',new_callable=io.StringIO):
            self.assertEqual(audit.main([]),0)
            self.assertEqual(json.loads(out.getvalue())['calls_originated'],0)
            self.assertEqual(audit.main(['--apply']),1)
            runtime.assert_not_called()

    def test_cleanup_rejects_paths_before_loading_runtime(self):
        with patch.object(audit,'_agent') as runtime:
            for value in ('../other','/etc/asterisk','A'*32,''):
                with self.assertRaises(audit.AuditError):audit.cleanup(value)
            runtime.assert_not_called()

    def test_documented_recovery_command_dispatches_cleanup(self):
        identity='a'*32
        with patch.object(audit,'cleanup') as cleanup,patch.object(audit,'run') as run:
            self.assertEqual(audit.main(['--apply','--acknowledge-isolation-audit','--cleanup',identity]),0)
            cleanup.assert_called_once_with(identity);run.assert_not_called()

    def test_write_ahead_journal_survives_interruption_on_either_side_of_each_write(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);state={'main':{}}
            pbx=SimpleNamespace(write_atomic=lambda path,data,*args:path.write_bytes(data),
                                json_bytes=lambda value:json.dumps(value).encode())
            for name in audit.MAIN_NAMES:
                raw=b'; original\n';(root/name).write_bytes(raw)
                state['main'][name]={'allowed_sha':[hashlib.sha256(raw).hexdigest()]}
            with patch.object(audit,'ASTERISK_ROOT',root):
                for number in range(2):
                    for name in audit.MAIN_NAMES:
                        before=(root/name).read_bytes()
                        after=audit._journal_include(pbx,root,state,name,'#include "profile-'+str(number)+'"')
                        # Read a fresh durable journal as a new recovery process would.
                        saved=json.loads((root/'state.json').read_text())
                        allowed=saved['main'][name]['allowed_sha']
                        self.assertIn(hashlib.sha256(before).hexdigest(),allowed)
                        self.assertIn(hashlib.sha256(after).hexdigest(),allowed)
                        (root/name).write_bytes(after)
                (root/'pjsip.conf').write_bytes(b'; unrelated operator change\n')
                with self.assertRaises(audit.AuditError):
                    audit._journal_include(pbx,root,state,'pjsip.conf','#include "another"')

    def test_cleanup_restores_then_checks_engine_and_production_before_success(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);plan=audit.make_plan()
            state={'plan':plan,'started':True,'main':{}}
            for name in audit.MAIN_NAMES:
                before=b'; original\n';after=before+b'; fixture\n';(root/name).write_bytes(after)
                state['main'][name]={'before':base64.b64encode(before).decode(),
                    'allowed_sha':[hashlib.sha256(value).hexdigest() for value in (before,after)],
                    'mode':0o600,'uid':0,'gid':0}
            pbx=Mock(unsafe=True);pbx.write_atomic.side_effect=lambda path,data,*args:path.write_bytes(data)
            pbx.json_bytes.side_effect=lambda value:json.dumps(value).encode()
            pbx.guarded_reload.return_value='Module reloaded successfully'
            worker=Mock();worker.DIALPLAN_CONTEXT='uwi-temporary';worker.QUEUE_TEST_CONTEXT='uwiq-temporary'
            worker.queue_identity.side_effect=lambda value:'uwq-'+value.replace('-','')
            worker.asterisk.side_effect=lambda command:('There is no existence of \''+command.split()[-1]+'\' context'
                                                      if command.startswith('dialplan show ') else 'No such object')
            def paths(item):
                parent=root/item['label']
                files=tuple(parent/name for name in ('master','routes','queues','queue-routes'))
                return SimpleNamespace(state_dir=parent,master_file=files[0],queue_file=files[2],queue_routes_file=files[3]),files
            with patch.object(audit,'ASTERISK_ROOT',root),patch.object(audit,'_paths',side_effect=paths),\
                 patch.object(audit,'_assert_owned_state'),patch.object(audit,'_worker',return_value=worker),\
                 patch.object(audit,'_verify_production') as verify,patch.object(audit.os,'chown',create=True):
                audit._cleanup_locked(pbx,root,state)
                self.assertTrue(state['cleaned']);verify.assert_called_once_with(pbx,state)
                for name in audit.MAIN_NAMES:self.assertEqual((root/name).read_bytes(),b'; original\n')
                state['cleaned']=False
                pbx.guarded_reload.return_value='reload failed'
                with self.assertRaises(audit.AuditError):audit._cleanup_locked(pbx,root,state)
                self.assertFalse(state['cleaned'])
                pbx.guarded_reload.return_value='Module reloaded successfully'
                worker.asterisk.return_value='still loaded'
                worker.asterisk.side_effect=None
                with self.assertRaises(audit.AuditError):audit._cleanup_locked(pbx,root,state)
                self.assertFalse(state['cleaned'])
                (root/'pjsip.conf').write_bytes(b'; unrelated change')
                pbx.reset_mock()
                with self.assertRaises(audit.AuditError):audit._cleanup_locked(pbx,root,state)
                pbx.guarded_reload.assert_not_called()


if __name__=='__main__':unittest.main()
