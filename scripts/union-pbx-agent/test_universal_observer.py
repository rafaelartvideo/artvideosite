import unittest
from unittest.mock import Mock
from universal_observer import ObserverError,parse_channels,parse_count,stable_snapshot
class ObserverTests(unittest.TestCase):
 def test_parser_keeps_only_identity_and_state(self):
  line='PJSIP/uw-abc-00000001!own!5511999999999!1!Up!Dial!private-data!private-caller!!!3!5!bridge!1234.1\n'
  rows=parse_channels(line,1)
  self.assertEqual(rows,{'1234.1':{'channel':'PJSIP/uw-abc-00000001','state':'Up'}})
  self.assertNotIn('private',str(rows));self.assertNotIn('5511999999999',str(rows))
 def test_incomplete_malformed_and_duplicate_lists_fail_closed(self):
  line='PJSIP/a!ctx!301!1!Up!Dial!x!x!!!3!5!bridge!123.1\n'
  for raw,count in [('',1),(line,2),(line+line,2),('No such command',0)]:
   with self.assertRaises(ObserverError):parse_channels(raw,count)
  self.assertEqual(parse_channels('',0),{})
  self.assertEqual(parse_count('0 active channels\n0 active calls\n0 calls processed\n'),0)
  with self.assertRaises(ObserverError):parse_count('warning 0 active channels')
 def test_stability_and_boot_epoch_required(self):
  run=Mock(side_effect=['0 active channels\n','','0 active channels\n','0 active channels\n','','0 active channels\n'])
  result=stable_snapshot(run,lambda:'epoch')
  self.assertEqual(result['active_uniqueids'],[]);self.assertTrue(result['complete']);self.assertEqual(result['boot'],'epoch')
  run=Mock(side_effect=['0 active channels\n','','0 active channels\n','0 active channels\n','','0 active channels\n'])
  with self.assertRaises(ObserverError):stable_snapshot(run,Mock(side_effect=['first','second']))
 def test_callback_failure_never_returns_partial_snapshot(self):
  with self.assertRaises(ObserverError):stable_snapshot(Mock(side_effect=OSError('secret')),lambda:'epoch')
if __name__=='__main__':unittest.main()
