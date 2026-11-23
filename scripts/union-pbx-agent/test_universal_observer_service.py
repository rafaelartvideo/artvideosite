import tempfile,unittest
from pathlib import Path
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import Mock
from universal_observer_service import refresh
class ObserverServiceTests(unittest.TestCase):
 def test_refresh_persists_only_observation_and_never_renews_cloud_lease(self):
  snapshot={'document':{'routing_enabled':True},'expires_at':123,'revision':4}
  state={'organization_id':'org','snapshot':snapshot,'observed':{},'status':'applied'}
  runtime=SimpleNamespace(load=lambda agent:state,write=Mock(),paths=lambda agent:Path('/fixture/state'))
  adapter=SimpleNamespace(observe=Mock(return_value={'ready':True,'active_legs':1}),ledger=Mock(),paths=lambda agent,org:(None,None,Path('/nonexistent/manifest')))
  worker=SimpleNamespace(operation_lock=nullcontext,runtime_api=lambda:None)
  self.assertTrue(refresh(worker,runtime,adapter));self.assertEqual(state['snapshot']['expires_at'],123)
  self.assertEqual(state['observed']['active_legs'],1);adapter.observe.assert_called_once_with(None,'org',snapshot)
 def test_inactive_configs_do_not_create_native_polling(self):
  runtime=SimpleNamespace(load=lambda agent:{'snapshot':{'document':{'routing_enabled':False}}})
  adapter=SimpleNamespace(observe=Mock());worker=SimpleNamespace(operation_lock=nullcontext,runtime_api=lambda:None)
  self.assertFalse(refresh(worker,runtime,adapter));adapter.observe.assert_not_called()
 def test_observation_failure_blocks_admission_before_propagating(self):
  state={'organization_id':'org','snapshot':{'document':{'routing_enabled':True}},'observed':{}}
  runtime=SimpleNamespace(load=lambda agent:state)
  database=SimpleNamespace(block=Mock());adapter=SimpleNamespace(observe=Mock(side_effect=ValueError('private')),ledger=lambda agent:database,paths=lambda agent,org:(None,None,Path('/nonexistent/manifest')))
  worker=SimpleNamespace(operation_lock=nullcontext,runtime_api=lambda:None)
  with self.assertRaises(ValueError):refresh(worker,runtime,adapter)
  database.block.assert_called_once_with('org')
if __name__=='__main__':unittest.main()
