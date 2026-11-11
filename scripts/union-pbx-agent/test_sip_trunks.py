import copy
import unittest

from sip_trunks import TrunkConfigError, compile_trunks, national_number, trunk_names, lease_name

ORG = '11111111-1111-4111-8111-111111111111'
OTHER = '22222222-2222-4222-8222-222222222222'
TRUNK = '33333333-3333-4333-8333-333333333333'
EXT = '44444444-4444-4444-8444-444444444444'


class TrunkTests(unittest.TestCase):
    def setUp(self):
        self.row = dict(id=TRUNK, organization_id=ORG, enabled=True,
                        host='sip.example.com', port=5060, transport='transport-udp',
                        username='account_01', password='SECRET-12345', realm='example.com',
                        allowed_extension_ids=[EXT], inbound_enabled=False)
        self.extensions = {EXT: dict(organization_id=ORG, endpoint='uw-'+EXT.replace('-', ''))}

    def compile(self, rows=None):
        return compile_trunks(ORG, [self.row] if rows is None else rows,
                              self.extensions, {'transport-udp': 'udp'})

    def test_registration_and_outbound_are_scoped_and_inbound_denied(self):
        result = self.compile()
        names = trunk_names(ORG, TRUNK)
        sip = result.pjsip.decode()
        dial = result.dialplan.decode()
        self.assertIn('line=yes\nendpoint='+names['endpoint'], sip)
        self.assertIn('contact_user='+names['contact'], sip)
        self.assertIn('transport=transport-udp', sip)
        self.assertIn('password=SECRET-12345', sip)
        self.assertNotIn('SECRET', repr(result))
        self.assertNotIn('match=', sip)
        self.assertNotIn('type=identify', sip)
        self.assertIn('['+names['inbound']+']\nexten => _.,1,Hangup(21)', dial)
        self.assertIn('${CHANNEL(endpoint)}', dial)
        self.assertNotIn('CALLERID', dial)
        self.assertIn('uw-'+EXT.replace('-', ''), dial)
        self.assertIn('@'+names['endpoint']+',30)', dial)
        self.assertNotIn('union-fvx', sip+dial)
        self.assertEqual(result, self.compile())

    def test_disabled_and_empty_render_nothing(self):
        self.row['enabled'] = False
        self.assertEqual(self.compile().pjsip, b'')
        self.assertEqual(self.compile().dialplan, b'')
        self.assertEqual(self.compile([]).pjsip, b'')

    def test_disabled_owned_trunk_can_remove_stale_or_missing_body(self):
        self.row.update(enabled=False, password=None, host=None, port=None,
                        transport='removed-transport', allowed_extension_ids=[OTHER])
        self.extensions.clear()
        self.assertEqual(self.compile().pjsip, b'')
        self.assertEqual(self.compile().dialplan, b'')
        self.row['organization_id'] = OTHER
        with self.assertRaises(TrunkConfigError): self.compile()

    def test_foreign_org_extension_or_trunk_rejected(self):
        self.row['organization_id'] = OTHER
        with self.assertRaises(TrunkConfigError): self.compile()
        self.row['organization_id'] = ORG
        self.extensions[EXT]['organization_id'] = OTHER
        with self.assertRaises(TrunkConfigError): self.compile()

    def test_unsafe_fields_and_credentials_never_echoed(self):
        for field, value in [('host', 'sip.example.com\n[bad]'), ('username', 'x@other'),
                             ('realm', '${SHELL(evil)}'), ('password', 'SECRET\r\nfoo=bar'),
                             ('password', ''), ('password', 'secret;comment'),
                             ('password', 'SECRET#comment'), ('password', 'SECRET[section]'),
                             ('password', '${SHELL(evil)}'), ('host', 'bad..example'),
                             ('transport', 'unknown'), ('port', True), ('port', 65536),
                             ('inbound_enabled', True), ('enabled', 'true')]:
            with self.subTest(field=field, value=value):
                row = copy.deepcopy(self.row); row[field] = value
                with self.assertRaises(TrunkConfigError) as caught: self.compile([row])
                self.assertNotIn('SECRET', str(caught.exception))
        row = copy.deepcopy(self.row); del row['password']
        with self.assertRaises(TrunkConfigError): self.compile([row])

    def test_transport_protocol_and_authoritative_endpoint_are_validated(self):
        with self.assertRaises(TrunkConfigError):
            compile_trunks(ORG, [self.row], self.extensions, {'transport-udp': 'ws'})
        self.extensions[EXT]['endpoint'] = 'union-301'
        with self.assertRaises(TrunkConfigError): self.compile()

    def test_authoritative_endpoint_is_independent_of_extension_uuid(self):
        endpoint = 'uw-c7983c3e56cb424fbc8c7bb8ff9ec952'
        self.extensions[EXT]['endpoint'] = endpoint
        self.assertIn(endpoint, self.compile().dialplan.decode())
        self.extensions[EXT]['organization_id'] = OTHER
        with self.assertRaises(TrunkConfigError): self.compile()
        row = copy.deepcopy(self.row); row['match_header'] = 'anything'
        with self.assertRaises(TrunkConfigError): self.compile([row])

    def test_unknown_duplicate_or_overlapping_extension_routes_rejected(self):
        for ids in [[], [OTHER], [EXT, EXT]]:
            row = copy.deepcopy(self.row); row['allowed_extension_ids'] = ids
            with self.assertRaises(TrunkConfigError): self.compile([row])
        with self.assertRaises(TrunkConfigError): self.compile([self.row, self.row])
        second = copy.deepcopy(self.row); second['id'] = OTHER
        with self.assertRaises(TrunkConfigError): self.compile([self.row, second])

    def test_names_include_both_identities(self):
        self.assertNotEqual(trunk_names(ORG, TRUNK), trunk_names(OTHER, TRUNK))
        with self.assertRaises(TrunkConfigError): trunk_names('not-uuid', TRUNK)

    def test_only_one_enabled_default_trunk_per_organization(self):
        second_ext = '55555555-5555-4555-8555-555555555555'
        self.extensions[second_ext] = dict(organization_id=ORG, endpoint='uw-'+second_ext.replace('-', ''))
        second = copy.deepcopy(self.row)
        second.update(id=OTHER, allowed_extension_ids=[second_ext])
        with self.assertRaises(TrunkConfigError): self.compile([self.row, second])

    def test_national_only_fixed_mobile(self):
        for value in ['551132345678', '5579988037605']:
            self.assertTrue(national_number(value))
        for value in ['190', '192', '193', '08001234567', '03001234567', '550012345678',
                      '+551132345678', '551198765432', '551163245678', '551132345678\n',
                      '1551132345678', '${EXTEN}', '551132345678&evil']:
            self.assertFalse(national_number(value), value)

    def test_lease_gate_precedes_national_and_endpoint_authorization(self):
        source=self.compile().dialplan.decode()
        variable='${GLOBAL('+lease_name(ORG)+')}'
        self.assertIn('UW_SIP_LEASE_'+ORG.replace('-',''),source)
        self.assertIn('"'+variable+'" = ""',source)
        self.assertIn('REGEX("^[0-9]{1,12}$" '+variable+')',source)
        self.assertIn(variable+' <= ${EPOCH}',source)
        self.assertLess(source.index(variable),source.index('^55('))
        self.assertNotEqual(lease_name(ORG),lease_name(OTHER))
        with self.assertRaises(TrunkConfigError):lease_name('unsafe\n')


if __name__ == '__main__': unittest.main()
