import json,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock,patch
import agent
class UniversalAgentTests(unittest.TestCase):
 def setUp(self):agent._SENT_REPORT_STATES.clear()
 def test_feature_is_opt_in_and_old_protocol_never_reads_registry(self):
  with patch.object(agent,'universal_support',Mock(),create=True) as support:
   self.assertIsNone(agent.universal_capabilities({'protocol_version':1,'features':[]},{'organization_id':'org'}));support.assert_not_called()
 def test_scoped_revision_hash_and_observation_are_separate_from_cadence(self):
  report={'revision':3,'status':'applied','hash':'a'*64,'observed':{'ready':True,'active_legs':0,'legacy_coverage':True,'connections':[{'checked_at':'first','state':'disabled'}]}}
  runtime=SimpleNamespace(capability=Mock(return_value=['universal_telephony_v1']),report=Mock(return_value=report),applied_state=lambda *a:{'revision':3,'hash':'a'*64})
  with patch.object(agent,'universal_support',return_value=runtime,create=True):
   cap={'protocol_version':2,'features':[]};self.assertIs(agent.universal_capabilities(cap,{'organization_id':'org'}),runtime)
   self.assertEqual(cap['universal_revision'],3);self.assertEqual(cap['universal_hash'],'a'*64);self.assertEqual(cap['universal_report'],report)
   stable=agent.universal_report_state(report);agent._mark_report_sent('universal',stable)
   report['observed']['connections'][0]['checked_at']='second'
   cap={'protocol_version':2,'features':[]};agent.universal_capabilities(cap,{'organization_id':'org'});self.assertNotIn('universal_report',cap)
   report['observed']['active_legs']=1
   cap={'protocol_version':2,'features':[]};agent.universal_capabilities(cap,{'organization_id':'org'});self.assertIn('universal_report',cap)
 def test_prepared_state_does_not_send_invalid_revision_zero_report(self):
  runtime=SimpleNamespace(capability=lambda *a:['universal_telephony_v1'],report=lambda *a:{'revision':0,'status':'prepared','hash':None,'observed':{}},applied_state=lambda *a:{'revision':0,'hash':None})
  with patch.object(agent,'universal_support',return_value=runtime,create=True):
   cap={'protocol_version':3,'features':[]};agent.universal_capabilities(cap,{'organization_id':'org'});self.assertNotIn('universal_report',cap);self.assertNotIn('universal_revision',cap)
 def test_failed_report_never_claims_failed_revision_as_applied(self):
  failed={'revision':4,'status':'failed','hash':'b'*64,'observed':{'connections':[]}}
  runtime=SimpleNamespace(capability=lambda *a:['universal_telephony_v1'],report=lambda *a:failed,applied_state=lambda *a:{'revision':3,'hash':'a'*64})
  with patch.object(agent,'universal_support',return_value=runtime,create=True):
   cap={'protocol_version':2,'features':[]};agent.universal_capabilities(cap,{'organization_id':'org'})
   self.assertEqual(cap['universal_revision'],3);self.assertEqual(cap['universal_hash'],'a'*64);self.assertEqual(cap['universal_report']['revision'],4)
if __name__=='__main__':unittest.main()
