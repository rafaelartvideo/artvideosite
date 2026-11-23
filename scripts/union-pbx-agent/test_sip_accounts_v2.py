import copy
import dataclasses
import unittest

from outbound_capacity import Account, Group, RoutingError
from sip_accounts_v2 import compile_accounts, validate_groups
from test_sip_trunks import ORG, OTHER, TRUNK, EXT

A = '66666666-6666-4666-8666-666666666666'
B = '77777777-7777-4777-8777-777777777777'


class AccountCompilerTests(unittest.TestCase):
    def setUp(self):
        self.rows = [dict(id=account, organization_id=ORG, enabled=True, host='sip.example.com', port=5060,
                          transport='udp', username='account_'+str(index), password='SECRET-EXAMPLE', realm='*',
                          allowed_extension_ids=[EXT], inbound_enabled=False) for index,account in enumerate((A,B))]
        self.catalog = tuple(Account(account,ORG,TRUNK,1,index+1,(EXT,)) for index,account in enumerate((A,B)))
        self.extensions = {EXT:dict(organization_id=ORG, endpoint='uw-'+EXT.replace('-',''))}

    def compile(self, rows=None, catalog=None, claims=frozenset()):
        return compile_accounts(ORG,self.rows if rows is None else rows,self.extensions,{'udp':'udp'},
                                self.catalog if catalog is None else catalog,claimed_identities=claims)

    def test_multiple_independent_accounts_share_logical_trunk_and_extension(self):
        bundle = self.compile()
        self.assertEqual(bundle.pjsip.count(b'type=registration\n'),2)
        self.assertEqual(bundle.pjsip.count(b'type=auth\n'),2)
        self.assertEqual(len(bundle.endpoints),2)
        self.assertEqual({a.trunk_id for a in bundle.accounts},{TRUNK})
        self.assertNotIn('SECRET',repr(bundle))

    def test_no_competing_outbound_routes_no_legacy_changes_and_inbound_denied(self):
        bundle = self.compile()
        self.assertNotIn(b'Dial(',bundle.inbound)
        self.assertNotIn(b'include =>',bundle.inbound)
        self.assertNotIn(b'_55.',bundle.inbound)
        self.assertNotIn(b'union-fvx',bundle.pjsip+bundle.inbound)
        self.assertNotIn(b'type=identify',bundle.pjsip)
        self.assertEqual(bundle.inbound.count(b'Hangup(21)'),4)

    def test_single_credential_with_multiple_channels_has_single_registration(self):
        bundle = self.compile(self.rows[:1],(dataclasses.replace(self.catalog[0],channels=3),))
        self.assertEqual(bundle.pjsip.count(b'type=registration\n'),1)
        self.assertEqual(bundle.accounts[0].channels,3)

    def test_same_sip_identity_is_not_duplicated_case_insensitive(self):
        rows = copy.deepcopy(self.rows); rows[1]['username'] = rows[0]['username'].upper()
        with self.assertRaisesRegex(RoutingError,'sip_identity_conflict'): self.compile(rows)
        with self.assertRaisesRegex(RoutingError,'sip_identity_conflict'):
            self.compile(claims=frozenset({('sip.example.com',5060,'account_0')}))

    def test_foreign_or_invalid_batch_never_returns_partially_compiled_secrets(self):
        for field,value in [('organization_id',OTHER),('password','SECRET\n[evil]'),('inbound_enabled',True)]:
            rows=copy.deepcopy(self.rows); rows[1][field]=value
            with self.assertRaises(RoutingError) as caught: self.compile(rows)
            self.assertNotIn('SECRET',str(caught.exception))

    def test_catalog_and_credential_authorizations_must_agree(self):
        with self.assertRaisesRegex(RoutingError,'catalog_divergent'):
            self.compile(catalog=(dataclasses.replace(self.catalog[0],enabled=False),self.catalog[1]))
        with self.assertRaisesRegex(RoutingError,'catalog_divergent'):
            self.compile(catalog=(dataclasses.replace(self.catalog[0],allowed_extensions=(OTHER,)),self.catalog[1]))

    def test_order_is_deterministic_and_disabled_cleanup_preserved(self):
        self.assertEqual(self.compile().pjsip,self.compile(list(reversed(self.rows))).pjsip)
        rows=copy.deepcopy(self.rows); rows[1].update(enabled=False,password=None,host=None)
        bundle=self.compile(rows,(self.catalog[0],dataclasses.replace(self.catalog[1],enabled=False)))
        self.assertEqual(bundle.pjsip.count(b'type=registration\n'),1)

    def test_group_limits_are_consistent_across_one_company(self):
        group=Group(TRUNK,ORG,1,'priority',2,2,((TRUNK,2),),self.catalog)
        second=dataclasses.replace(group,id=OTHER)
        self.assertEqual(len(validate_groups(ORG,(group,second),self.catalog)),2)
        for changed in (dataclasses.replace(second,organization_channels=3),
                        dataclasses.replace(second,trunk_channels=((TRUNK,3),)),
                        dataclasses.replace(second,organization_id=OTHER),group):
            with self.assertRaises(RoutingError): validate_groups(ORG,(group,changed),self.catalog)


    def test_identity_claim_cannot_be_bypassed_with_port_or_username_case(self):
        rows=copy.deepcopy(self.rows)
        rows[1].update(username=rows[0]['username'].upper(),port=5061)
        with self.assertRaisesRegex(RoutingError,'sip_identity_conflict'):
            self.compile(rows)
        with self.assertRaisesRegex(RoutingError,'sip_identity_conflict'):
            self.compile(claims=frozenset({('SIP.EXAMPLE.COM',5061,'ACCOUNT_0')}))

    def test_malformed_authoritative_claims_fail_closed_without_echoing_inputs(self):
        for claim in ('private-fixture', ('host',5060), ('host',True,'user'), ('',5060,'user'), ('host',5060,'')):
            with self.subTest(claim=claim), self.assertRaisesRegex(RoutingError,'invalid_configuration') as caught:
                self.compile(claims=frozenset({claim}))
            self.assertNotIn('private-fixture',str(caught.exception))

if __name__ == '__main__': unittest.main()
