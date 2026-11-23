import copy
import json
import time
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock,patch
from universal_telephony_runtime import init,capability,apply_snapshot,RuntimeErrorSafe,report,load,applied_state
from test_universal_telephony import document,ORG,uid

class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();root=Path(self.tmp.name)
        self.agent=SimpleNamespace(STATE_DIR=root,PROFILE_ID=ORG)
    def tearDown(self):self.tmp.cleanup()
    def test_empty_preparation_never_touches_engine(self):
        init(self.agent,ORG)
        self.assertEqual(capability(self.agent,ORG),['universal_telephony_v1'])
        self.assertEqual(report(self.agent)['status'],'prepared')
    def test_foreign_profile_and_expired_snapshot_rejected(self):
        init(self.agent,ORG)
        snap=dict(schema_version=1,organization_id=ORG,agent_id=ORG,revision=1,document=document(),extensions=[],credentials=[],issued_at=1,expires_at=2)
        with self.assertRaises(RuntimeErrorSafe):apply_snapshot(self.agent,snap,ORG)
        self.assertEqual(report(self.agent)['status'],'prepared')

    def snapshot(self,revision=1,active=True):
        d=document();d['routing_enabled']=active
        return dict(schema_version=1,organization_id=ORG,agent_id=ORG,revision=revision,document=d,
            extensions=[{'id':uid(7),'enabled':True}],credentials=[{'connection_id':uid(3),'password':'private-original-password'}],
            issued_at=time.time(),expires_at=time.time()+90,hash=None)
    def native(self):
        self.agent.universal_apply_bundle=Mock()
        self.agent.universal_verify_bundle=Mock()
        self.agent.universal_context_bindings=Mock()
        self.agent.universal_transports=lambda:{'transport-udp':'udp'}
        self.agent.universal_legacy_coverage=lambda org:True
        self.agent.universal_claimed_identities=lambda org:set()
        self.agent.universal_observe=Mock(return_value={'ready':True,'active_legs':2,'legacy_coverage':True,'connections':[
            {'connection_id':uid(3),'state':'registered','used':2,'inbound_used':0,'outbound_used':2,'available':0,'checked_at':'old'}]})
    def test_failure_reports_current_revision_preserving_applied_snapshot_and_retry(self):
        init(self.agent,ORG);self.native()
        apply_snapshot(self.agent,self.snapshot(),ORG)
        original=copy.deepcopy(load(self.agent));applied=applied_state(self.agent)
        snap=self.snapshot(2);snap['credentials'][0]['password']='new-failed-secret-password'
        self.agent.universal_apply_bundle.side_effect=ValueError('new-failed-secret-password native diagnostic')
        with self.assertRaises(RuntimeErrorSafe):apply_snapshot(self.agent,snap,ORG)
        saved=load(self.agent);failed=report(self.agent)
        for key in ('snapshot','revision','hash','status','observed','compiled_hash'):
            self.assertEqual(saved[key],original[key])
        self.assertEqual(applied_state(self.agent),applied)
        self.assertEqual((failed['revision'],failed['status']),(2,'failed'))
        self.assertEqual(failed['observed']['active_legs'],2)
        row=failed['observed']['connections'][0]
        self.assertEqual((row['connection_id'],row['state'],row['used']),(uid(3),'unknown',2))
        self.assertEqual(set(row),{'connection_id','state','used','inbound_used','outbound_used','available','checked_at'})
        self.assertEqual(set(failed),{'revision','status','hash','observed'})
        self.assertNotIn('new-failed-secret-password',json.dumps(saved))
        self.assertNotIn('native diagnostic',json.dumps(saved))
        with patch('universal_telephony_runtime.datetime') as clock:
            clock.now.return_value.isoformat.return_value='fresh-failure-observation'
            self.assertEqual(report(self.agent)['observed']['connections'][0]['checked_at'],'fresh-failure-observation')
        self.agent.universal_apply_bundle.side_effect=None
        result=apply_snapshot(self.agent,snap,ORG)
        self.assertEqual((result['revision'],result['status']),(2,'applied'))
        self.assertNotIn('failure',load(self.agent))
        self.assertEqual(applied_state(self.agent)['revision'],2)
    def test_busy_is_quiet_and_preserves_state(self):
        class Busy(Exception):pass
        init(self.agent,ORG);self.native();self.agent.Busy=Busy
        apply_snapshot(self.agent,self.snapshot(),ORG)
        before=load(self.agent)
        self.agent.universal_apply_bundle.side_effect=Busy('calls draining')
        with self.assertRaises(Busy):apply_snapshot(self.agent,self.snapshot(2),ORG)
        self.assertEqual(load(self.agent),before)
    def test_invalid_foreign_expired_and_stale_envelopes_do_not_mark_failed(self):
        init(self.agent,ORG);self.native();apply_snapshot(self.agent,self.snapshot(),ORG)
        before=load(self.agent)
        for update in ({'organization_id':uid(99)},{'expires_at':1},{'hash':'password'},{'revision':0}):
            snap=self.snapshot(2);snap.update(update)
            with self.subTest(update=update),self.assertRaises(RuntimeErrorSafe):apply_snapshot(self.agent,snap,ORG)
            self.assertEqual(load(self.agent),before)
    def test_failed_unchanged_verification_does_not_extend_last_successful_lease(self):
        init(self.agent,ORG);self.native();apply_snapshot(self.agent,self.snapshot(),ORG)
        before=load(self.agent)
        snap={k:before['snapshot'][k] for k in ('schema_version','organization_id','agent_id','revision','issued_at','expires_at')}
        snap.update(hash=before['hash'],unchanged=True,expires_at=time.time()+95)
        self.agent.universal_verify_bundle.side_effect=ValueError('private-native-error')
        self.agent.universal_renew_lease=Mock()
        with self.assertRaises(RuntimeErrorSafe):apply_snapshot(self.agent,snap,ORG)
        self.assertEqual(load(self.agent)['snapshot'],before['snapshot'])
        self.agent.universal_renew_lease.assert_not_called()
        self.assertEqual(report(self.agent)['status'],'failed')

if __name__=='__main__':unittest.main()
