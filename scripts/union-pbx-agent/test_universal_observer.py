import unittest
from unittest.mock import Mock,patch
from universal_observer import ObserverError,parse_channels,parse_count,stable_snapshot,native_command
class ObserverTests(unittest.TestCase):
 def test_unix_only_cli_eid_notice_preserves_strict_channel_validation(self):
  notice='Unable to open socket for seeding global EID. You will have to set it manually.\n'
  line='PJSIP/a!ctx!301!1!Up!Dial!x!x!!!3!5!bridge!123.1\n'
  for raw,count in [('',0),(line,1)]:
   def run(command):return notice+(str(count)+' active channels\n' if command.endswith('count') else raw)
   self.assertEqual(len(stable_snapshot(run,lambda:'epoch')['channels']),count)
   with patch('universal_observer.subprocess.run',side_effect=lambda args,**kwargs:Mock(stdout=run(args[-1]))):
    self.assertEqual(len(stable_snapshot(epoch=lambda:'epoch')['channels']),count)
  for raw in (notice+notice,'Unexpected socket failure\n',notice+'No such command\n'):
   with self.assertRaises(ObserverError):
    stable_snapshot(lambda cmd:('0 active channels\n' if cmd.endswith('count') else raw),lambda:'epoch')
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
