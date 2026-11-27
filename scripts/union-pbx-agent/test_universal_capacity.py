import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from universal_capacity import Ledger, CapacityError


class UniversalCapacityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'capacity.sqlite'
        self.ledger = Ledger(self.path)
        self.pools = [{'id':'company','mode':'shared','shared_limit':2,'inbound_limit':None,'outbound_limit':None,'confidence':'contract'},
                      {'id':'account','mode':'independent','shared_limit':None,'inbound_limit':1,'outbound_limit':1,'confidence':'provider'}]
        self.ledger.admit('org', 1, 'boot', 200, self.pools, complete=True)

    def tearDown(self): self.tmp.cleanup()

    def reserve(self, token, direction='outbound', ledger=None):
        return (ledger or self.ledger).reserve('org',1,'boot',token,'account',direction,('company','account'),100)

    def test_inbound_and_outbound_share_company_and_have_directional_limits(self):
        self.reserve('out'); self.reserve('in','inbound')
        with self.assertRaises(CapacityError): self.reserve('third')
        self.assertEqual(len(self.ledger.legs('org')),2)

    def test_one_account_ten_channels_admits_exactly_ten_under_concurrency(self):
        pools=[dict(self.pools[0],shared_limit=20),dict(self.pools[0],id='ten-channel-account',shared_limit=10)]
        self.ledger.admit('org',2,'boot',200,pools,complete=True)
        def attempt(i):
            try:return Ledger(self.path).reserve('org',2,'boot','ten-'+str(i),'one-credential','outbound',('company','ten-channel-account'),100)
            except CapacityError:return None
        with ThreadPoolExecutor(max_workers=16) as workers:results=list(workers.map(attempt,range(32)))
        self.assertEqual(sum(result is not None for result in results),10)
        self.assertEqual(len(self.ledger.legs('org')),10)

    def test_distinct_operators_still_share_company_upper_bound(self):
        pools=[self.pools[0]]+[dict(self.pools[0],id=name,shared_limit=10) for name in ('provider-a','provider-b')]
        self.ledger.admit('org',2,'boot',200,pools,complete=True)
        for index,provider in enumerate(('provider-a','provider-b')):
            self.ledger.reserve('org',2,'boot','operator-'+str(index),provider,'inbound' if index else 'outbound',('company',provider),100)
        with self.assertRaisesRegex(CapacityError,'capacity_exhausted'):
            self.ledger.reserve('org',2,'boot','overflow','provider-b','outbound',('company','provider-b'),100)

    def test_atomic_parallel_admission(self):
        def attempt(i):
            try: return self.reserve(str(i),ledger=Ledger(self.path))
            except CapacityError: return None
        with ThreadPoolExecutor(max_workers=8) as pool: results=list(pool.map(attempt,range(24)))
        self.assertEqual(sum(v is not None for v in results),1)

    def test_bind_and_exact_final_hangup_only(self):
        self.reserve('leg'); self.ledger.bind('org','leg','boot','unique-1')
        self.assertFalse(self.ledger.finish('org','leg','boot','unique-2'))
        self.assertTrue(self.ledger.finish('org','leg','boot','unique-1'))
        self.assertFalse(self.ledger.finish('org','leg','boot','unique-1'))

    def test_restart_retains_capacity_and_requires_explicit_complete_reconcile(self):
        self.reserve('leg'); self.ledger.bind('org','leg','boot','unique-1')
        restarted=Ledger(self.path)
        restarted.block('org')
        with self.assertRaises(CapacityError): self.reserve('next',ledger=restarted)
        with self.assertRaises(CapacityError): restarted.reconcile('org','boot',(),complete=False,establishing_quiescent=True)
        self.assertEqual(len(restarted.legs('org')),1)
        restarted.reconcile('org','boot',(),complete=True,establishing_quiescent=True,sampled_legs=restarted.legs('org'))
        restarted.admit('org',1,'boot',200,self.pools,complete=True)
        self.reserve('next',ledger=restarted)

    def test_lease_revision_unknown_capacity_and_idempotency(self):
        self.reserve('leg'); self.assertEqual(self.reserve('leg')['token'],'leg')
        for revision,now in ((2,100),(1,200)):
            with self.assertRaises(CapacityError): self.ledger.reserve('org',revision,'boot','new','account','outbound',('company','account'),now)
        bad=[dict(self.pools[0],confidence='unknown')]
        with self.assertRaises(CapacityError): self.ledger.admit('org',2,'boot',300,bad,complete=True)

    def test_changed_catalog_cannot_replace_live_leg_policy(self):
        self.reserve('leg')
        with self.assertRaises(CapacityError): self.ledger.admit('org',2,'boot',200,[dict(self.pools[0],shared_limit=1)],complete=True)

    def test_operational_revision_retains_active_legs_and_enforces_same_capacity(self):
        self.reserve('leg');self.ledger.bind('org','leg','boot','unique-1')
        self.ledger.admit('org',2,'boot',200,self.pools,complete=True,operational=True)
        self.assertEqual(self.ledger.legs('org')[0]['token'],'leg')
        with self.assertRaises(CapacityError):self.ledger.reserve('org',2,'boot','over','account','outbound',('company','account'),100)
        with self.assertRaises(CapacityError):self.ledger.admit('org',3,'boot',200,[dict(self.pools[0],shared_limit=10)],complete=True,operational=True)
        self.assertTrue(self.ledger.finish('org','leg','boot','unique-1'))
        self.ledger.reserve('org',2,'boot','next','account','outbound',('company','account'),100)

    def test_round_robin_selection_and_capacity_are_one_transaction(self):
        pools=[dict(self.pools[0],shared_limit=10)]
        self.ledger.admit('org',2,'boot',200,pools,complete=True)
        options=[('one',('company',)),('two',('company',))]
        first=self.ledger.reserve_route('org',2,'boot','a',options,100,group_id='g',strategy='round_robin',origin_uniqueid='origin-a')
        second=self.ledger.reserve_route('org',2,'boot','b',options,100,group_id='g',strategy='round_robin',origin_uniqueid='origin-b')
        self.assertEqual([first['connection'],second['connection']],['one','two'])

    def test_lease_renewal_does_not_reopen_reconciliation_barrier(self):
        self.ledger.block('org');self.ledger.renew('org',1,'boot',300)
        with self.assertRaises(CapacityError):self.reserve('blocked')

    def test_unbound_leg_is_not_deleted_from_absence_alone(self):
        self.reserve('pending')
        self.ledger.reconcile('org','boot',(),complete=True,establishing_quiescent=True,sampled_legs=self.ledger.legs('org'))
        self.assertEqual(len(self.ledger.legs('org')),1)
        self.ledger.reconcile('org','boot',(),complete=True,establishing_quiescent=True,abandoned_tokens=('pending',),sampled_legs=self.ledger.legs('org'))
        self.assertEqual(self.ledger.legs('org'),())


    def test_unknown_unused_direction_is_denied_only_when_consumed(self):
        self.pools[1]['inbound_limit']=None
        self.ledger.admit('org',2,'boot',200,self.pools,complete=True)
        self.ledger.reserve('org',2,'boot','out','account','outbound',('company','account'),100)
        with self.assertRaisesRegex(CapacityError,'capacity_unknown'):
            self.ledger.reserve('org',2,'boot','in','account','inbound',('company','account'),100)

    def test_binding_after_native_sample_started_keeps_live_reservation(self):
        self.reserve('pending')
        self.ledger.block('org')
        sampled=self.ledger.legs('org')
        # Both complete native samples preceded allocation of the provider leg.
        active=('caller',)
        self.ledger.bind('org','pending','boot','new-live-provider')
        self.ledger.reconcile('org','boot',active,complete=True,establishing_quiescent=True,sampled_legs=sampled)
        self.assertEqual(self.ledger.legs('org')[0]['uniqueid'],'new-live-provider')
        self.ledger.admit('org',1,'boot',200,self.pools,complete=True)
        with self.assertRaisesRegex(CapacityError,'capacity_exhausted'):
            self.reserve('must-not-overbook')
        # A later authoritative sample taken after the binding may release it.
        self.ledger.block('org')
        self.ledger.reconcile('org','boot',(),complete=True,establishing_quiescent=True,sampled_legs=self.ledger.legs('org'))
        self.assertEqual(self.ledger.legs('org'),())

    def test_unbound_abandonment_cannot_allow_a_late_provider_bind(self):
        self.reserve('pending')
        self.ledger.block('org')
        sampled=self.ledger.legs('org')
        self.ledger.reconcile('org','boot',(),complete=True,establishing_quiescent=True,
                              sampled_legs=sampled,abandoned_tokens=('pending',))
        with self.assertRaisesRegex(CapacityError,'leg_conflict'):
            self.ledger.bind('org','pending','boot','late-provider')

    def test_missing_sample_fence_cannot_release_capacity(self):
        self.reserve('live');self.ledger.bind('org','live','boot','live-id')
        with self.assertRaisesRegex(CapacityError,'reconciliation_incomplete'):
            self.ledger.reconcile('org','boot',(),complete=True,establishing_quiescent=True)
        self.assertEqual(len(self.ledger.legs('org')),1)

if __name__ == '__main__': unittest.main()
