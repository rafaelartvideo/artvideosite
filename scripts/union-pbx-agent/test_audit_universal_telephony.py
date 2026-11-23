import copy
import json
from pathlib import Path
import tempfile
import os
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock,patch

import audit_universal_telephony as audit
from universal_telephony import compile_document,context,names

ORG='11111111-1111-4111-8111-111111111111'


class AuditTests(unittest.TestCase):
    def test_compiled_native_scenario_only_targets_two_loopback_accounts(self):
        document,ext=audit.scenario(ORG,[50001,50002])
        endpoints=[dict(id=ext,number=701,endpoint_name='uw-'+ORG.replace('-',''),enabled=True,external_mode='both')]
        credentials=[dict(connection_id=c['id'],password='synthetic-password') for c in document['connections']]
        bundle=compile_document(document,ORG,endpoints,credentials,{'local-udp':'udp'},legacy_coverage=True)
        self.assertEqual(len(bundle.endpoints),2)
        self.assertNotEqual(document['connections'][0]['username'],document['connections'][1]['username'])
        self.assertTrue(all(c['host']=='127.0.0.1' and c['auth_mode']=='digest' and not c['inbound_enabled'] for c in document['connections']))
        self.assertNotIn(b'type=registration',bundle.pjsip)
        self.assertIn(b'127.0.0.1:50001',bundle.pjsip);self.assertIn(b'127.0.0.1:50002',bundle.pjsip)
        self.assertIn(b'AGI(/opt/union-pbx-agent/universal_capacity_agi.py',bundle.routes)
        self.assertIn(b'b('+context(ORG).encode()+b'-bind^s^1)',bundle.routes)
        self.assertEqual(document['outbound_routes'][0]['prefix'],'5511999999999')
        self.assertEqual([p['shared_limit'] for p in document['capacity_pools'][:3]],[2,1,1])

    def test_bundle_hash_is_deterministic_and_detects_any_module_change(self):
        first={'b.py':b'second','a.py':b'first'}
        self.assertEqual(audit.bundle_hash(first),audit.bundle_hash(dict(reversed(list(first.items())))))
        self.assertNotEqual(audit.bundle_hash(first),audit.bundle_hash({**first,'b.py':b'changed'}))
        self.assertIn('universal_capacity_agi.py',audit.BUNDLE)
        self.assertIn('outbound_capacity.py',audit.BUNDLE)

    def test_apply_requires_reviewed_hash_before_runtime_execution(self):
        with patch.object(audit,'sources',return_value={'a.py':b'reviewed'}),patch.object(audit.loader,'load_runtime') as native:
            with self.assertRaisesRegex(ValueError,'hash mismatch'):
                audit.load(audit.INSTALLED,'0'*64)
            native.assert_not_called()

    def test_verified_installed_loader_supplies_bytes_without_private_directory_rule(self):
        values={name:b'' for name in audit.BUNDLE};worker=SimpleNamespace()
        previous=audit.loader.bundle_sources
        def native(directory):
            self.assertEqual(audit.loader.bundle_sources(directory),{name:b'' for name in audit.loader.BUNDLE_NAMES})
            return worker,None,None,None
        with patch.dict(sys.modules),patch.object(audit,'sources',return_value=values),patch.object(audit.loader,'load_runtime',side_effect=native),patch.object(audit.loader,'private_directory',side_effect=AssertionError('Must not require installed 0700')):
            self.assertIs(audit.load(audit.INSTALLED,audit.bundle_hash(values)),worker)
        self.assertIs(audit.loader.bundle_sources,previous)

    @unittest.skipUnless(os.name=='posix','POSIX installed ownership and permissions')
    def test_sources_accepts_0755_and_rejects_writable_directory_or_source(self):
        if os.getuid()!=0:self.skipTest('Requires root ownership fixture')
        with tempfile.TemporaryDirectory() as temporary:
            directory=Path(temporary);directory.chmod(0o755);path=directory/'safe.py';path.write_bytes(b'safe');path.chmod(0o644)
            with patch.object(audit,'BUNDLE',('safe.py',)):
                self.assertEqual(audit.sources(directory),{'safe.py':b'safe'})
                path.chmod(0o666)
                with self.assertRaisesRegex(ValueError,'Untrusted audit bundle'):audit.sources(directory)
                path.chmod(0o644);directory.chmod(0o777)
                with self.assertRaisesRegex(ValueError,'Untrusted runtime directory'):audit.sources(directory)

    def test_cleanup_rejects_arbitrary_file_before_mutation(self):
        identity=ORG.replace('-','')
        state=dict(id=identity,organization_id=ORG,endpoints=[],cleaned=False,
                   files=[dict(path='/etc/passwd',accepted=[])],main=[])
        worker=SimpleNamespace(asterisk=Mock(),write_atomic=Mock())
        with self.assertRaisesRegex(ValueError,'Unexpected cleanup artifact'):
            audit.cleanup(worker,audit.ROOT/identity,state)
        worker.asterisk.assert_not_called();worker.write_atomic.assert_not_called()

    def test_cleanup_rejects_main_file_outside_asterisk_allowlist(self):
        identity=ORG.replace('-','')
        state=dict(id=identity,organization_id=ORG,endpoints=[],cleaned=False,files=[],main=[dict(path='/etc/shadow')])
        worker=SimpleNamespace(asterisk=Mock(),write_atomic=Mock())
        with self.assertRaisesRegex(ValueError,'Unexpected cleanup main file'):
            audit.cleanup(worker,audit.ROOT/identity,state)
        worker.asterisk.assert_not_called();worker.write_atomic.assert_not_called()

    def test_targets_are_fixed_unique_files_and_private_manifest(self):
        identity=ORG.replace('-','')
        targets=audit.targets(identity)
        self.assertEqual(len(targets),3)
        self.assertTrue(all(identity in str(path) or path.name==ORG+'.json' for path in targets))
        for malicious in ('../../etc/passwd','A'*32,'0'*31,'0'*33):
            with self.assertRaises(ValueError):audit.targets(malicious)


if __name__=='__main__':unittest.main()
