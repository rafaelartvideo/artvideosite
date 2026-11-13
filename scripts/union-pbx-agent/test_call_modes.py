import copy
import unittest
import uuid
import call_modes as cm
ORG='11111111-1111-4111-8111-111111111111'
BASE='uwi-'+ORG.replace('-','')
def snapshot():
 return dict(organization_id=ORG,revision=1,extensions=[dict(id=str(uuid.UUID(int=i+1)),endpoint_name='uw-'+str(i+1)*32,number=301+i,mode=mode,enabled=True,is_managed=True) for i,mode in enumerate(('both','receive_only','make_only'))])
class CompilerTests(unittest.TestCase):
 def test_source_and_receiving_have_independent_allowlists(self):
  s=snapshot();raw=cm.compile_context(s,ORG,BASE).decode();source,callee=raw.split('['+cm.context_name(ORG)+'-receive]')
  self.assertIn(s['extensions'][0]['endpoint_name'],source);self.assertIn(s['extensions'][2]['endpoint_name'],source);self.assertNotIn(s['extensions'][1]['endpoint_name'],source)
  self.assertIn(s['extensions'][0]['endpoint_name'],callee);self.assertIn(s['extensions'][1]['endpoint_name'],callee);self.assertNotIn(s['extensions'][2]['endpoint_name'],callee)
  self.assertIn('Goto('+BASE+',${EXTEN},1)',source);self.assertIn('Hangup(21)',callee)
 def test_decoration_preserves_recording_hooks_labels_and_queue_wait(self):
  raw=b'[own]\nexten => 301,1,Dial(PJSIP/uw-11111111111111111111111111111111,25,U(record-notice))\n same => n(fallback),Queue(own,r,,,30,,record-notice)\n'
  result=cm.decorate_routes(raw,ORG)
  self.assertIn(b'U(record-notice)b(',result);self.assertIn(b'Queue(own,rb(',result);self.assertIn(b',,,30,,record-notice)',result)
  self.assertEqual(cm.decorate_routes(result,ORG),result)
  with self.assertRaises(cm.CallModeError):cm.decorate_routes(raw.replace(b'U(record-notice)',b'b(foreign^s^1)'),ORG)
 def test_foreign_invalid_reserved_duplicate_and_oversized_catalogs_rejected(self):
  for change in ('foreign','mode','reserved','duplicate','oversized'):
   s=snapshot()
   if change=='foreign':s['organization_id']=str(uuid.uuid4())
   if change=='mode':s['extensions'][0]['mode']='unknown'
   if change=='reserved':s['extensions'][0]['number']=900
   if change=='duplicate':s['extensions'].append(s['extensions'][0])
   if change=='oversized':s['extensions']*=334
   with self.assertRaises(cm.CallModeError):cm.validate_snapshot(s,ORG)
  with self.assertRaises(cm.CallModeError):cm.compile_context(snapshot(),ORG,'uwi-'+uuid.uuid4().hex)
 def test_only_manual_union_binding_and_disabled_members(self):
  s=snapshot();s['extensions']=[dict(id=str(uuid.uuid4()),endpoint_name='union-301',number=301,mode='both',enabled=True,is_managed=False)]
  with self.assertRaises(cm.CallModeError):cm.validate_snapshot(s,ORG)
  cm.validate_snapshot(s,ORG,True);s['extensions'][0]['enabled']=False
  self.assertNotIn('="union-301"',cm.compile_context(s,ORG,'union-internal',True).decode())
 def test_split_modes_keep_internal_and_external_allowlists_separate(self):
  s=snapshot()
  for row in s['extensions']:row.update(internal_mode='receive_only',external_mode='make_only')
  raw=cm.compile_context(s,ORG,BASE).decode()
  self.assertIn('UWCM_EXTERNAL',raw)
  self.assertIn('external_source',raw);self.assertIn('internal_source',raw)
  internal=raw.split('n(internal_source)')[1].split('n(external_source)')[0]
  external=raw.split('n(external_source)')[1].split('n(allow)')[0]
  self.assertNotIn(s['extensions'][0]['endpoint_name'],internal)
  self.assertIn(s['extensions'][0]['endpoint_name'],external)
  receiving=raw.split('['+cm.context_name(ORG)+'-receive]')[1]
  self.assertIn(s['extensions'][0]['endpoint_name'],receiving.split('n(external_receive)')[0])
  self.assertNotIn(s['extensions'][0]['endpoint_name'],receiving.split('n(external_receive)')[1])
  marked=cm.decorate_routes(b'[own]\n same => n(allowed),Dial(PJSIP/trunk,30)\n',ORG,external=True)
  self.assertIn(b'n(allowed),Set(__UWCM_EXTERNAL=1)',marked)
  self.assertEqual(cm.decorate_routes(marked,ORG,external=True),marked)
if __name__=='__main__':unittest.main()
