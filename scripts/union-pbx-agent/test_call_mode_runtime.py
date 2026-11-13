import copy,json,os,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from contextlib import nullcontext
from unittest.mock import patch,Mock
import call_mode_runtime as rt
import recording_runtime as rr
from test_call_modes import snapshot,ORG,BASE
class Busy(Exception):pass
class RuntimeTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);root=Path(self.temp.name)
  for name in ('state','sip','extensions','backups'):(root/name).mkdir()
  a=self.a=SimpleNamespace(PROFILE_ID=ORG,STATE_DIR=root/'state',SIP_DIR=root/'sip',DIALPLAN_MANAGED=root/'extensions'/'internal.conf',DIALPLAN_MAIN=root/'extensions.conf',DIALPLAN_CONTEXT=BASE,MASTER_FILE=root/'sip'/'endpoints.conf',QUEUE_TEST_FILE=root/'extensions'/'queues.conf',AGENT_CONFIG=root/'agent.json',BACKUP_DIR=root/'backups',Busy=Busy,operation_lock=nullcontext,assert_no_calls=Mock(),require_root=Mock(),strip_ansi=lambda s:s,assert_fvx=Mock(),_verify_loaded_context=Mock(),grp=SimpleNamespace(getgrnam=lambda name:SimpleNamespace(gr_gid=os.getgid() if hasattr(os,'getgid') else 0)))
  a.AGENT_CONFIG.write_text(json.dumps({'organization_id':ORG}));a.DIALPLAN_MAIN.write_bytes(b'; existing\n')
  a.json_bytes=lambda value:(json.dumps(value)+'\n').encode()
  def write(path,raw,mode=0o600,gid=None):path.write_bytes(raw);path.chmod(mode)
  a.write_atomic=write;a.validate_local_owner=lambda row:self.assertEqual(row['organization_id'],ORG)
  self.s=snapshot();exts=a.STATE_DIR/'extensions';exts.mkdir()
  for row in self.s['extensions']:(exts/(row['id']+'.json')).write_text(json.dumps(dict(id=row['id'],organization_id=ORG,endpoint=row['endpoint_name'],number=row['number'],enabled=True)))
  self.s['extensions']=[{**r,'mode':'both'} for r in self.s['extensions']]
  a.render_master=lambda:('context='+rt.source_context(a)+'\n').encode()
  a.render_internal_routes=lambda:(rt.decorate(a,b'[own]\nexten => 301,1,Dial(PJSIP/uw-11111111111111111111111111111111,25)\n'),[301])
  a.render_queue_configs=lambda:(b'',rt.decorate(a,b'[queues]\nexten => 850,1,Queue(q,,,,30)\n'),[],[850])
  a.MASTER_FILE.write_bytes(a.render_master());a.DIALPLAN_MANAGED.write_bytes(a.render_internal_routes()[0]);a.QUEUE_TEST_FILE.write_bytes(a.render_queue_configs()[1])
  a.asterisk=lambda command:'context : '+a.MASTER_FILE.read_text().split('=',1)[1].strip()+'\n' if command.startswith('pjsip show endpoint ') else ''
  a.guarded_reload=Mock(return_value='Module res_pjsip.so reloaded successfully.')
  self.addCleanup(patch.stopall)
  patch.object(rr,'trusted',side_effect=lambda path,*args: path.stat()).start();patch.object(rr.os,'chown',create=True).start()
 def test_prepare_both_then_apply_modes_preserves_base_and_stale_rejected(self):
  rt.init(self.a,ORG,self.s);self.assertTrue(rt.source_context(self.a).startswith('uwcm-'));self.assertIn(b'b(uwcm-',self.a.QUEUE_TEST_FILE.read_bytes());self.assertEqual(rt.report(self.a)['status'],'applied')
  s=copy.deepcopy(self.s);s['revision']=2;s['extensions'][0]['mode']='receive_only';rt.apply_snapshot(self.a,s,ORG)
  self.assertEqual(rt.state(self.a)['snapshot'],s)
  with self.assertRaises(rt.CallModeRuntimeError):rt.apply_snapshot(self.a,self.s,ORG)
 def test_busy_and_catalog_mismatch_leave_every_file_unchanged(self):
  rt.init(self.a,ORG,self.s);old={p:p.read_bytes() for p in self.a.STATE_DIR.parent.rglob('*') if p.is_file()}
  s=copy.deepcopy(self.s);s['revision']=2;s['extensions'][0]['mode']='make_only';self.a.assert_no_calls.side_effect=Busy
  with self.assertRaises(Busy):rt.apply_snapshot(self.a,s,ORG)
  self.assertTrue(all(p.read_bytes()==raw for p,raw in old.items()));self.a.assert_no_calls.side_effect=None
  s['extensions'][0]['endpoint_name']='uw-'+'a'*32
  with self.assertRaises(rt.CallModeRuntimeError):rt.apply_snapshot(self.a,s,ORG)
 def test_failed_verification_rolls_back_source_and_permissions(self):
  old=self.a.MASTER_FILE.read_bytes();self.a._verify_loaded_context.side_effect=ValueError('verify rejected')
  with self.assertRaises(ValueError):rt.init(self.a,ORG,self.s)
  self.assertEqual(self.a.MASTER_FILE.read_bytes(),old);self.assertFalse(rt.file(self.a).exists());self.assertEqual(self.a.DIALPLAN_MAIN.read_bytes(),b'; existing\n')
 def test_manual_renderer_keeps_authentication_bytes(self):
  raw=b'[auth]\ntype=auth\npassword=private-fixture\n\n[union-301]\ntype=endpoint\ncontext=union-internal\n'
  result=rt.manual_render(raw,'uwcm-'+ORG.replace('-',''));self.assertEqual(result.split(b'[union-301]')[0],raw.split(b'[union-301]')[0]);self.assertIn(b'set_var=TRANSFER_CONTEXT=uwcm-',result)
 def test_initial_restriction_and_report_unknown_fields_rejected(self):
  s=copy.deepcopy(self.s);s['extensions'][0]['mode']='receive_only'
  with self.assertRaises(rt.CallModeRuntimeError):rt.init(self.a,ORG,s)
  with self.assertRaises(rt.CallModeRuntimeError):rt.report(self.a,{'revision':1,'status':'applied','foreign':True})
 def test_missing_native_reload_is_rejected_and_rolled_back(self):
  old=self.a.MASTER_FILE.read_bytes()
  self.a.guarded_reload.side_effect=lambda command: "No such command 'pjsip reload'" if command=='module reload res_pjsip.so' else 'Dialplan reloaded.'
  with self.assertRaises(rt.CallModeRuntimeError):rt.init(self.a,ORG,self.s)
  self.assertFalse(rt.file(self.a).exists());self.assertEqual(self.a.MASTER_FILE.read_bytes(),old)
  self.a.guarded_reload.assert_called_with('module reload res_pjsip.so')
if __name__=='__main__':unittest.main()
