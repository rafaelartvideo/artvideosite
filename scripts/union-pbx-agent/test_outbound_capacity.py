import dataclasses
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tempfile
import unittest

from outbound_capacity import Account, CapacityLedger, Group, Observation, RoutingError, may_failover

ORG = '11111111-1111-4111-8111-111111111111'
OTHER = '22222222-2222-4222-8222-222222222222'
EXT = '33333333-3333-4333-8333-333333333333'
GROUP = '44444444-4444-4444-8444-444444444444'
TRUNK = '55555555-5555-4555-8555-555555555555'
A = '66666666-6666-4666-8666-666666666666'
B = '77777777-7777-4777-8777-777777777777'
NOW = 1000


class CapacityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)/'capacity.sqlite'
        self.ledger = CapacityLedger(self.path)
        self.a = Account(A, ORG, TRUNK, 1, 1, (EXT,))
        self.b = Account(B, ORG, TRUNK, 1, 2, (EXT,))
        self.group = Group(GROUP, ORG, 1, 'priority', 2, 2, ((TRUNK, 2),), (self.a, self.b))
        self.obs = (Observation(ORG, A, 'registered', NOW), Observation(ORG, B, 'registered', NOW))

    def reserve(self, call='call-1', **kwargs):
        group = kwargs.pop('group', self.group)
        return self.ledger.reserve(group, kwargs.pop('extension', EXT), call,
                                   kwargs.pop('observations', self.obs), kwargs.pop('now', NOW),
                                   catalog=kwargs.pop('catalog', group.accounts), **kwargs)

    def test_priority_two_concurrent_accounts_and_third_rejected(self):
        self.assertEqual(self.reserve().account_id, A)
        self.assertEqual(self.reserve('call-2').account_id, B)
        with self.assertRaisesRegex(RoutingError, 'organization_capacity'): self.reserve('call-3')

    def test_single_account_multiple_channels_without_duplicate_registration(self):
        account = dataclasses.replace(self.a, channels=3)
        group = dataclasses.replace(self.group, accounts=(account,), channels=3,
                                    organization_channels=3, trunk_channels=((TRUNK, 3),))
        for index in range(3):
            self.assertEqual(self.reserve(str(index), group=group, observations=self.obs[:1]).account_id, A)
        with self.assertRaises(RoutingError): self.reserve('overflow', group=group, observations=self.obs[:1])

    def test_round_robin_changes_after_each_successful_reservation(self):
        group = dataclasses.replace(self.group, strategy='round_robin')
        for index, expected in enumerate((A, B, A, B)):
            result = self.reserve(str(index), group=group)
            self.assertEqual(result.account_id, expected)
            self.ledger.release(ORG, str(index))

    def test_unavailable_or_disabled_primary_uses_alternate(self):
        for state in ('registering', 'unregistered', 'authentication_failed', 'network_failed', 'disabled', 'divergent', 'unknown'):
            with self.subTest(state=state):
                observations = (dataclasses.replace(self.obs[0], state=state), self.obs[1])
                self.assertEqual(self.reserve(state, observations=observations).account_id, B)
                self.ledger.release(ORG, state)
        group = dataclasses.replace(self.group, accounts=(dataclasses.replace(self.a, enabled=False), self.b))
        self.assertEqual(self.reserve(group=group).account_id, B)

    def test_stale_future_missing_duplicate_and_foreign_observations_fail_closed(self):
        cases = [self.obs[:1], (self.obs[0], self.obs[0]),
                 (dataclasses.replace(self.obs[0], checked_at=NOW-31), self.obs[1]),
                 (dataclasses.replace(self.obs[0], checked_at=NOW+1), self.obs[1]),
                 (dataclasses.replace(self.obs[0], organization_id=OTHER), self.obs[1]),
                 (dataclasses.replace(self.obs[0], state='Registered password=secret'), self.obs[1])]
        for observations in cases:
            with self.subTest(observations=observations):
                with self.assertRaises(RoutingError) as caught: self.reserve(observations=observations)
                self.assertNotIn('secret', str(caught.exception))
        self.assertEqual(self.ledger.reservations(ORG), ())

    def test_reserve_is_idempotent_but_foreign_or_changed_call_identity_is_not(self):
        first = self.reserve()
        self.assertEqual(self.reserve(), first)
        for changes in ({'revision': 2}, {'id': OTHER}):
            with self.assertRaisesRegex(RoutingError, 'call_identity_conflict'):
                self.reserve(group=dataclasses.replace(self.group, **changes))
        self.assertEqual(len(self.ledger.reservations(ORG)), 1)

    def test_release_requires_own_company_is_idempotent_and_frees_capacity(self):
        self.reserve(); self.reserve('call-2')
        self.assertFalse(self.ledger.release(OTHER, 'call-1'))
        self.assertEqual(self.ledger.reservations(OTHER), ())
        self.assertTrue(self.ledger.release(ORG, 'call-1'))
        self.assertFalse(self.ledger.release(ORG, 'call-1'))
        self.assertEqual(self.reserve('call-3').account_id, A)

    def test_restart_and_long_calls_never_expire_capacity_by_time(self):
        self.reserve(); self.reserve('call-2')
        self.ledger = CapacityLedger(self.path)
        observations = tuple(dataclasses.replace(o, checked_at=NOW+86400) for o in self.obs)
        with self.assertRaises(RoutingError): self.reserve('call-3', observations=observations, now=NOW+86400)
        self.assertEqual(len(self.ledger.reservations(ORG)), 2)

    def test_independent_connections_atomically_reserve_establishing_calls(self):
        def attempt(index):
            ledger = CapacityLedger(self.path)
            try:
                return ledger.reserve(self.group, EXT, 'parallel-'+str(index), self.obs, NOW, catalog=self.group.accounts)
            except RoutingError:
                return None
        with ThreadPoolExecutor(max_workers=16) as pool:
            results = [r for r in pool.map(attempt, range(48)) if r]
        self.assertEqual(len(results), 2)
        self.assertEqual({r.account_id for r in results}, {A, B})
        self.assertEqual(len(self.ledger.reservations(ORG)), 2)

    def test_group_and_trunk_limits_apply_before_any_sip_dial(self):
        for field in ('channels', 'trunk_channels'):
            with self.subTest(field=field):
                group = dataclasses.replace(self.group, **{field: 1 if field == 'channels' else ((TRUNK, 1),)})
                self.reserve(group=group)
                with self.assertRaises(RoutingError): self.reserve('call-2', group=group)
                self.ledger.release(ORG, 'call-1')

    def test_full_company_observation_counts_other_group_and_inbound_calls(self):
        group = dataclasses.replace(self.group, accounts=(self.a,))
        observations = (self.obs[0], dataclasses.replace(self.obs[1], active_calls=('inbound-1','inbound-2')))
        with self.assertRaisesRegex(RoutingError, 'organization_capacity'):
            self.reserve(group=group, observations=observations, catalog=(self.a,self.b))

    def test_observed_call_and_reservation_are_not_double_counted(self):
        self.reserve()
        observations = (dataclasses.replace(self.obs[0], active_calls=('call-1',)), self.obs[1])
        self.assertEqual(self.reserve('call-2', observations=observations).account_id, B)

    def test_transfer_second_external_leg_has_its_own_reservation(self):
        self.reserve('leg-1'); self.reserve('leg-2')
        self.ledger.release(ORG, 'leg-1')
        self.assertEqual([r.call_id for r in self.ledger.reservations(ORG)], ['leg-2'])
        self.assertEqual(self.reserve('leg-3').account_id, A)

    def test_external_leg_cannot_be_observed_on_two_accounts(self):
        observations=tuple(dataclasses.replace(o,active_calls=('duplicated-leg',)) for o in self.obs)
        with self.assertRaisesRegex(RoutingError,'observation_divergent'): self.reserve(observations=observations)

    def test_company_limit_spans_multiple_groups(self):
        self.reserve()
        group = dataclasses.replace(self.group, id=OTHER)
        self.reserve('call-2', group=group)
        with self.assertRaisesRegex(RoutingError, 'organization_capacity'): self.reserve('call-3')

    def test_foreign_extension_account_and_catalog_divergence_rejected(self):
        with self.assertRaisesRegex(RoutingError, 'extension_not_authorized'): self.reserve(extension=OTHER)
        with self.assertRaisesRegex(RoutingError, 'foreign_organization'):
            self.reserve(group=dataclasses.replace(self.group, accounts=(dataclasses.replace(self.a, organization_id=OTHER),self.b)))
        with self.assertRaisesRegex(RoutingError, 'catalog_divergent'):
            self.reserve(catalog=(dataclasses.replace(self.a, channels=10),self.b))

    def test_invalid_configuration_and_injection_fail_before_storage(self):
        for changes in ({'channels': True}, {'channels': 0}, {'strategy': 'SHELL(evil)'},
                        {'revision': -1}, {'accounts': (self.a,self.a)}, {'trunk_channels': ()}):
            with self.subTest(changes=changes):
                with self.assertRaises(RoutingError): self.reserve(group=dataclasses.replace(self.group, **changes))
        for call in ('x\nGET VARIABLE password', "a';delete", '', '${SHELL(evil)}'):
            with self.assertRaises(RoutingError): self.reserve(call)
        self.assertEqual(self.ledger.reservations(ORG), ())

    def test_failed_reservation_does_not_advance_round_robin_cursor(self):
        group = dataclasses.replace(self.group, strategy='round_robin')
        self.reserve(group=group); self.reserve('call-2',group=group)
        with self.assertRaises(RoutingError): self.reserve('call-3',group=group)
        self.ledger.release(ORG,'call-1'); self.ledger.release(ORG,'call-2')
        self.assertEqual(self.reserve('call-4',group=group).account_id,A)

    def test_no_implicit_redial_on_ambiguous_failure_or_answer(self):
        for outcome in ('BUSY','NOANSWER','CANCEL','CHANUNAVAIL','CONGESTION','sip_timeout','network_failed','rejected'):
            self.assertFalse(may_failover(outcome, False, True))
            self.assertFalse(may_failover(outcome, False, False))
        for outcome in ('registration_unavailable','endpoint_unavailable','capacity_unavailable'):
            self.assertTrue(may_failover(outcome, False, False))
            self.assertFalse(may_failover(outcome, True, False))
            self.assertFalse(may_failover(outcome, False, True))


if __name__ == '__main__': unittest.main()
