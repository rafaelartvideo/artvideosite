import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch, Mock

import universal_runtime_adapter as adapter
from universal_capacity import Ledger
from universal_telephony import Bundle, context

ORG = '11111111-1111-4111-8111-111111111111'
OTHER = '22222222-2222-4222-8222-222222222222'
REAL_TRUSTED_GLOBAL = adapter.trusted_global


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        for name in ('sip', 'dial', 'state', 'backups', 'config'):
            (root / name).mkdir()
        self.agent = SimpleNamespace(
            PROFILE_ID=ORG, STATE_DIR=root/'state', SIP_DIR=root/'sip',
            DIALPLAN_MANAGED=root/'dial/internal.conf', DIALPLAN_MAIN=root/'dial/main.conf',
            PJSIP_FILE=root/'sip.conf', BACKUP_DIR=root/'backups', AGENT_CONFIG=root/'config/agent.json',
            grp=SimpleNamespace(getgrnam=lambda name: SimpleNamespace(gr_gid=os.getgid() if hasattr(os,'getgid') else 0)),
            json_bytes=lambda value: json.dumps(value).encode(), assert_no_calls=Mock(),
            asterisk=Mock(return_value=''), guarded_reload=Mock(return_value='reloaded successfully'),
            assert_fvx=Mock(), recording_support=lambda: None,
            _verify_loaded_context=Mock())
        def write(path, raw, mode=0o600, gid=None):
            Path(path).write_bytes(raw); Path(path).chmod(mode)
        self.agent.write_atomic = write
        self.agent.asterisk.side_effect=lambda command: 'There are 1 contexts' if command=='dialplan show' else 'Objects found: 0'
        for path in (self.agent.DIALPLAN_MAIN, self.agent.DIALPLAN_MANAGED, self.agent.PJSIP_FILE):
            path.write_text('; preserved\n')
        self.agent.AGENT_CONFIG.write_text(json.dumps({'organization_id':ORG}))
        self.addCleanup(patch.stopall)
        patch.object(adapter, 'CONFIG_ROOT', root/'config').start()
        patch.object(adapter, 'own').start()
        patch.object(adapter.transaction_runtime, 'trusted').start()
        patch.object(adapter, 'trusted_global').start()
        patch.object(adapter.transaction_runtime.os, 'chown', create=True).start()

    def test_native_transaction_rolls_back_disk_and_sip_memory(self):
        path = self.agent.SIP_DIR/'own.conf'; path.write_bytes(b'original')
        def reject(): raise ValueError('must not escape password')
        with self.assertRaisesRegex(adapter.runtime.RuntimeErrorSafe, '^universal_configuration_unavailable$'):
            adapter.transaction(self.agent, {path:(b'proposed',0o640,0,0)}, reject, sip=True)
        self.assertEqual(path.read_bytes(), b'original')
        calls = [call.args[0] for call in self.agent.guarded_reload.call_args_list]
        self.assertEqual(calls, ['dialplan reload','module reload res_pjsip.so','dialplan reload','module reload res_pjsip.so'])
        self.assertTrue(list(self.agent.BACKUP_DIR.glob('recordings-*/manifest.json')))

    def test_real_busy_deferral_does_not_reload_or_convert_to_failure(self):
        class Busy(Exception):pass
        self.agent.Busy=Busy
        self.agent.assert_no_calls.side_effect=Busy('active call')
        with self.assertRaises(Busy):adapter.transaction(self.agent,{},lambda:None,sip=True)
        self.agent.guarded_reload.assert_not_called()
        self.assertEqual(list(self.agent.BACKUP_DIR.iterdir()),[])

    def test_transaction_busy_does_not_write_or_backup(self):
        self.agent.assert_no_calls.side_effect = ValueError('active calls')
        target=self.agent.SIP_DIR/'new.conf'
        with self.assertRaises(adapter.runtime.RuntimeErrorSafe):
            adapter.transaction(self.agent,{target:(b'new',0o640,0,0)},lambda:None)
        self.assertFalse(target.exists())
        self.assertEqual(list(self.agent.BACKUP_DIR.iterdir()),[])

    @unittest.skipUnless(os.name=='posix','Native ownership validation')
    def test_service_owned_global_requires_exact_owner_group_and_private_mode(self):
        import pwd,stat
        info=SimpleNamespace(st_uid=115,st_gid=121,st_mode=stat.S_IFREG|0o600,st_nlink=1)
        path=self.agent.PJSIP_FILE
        self.agent.grp.getgrnam=lambda name:SimpleNamespace(gr_gid=121)
        with patch.object(Path,'stat',return_value=info),patch.object(pwd,'getpwnam',return_value=SimpleNamespace(pw_uid=115)):
            REAL_TRUSTED_GLOBAL(self.agent,path)
            for attr,bad in (('st_uid',999),('st_gid',999),('st_mode',stat.S_IFREG|0o640),('st_nlink',2)):
                before=getattr(info,attr);setattr(info,attr,bad)
                with self.assertRaises(adapter.runtime.RuntimeErrorSafe):REAL_TRUSTED_GLOBAL(self.agent,path)
                setattr(info,attr,before)

    def test_prepare_only_adds_empty_owned_includes_preserving_legacy(self):
        legacy=self.agent.SIP_DIR/'fvx.conf';legacy.write_bytes(b'legacy credentials')
        adapter.prepare(self.agent,ORG)
        sip,dial,_=adapter.paths(self.agent,ORG)
        self.assertEqual(sip.read_bytes(),b'');self.assertEqual(dial.read_bytes(),b'')
        self.assertEqual(legacy.read_bytes(),b'legacy credentials')
        self.assertIn('; preserved',self.agent.PJSIP_FILE.read_text())
        self.assertFalse(any('res_pjsip' in call.args[0] for call in self.agent.guarded_reload.call_args_list))

    def test_root_legacy_capacity_always_blocks_aggregate_activation(self):
        self.agent.PROFILE_ID=None
        self.agent.asterisk.side_effect=lambda command:'Objects found: 1\nunion-fvx-registration/'
        self.assertFalse(adapter.legacy_coverage(self.agent,ORG))
        self.agent.asterisk.side_effect=lambda command:'Objects found: 0'
        self.assertTrue(adapter.legacy_coverage(self.agent,ORG))
        self.agent.PROFILE_ID=ORG
        self.assertTrue(adapter.legacy_coverage(self.agent,ORG))
        (self.agent.STATE_DIR/'sip-trunks.json').write_text(json.dumps({'organization_id':ORG,'rows':[]}))
        self.assertTrue(adapter.legacy_coverage(self.agent,ORG))
        (self.agent.STATE_DIR/'sip-trunks.json').write_text(json.dumps({'organization_id':ORG,'rows':[{'enabled':True}]}))
        self.assertFalse(adapter.legacy_coverage(self.agent,ORG))

    def test_recording_composes_with_existing_capacity_hook(self):
        from recordings import decorate_routes
        policy={'schema_version':1}
        recording=SimpleNamespace(decorate=lambda agent,raw,scope: raw.replace(b'Dial(',b'Gosub(recording,outbound,1)\n same => n,Dial('))
        self.agent.recording_support=lambda:recording
        source=b' same => n,Dial(PJSIP/${EXTEN}@${UWUT_ENDPOINT},30,b(owned-bind^s^1))\n'
        result=adapter.render_routes(self.agent,Bundle(b'',source,()),{'organization_id':ORG})
        self.assertIn(b'Gosub(recording,outbound,1)',result)
        self.assertEqual(result.count(b'b(owned-bind^s^1)'),1)
        self.assertNotIn(b'uwcm-',result)

    def test_foreign_claims_cover_main_and_included_profiles(self):
        self.agent.PJSIP_FILE.write_text('[old-auth]\ntype=auth\nusername=101\n[old-reg]\nserver_uri=sip:provider.example:5060\noutbound_auth=old-auth\n')
        foreign=self.agent.SIP_DIR/'partner.conf'
        foreign.write_text('[peer]\ntype=identify\nmatch=192.0.2.0/24\n')
        self.assertIn(('provider.example','101'),adapter.claimed_identities(self.agent,ORG))
        self.assertEqual(adapter.claimed_networks(self.agent,ORG),('192.0.2.0/24',))
        foreign.write_text('[peer]\ntype=identify\nmatch=unresolvable.example\n')
        with self.assertRaises(adapter.runtime.RuntimeErrorSafe):adapter.claimed_networks(self.agent,ORG)

    def test_digest_claim_follows_auth_and_aor_references(self):
        path=self.agent.SIP_DIR/'digest.conf'
        path.write_text('[auth]\ntype=auth\nusername=account-2\n[aor]\ntype=aor\ncontact=sip:carrier.example:5060\n[ep]\ntype=endpoint\naors=aor\noutbound_auth=auth\n')
        self.assertIn(('carrier.example','account-2'),adapter.claimed_identities(self.agent,ORG))

    def test_claim_references_resolve_across_included_files_and_object_types(self):
        self.agent.PJSIP_FILE.write_text('[shared]\ntype=auth\nusername=account-2\n')
        (self.agent.SIP_DIR/'aor.conf').write_text('[shared]\ntype=aor\ncontact=sip:carrier.example:5060\n')
        (self.agent.SIP_DIR/'endpoint.conf').write_text('[shared]\ntype=endpoint\naors=shared\noutbound_auth=shared\n')
        self.assertIn(('carrier.example','account-2'),adapter.claimed_identities(self.agent,ORG))
        self.agent.PJSIP_FILE.write_text('')
        with self.assertRaises(adapter.runtime.RuntimeErrorSafe):adapter.claimed_identities(self.agent,ORG)

    def test_conflicting_foreign_auth_definitions_fail_closed(self):
        self.agent.PJSIP_FILE.write_text('[auth]\ntype=auth\nusername=first\n')
        (self.agent.SIP_DIR/'duplicate.conf').write_text('[auth]\ntype=auth\nusername=second\n')
        with self.assertRaises(adapter.runtime.RuntimeErrorSafe):adapter.claimed_identities(self.agent,ORG)

    def test_native_endpoint_uses_exact_context_when_cli_label_is_truncated(self):
        endpoint='uwu-'+ORG.replace('-','')+'-'+OTHER.replace('-','')+'-ep'
        inbound=endpoint[:-3]+'-in'
        for label in (endpoint,endpoint[:50],endpoint[:51]):
            detail=' Endpoint:  <Endpoint/CID......................................> <State>\n Endpoint:  '+label+'  Not in use  0 of inf\n context : '+inbound+'\n'
            self.assertTrue(adapter.native_endpoint_matches(detail,endpoint,inbound))
            self.assertFalse(adapter.native_endpoint_matches(detail.replace(inbound,inbound+'-other'),endpoint,inbound))
        self.assertFalse(adapter.native_endpoint_matches('Unable to find object '+endpoint,endpoint,inbound))
        self.assertFalse(adapter.native_endpoint_matches(' Endpoint: '+endpoint[:20]+'\n context : '+inbound+'\n',endpoint,inbound))

    def test_empty_verification_rejects_loaded_objects_and_cli_errors(self):
        for target in adapter.paths(self.agent,ORG)[:2]:target.write_bytes(b'')
        adapter.verify_empty(self.agent,ORG)
        self.agent.asterisk.side_effect=lambda command:'No such command'
        with self.assertRaises(adapter.runtime.RuntimeErrorSafe):adapter.verify_empty(self.agent,ORG)
        self.agent.asterisk.side_effect=lambda command:'Objects found: 1\nuwu-'+ORG.replace('-','')+'-old-ep'
        with self.assertRaises(adapter.runtime.RuntimeErrorSafe):adapter.verify_empty(self.agent,ORG)

    def test_inactive_empty_readiness_does_not_require_legacy_coverage(self):
        self.agent.PROFILE_ID=None
        self.agent.asterisk.side_effect=lambda command:'There are 1 contexts' if command=='dialplan show' else 'Objects found: 1\nunion-fvx-registration/'
        db=Ledger(Path(self.temp.name)/'ledger.sqlite')
        snapshot={'organization_id':ORG,'revision':1,'expires_at':9999999999,'credentials':[], 'extensions':[], 'document':{'routing_enabled':False,'connections':[]}}
        patch.object(adapter,'ledger',return_value=db).start()
        patch.object(adapter,'prepared_ready',return_value=True).start()
        patch.object(adapter.universal_observer,'stable_snapshot',return_value={'boot':'boot','active_uniqueids':[]}).start()
        for target in adapter.paths(self.agent,ORG)[:2]:target.write_bytes(b'')
        observed=adapter.observe(self.agent,ORG,snapshot)
        self.assertTrue(observed['ready'])
        self.assertFalse(observed['legacy_coverage'])

    def test_root_bridge_restores_original_and_rolls_back_atomically(self):
        import call_mode_runtime as modes
        self.agent.PROFILE_ID=None
        name='union-fvx-crm-outbound.conf'; target=self.agent.DIALPLAN_MANAGED.parent/name
        original=b'[union-fvx-crm-outbound]\nexten => _55.,1,Hangup(21)\n'
        target.write_bytes(original)
        patch.object(modes,'legacy_base',side_effect=lambda agent,name:target.read_bytes()).start()
        patch.object(modes,'external_proposal',side_effect=lambda agent,name,raw:(raw,{})).start()
        snapshot={'organization_id':ORG,'document':{'routing_enabled':True}}
        proposed,raw=adapter.root_bridge_proposal(self.agent,snapshot)
        self.assertIn(('Goto('+context(ORG)+',${EXTEN},1)').encode(),raw)
        with self.assertRaises(adapter.runtime.RuntimeErrorSafe):
            adapter.transaction(self.agent,proposed,lambda:(_ for _ in ()).throw(ValueError('reject')))
        self.assertEqual(target.read_bytes(),original)
        stored=self.agent.STATE_DIR/'universal-native-originals.json'
        self.assertFalse(stored.exists())
        adapter.transaction(self.agent,proposed,lambda:None)
        self.assertTrue(json.loads(stored.read_text())['active'])
        disabled={'organization_id':ORG,'document':{'routing_enabled':False}}
        restore,raw=adapter.root_bridge_proposal(self.agent,disabled)
        adapter.transaction(self.agent,restore,lambda:None)
        self.assertEqual(target.read_bytes(),original)
        self.assertFalse(json.loads(stored.read_text())['active'])

    def test_inactive_observation_blocks_reconciles_without_activation(self):
        db=Ledger(Path(self.temp.name)/'ledger.sqlite')
        snapshot={'organization_id':ORG,'revision':1,'expires_at':9999999999,
                  'credentials':[{'password':'DO_NOT_PERSIST'}], 'extensions':[],
                  'document':{'routing_enabled':False,'connections':[{'id':OTHER,'enabled':True}]}}
        patch.object(adapter,'ledger',return_value=db).start()
        patch.object(adapter,'prepared_ready',return_value=True).start()
        for target in adapter.paths(self.agent,ORG)[:2]:target.write_bytes(b'')
        patch.object(adapter.universal_observer,'stable_snapshot',return_value={'boot':'boot','active_uniqueids':[]}).start()
        observed=adapter.observe(self.agent,ORG,snapshot)
        self.assertTrue(observed['ready'])
        self.assertEqual(observed['connections'][0]['state'],'disabled')
        self.assertEqual(observed['connections'][0]['used'],0)
        self.assertFalse(any('show endpoint ' in call.args[0] for call in self.agent.asterisk.call_args_list))
        value=json.loads(adapter.paths(self.agent,ORG)[2].read_text())
        self.assertFalse(value['ready']);self.assertNotIn('credentials',value['snapshot'])
        self.assertNotIn('DO_NOT_PERSIST',adapter.paths(self.agent,ORG)[2].read_text())

    def test_available_capacity_respects_shared_upper_pool_and_unknown_direction(self):
        from test_universal_telephony import document
        d=document();d['routing_enabled']=True
        c=d['connections'][0];c['inbound_enabled']=True
        pool=d['capacity_pools'][0];pool['shared_limit']=1
        self.assertEqual(adapter.available_capacity(d,c,[]),1)
        leg={'pools':[pool['id']],'direction':'outbound'}
        self.assertEqual(adapter.available_capacity(d,c,[leg]),0)
        pool.update(mode='independent',shared_limit=None,inbound_limit=None,outbound_limit=3)
        self.assertIsNone(adapter.available_capacity(d,c,[]))
        c['inbound_enabled']=False
        self.assertEqual(adapter.available_capacity(d,c,[]),2)
        d['routing_enabled']=False
        self.assertEqual(adapter.available_capacity(d,c,[]),0)

    def test_observer_barrier_preserves_long_call_and_unknown_origin(self):
        db=Ledger(Path(self.temp.name)/'ledger.sqlite')
        pool={'id':'pool','mode':'shared','shared_limit':4,'inbound_limit':None,'outbound_limit':None,'confidence':'contract'}
        db.admit(ORG,1,'boot',9999999999,[pool],complete=True)
        db.reserve(ORG,1,'boot','long',OTHER,'outbound',('pool',),1,origin_uniqueid='source')
        db.bind(ORG,'long','boot','live')
        db.reserve(ORG,1,'boot','unknown',OTHER,'outbound',('pool',),1)
        db.reserve(ORG,1,'boot','abandoned',OTHER,'outbound',('pool',),1,origin_uniqueid='gone')
        snapshot={'organization_id':ORG,'revision':1,'expires_at':9999999999,'credentials':[], 'extensions':[], 'document':{'routing_enabled':False,'connections':[]}}
        patch.object(adapter,'ledger',return_value=db).start()
        patch.object(adapter,'prepared_ready',return_value=True).start()
        for target in adapter.paths(self.agent,ORG)[:2]:target.write_bytes(b'')
        def channels(**kwargs):
            with db.transaction() as connection:
                self.assertEqual(connection.execute('SELECT ready FROM universal_state').fetchone()[0],0)
            return {'boot':'boot','active_uniqueids':['live']}
        patch.object(adapter.universal_observer,'stable_snapshot',side_effect=channels).start()
        adapter.observe(self.agent,ORG,snapshot)
        self.assertEqual({leg['token'] for leg in db.legs(ORG)},{'long','unknown'})


if __name__=='__main__':unittest.main()
