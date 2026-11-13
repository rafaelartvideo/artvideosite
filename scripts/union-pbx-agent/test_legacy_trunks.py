import base64
from contextlib import nullcontext
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import legacy_trunks as legacy

ORG = 'ffec0c6c-1111-4111-8111-111111111111'
TRUNK = 'aaaaaaaa-1111-4111-8111-111111111111'
FIRST = b'''[union-fvx-registration]
type=registration
server_uri=sip:sip2.fvx.com.br:5060
client_uri=sip:own-user@sip2.fvx.com.br
outbound_auth=union-fvx-auth
[union-fvx-auth]
type=auth
username=own-user
password=private-super-secret
[union-fvx-in]
type=endpoint
context=existing
'''
SECOND = b'''[union-fvx-out-test]
type=endpoint
from_user=own-user
outbound_auth=union-fvx-auth
[union-fvx-out-test]
type=aor
contact=sip:sip2.fvx.com.br:5060
'''


class Busy(Exception): pass


class LegacyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.agent = SimpleNamespace(STATE_DIR=root, SIP_DIR=root, PJSIP_FILE=root/'pjsip.conf', PROFILE_ID=None, AGENT_CONFIG=root/'agent.json', Busy=Busy, operation_lock=nullcontext, assert_no_calls=lambda: None)
        self.agent.AGENT_CONFIG.write_text(json.dumps({'organization_id': ORG}))
        self.agent.PJSIP_FILE.write_text('\n'.join('#include "pjsip.d/'+name+'"' for name in legacy.NAMES))
        for name, raw in zip(legacy.NAMES, (FIRST, SECOND)): (root/name).write_bytes(raw)
        # OS ownership is separately tested; portable transaction tests preserve
        # all modes/bytes with injected metadata and atomically replacing files.
        self.addCleanup(patch.stopall)
        patch.object(legacy, 'trusted', side_effect=lambda *args: SimpleNamespace(st_uid=0, st_gid=123)).start()
        patch.object(legacy, 'trusted_directory').start()
        patch.object(legacy.os, 'geteuid', return_value=0, create=True).start()
        patch.object(legacy.os, 'fchown', create=True).start()
        patch.object(legacy.os, 'fchmod', create=True).start()
        self.reloads = 0
        self.fail_reload_once = False
        self.agent.asterisk = self.cli
        entries = [dict(data=base64.b64encode(raw).decode(), sha256=legacy.hashlib.sha256(raw).hexdigest(), uid=0, gid=123, mode=0o640) for raw in (FIRST, SECOND)]
        legacy.save(self.agent, dict(organization_id=ORG, id=TRUNK, revision=1, enabled=True, files=entries, includes=legacy.includes(self.agent)))

    def cli(self, command):
        if command == 'pjsip reload':
            self.reloads += 1
            if self.fail_reload_once:
                self.fail_reload_once = False
                raise ValueError('private-super-secret')
            return ''
        enabled = (self.agent.SIP_DIR/legacy.NAMES[0]).read_bytes() == FIRST
        if command == 'pjsip show registrations': return ' union-fvx-registration/sip:sip2.fvx.com.br:5060 own-auth Registered\n' if enabled else ''
        if command == 'pjsip show endpoints': return ' Endpoint: union-fvx-in/own-user Not in use\n Endpoint: union-fvx-out-test Not in use\n' if enabled else ''
        raise AssertionError(command)

    def apply(self, enabled, revision):
        return legacy.apply_snapshot(self.agent, [dict(id=TRUNK, organization_id=ORG, revision=revision, enabled=enabled)], ORG)

    def test_off_on_exact_bytes_and_regular_metadata(self):
        result = self.apply(False, 2)[0]
        self.assertEqual((result['status'], result['enabled'], result['registration_state']), ('applied', False, 'unregistered'))
        self.assertEqual((self.agent.SIP_DIR/legacy.NAMES[1]).read_bytes(), legacy.EMPTY)
        self.assertEqual(legacy.capability(self.agent, ORG), ['legacy_trunks_v1'])
        result = self.apply(True, 3)[0]
        self.assertEqual(result['registration_state'], 'registered')
        self.assertEqual((self.agent.SIP_DIR/legacy.NAMES[0]).read_bytes(), FIRST)
        self.assertEqual((self.agent.SIP_DIR/legacy.NAMES[1]).read_bytes(), SECOND)
        self.assertEqual(legacy.report(self.agent)[0]['revision'], 3)
        self.assertNotIn('secret', json.dumps(result))

    def test_noop_revision_verifies_without_reload(self):
        self.assertEqual(self.apply(True, 2)[0]['revision'], 2)
        self.assertEqual(self.reloads, 0)

    def test_busy_defers_without_ack(self):
        def busy(): raise Busy()
        self.agent.assert_no_calls = busy
        self.assertEqual(self.apply(False, 2), [])
        self.assertEqual(legacy.report(self.agent)[0]['revision'], 1)
        self.assertEqual(self.reloads, 0)

    def test_reload_error_rolls_back_and_retains_failed_revision(self):
        self.fail_reload_once = True
        result = self.apply(False, 2)[0]
        self.assertEqual((result['status'], result['revision'], result['enabled']), ('failed', 2, True))
        self.assertEqual((self.agent.SIP_DIR/legacy.NAMES[0]).read_bytes(), FIRST)
        self.assertEqual(legacy.report(self.agent)[0]['status'], 'failed')
        self.assertEqual(self.apply(True, 3)[0]['status'], 'applied')

    def test_external_change_and_foreign_profile_fail_closed(self):
        (self.agent.SIP_DIR/legacy.NAMES[0]).write_bytes(FIRST+b'; external\n')
        self.assertEqual(legacy.capability(self.agent, ORG), [])
        with self.assertRaises(legacy.LegacyTrunkError): self.apply(False, 2)
        self.agent.PROFILE_ID = ORG
        self.assertEqual(legacy.capability(self.agent, ORG), [])

    def test_parser_rejects_injection_duplicates_and_redacts(self):
        for bad in (FIRST+b'#exec private-super-secret\n', FIRST+b'[extra]\ntype=endpoint\n', FIRST.replace(b'username=own-user', b'username=private-super-secret\nusername=x')):
            with self.assertRaises(legacy.LegacyTrunkError) as caught: legacy.parse(bad, SECOND)
            self.assertNotIn('private-super-secret', str(caught.exception))

    def test_partner_rejected_and_missing_preparation_not_initialized(self):
        self.agent.PROFILE_ID = ORG
        with self.assertRaises(legacy.LegacyTrunkError): legacy.init(self.agent, ORG, TRUNK)
        self.agent.PROFILE_ID = None
        legacy.state_path(self.agent).unlink()
        self.assertEqual(legacy.capability(self.agent, ORG), [])
        self.assertFalse(legacy.state_path(self.agent).exists())

    def test_preparation_checks_busy_before_reading_sources(self):
        legacy.state_path(self.agent).unlink()
        def busy(): raise Busy()
        self.agent.assert_no_calls = busy
        with self.assertRaises(Busy): legacy.init(self.agent, ORG, TRUNK)
        self.assertFalse(legacy.state_path(self.agent).exists())

    def test_metadata_limits_and_outbound_references(self):
        for first, second in ((FIRST.replace(b'own-user', b'x'*129), SECOND.replace(b'own-user', b'x'*129)),
                              (FIRST, SECOND.replace(b'outbound_auth=union-fvx-auth', b'outbound_auth=foreign')),
                              (FIRST, SECOND.replace(b'contact=sip:sip2.fvx.com.br', b'contact=sip:foreign.example'))):
            with self.assertRaises(legacy.LegacyTrunkError): legacy.parse(first, second)


class NativeTrustTests(unittest.TestCase):
    def test_only_exact_engine_paths_accept_package_owner(self):
        def metadata(path):
            mode = legacy.stat.S_IFREG | 0o600 if path.as_posix().endswith('pjsip.conf') else legacy.stat.S_IFDIR | 0o755
            uid = 115 if path.as_posix() in ('/etc/asterisk', '/etc/asterisk/pjsip.conf') else 0
            return SimpleNamespace(st_mode=mode, st_uid=uid, st_gid=121)
        fake_pwd = SimpleNamespace(getpwnam=lambda name: SimpleNamespace(pw_uid=115))
        with patch.dict('sys.modules', {'pwd': fake_pwd}), patch.object(Path, 'lstat', metadata), patch.object(Path, 'stat', metadata):
            legacy.trusted(Path('/etc/asterisk/pjsip.conf'))
            def bad_metadata(path):
                result = metadata(path)
                if path.as_posix() == '/etc/asterisk/pjsip.d/union-fvx.conf': result.st_uid = 115
                return result
            with patch.object(Path, 'lstat', bad_metadata):
                with self.assertRaises(legacy.LegacyTrunkError): legacy.trusted(Path('/etc/asterisk/pjsip.d/union-fvx.conf'))

    @unittest.skipUnless(legacy.os.name == 'posix', 'POSIX ownership contract')
    def test_world_writable_ancestor_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'file'
            path.write_bytes(b'')
            with self.assertRaises(legacy.LegacyTrunkError): legacy.trusted(path)


if __name__ == '__main__': unittest.main()
