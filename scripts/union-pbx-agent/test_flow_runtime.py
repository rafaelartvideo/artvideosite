import hashlib
import io
import json
import os
from contextlib import nullcontext,ExitStack
from types import SimpleNamespace
from pathlib import Path
import tempfile
import unittest
import uuid
import wave
from unittest.mock import patch

import flow_runtime as runtime


def audio():
    output=io.BytesIO()
    with wave.open(output,'wb') as wav:
        wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(8000)
        wav.writeframes(b'\x00\x00'*8000)
    return output.getvalue()


class FlowRuntimeTests(unittest.TestCase):
    def metadata(self):
        content=audio()
        return content,{'id':str(uuid.uuid4()),'organization_id':str(uuid.uuid4()),
                        'sha256':hashlib.sha256(content).hexdigest(),'size_bytes':len(content),
                        'duration_seconds':1}

    def test_audio_checks_digest_size_duration_and_pcm_format(self):
        content,metadata=self.metadata()
        runtime.validate_audio(content,metadata)
        for bad in (content+b'x',b'not a wave',content[:-2]):
            with self.assertRaises(runtime.FlowRuntimeError):runtime.validate_audio(bad,metadata)
        for field,value in [('sha256','a'*64),('size_bytes',True),('duration_seconds',40)]:
            with self.assertRaises(runtime.FlowRuntimeError):runtime.validate_audio(content,{**metadata,field:value})

    def test_asset_url_only_accepts_exact_private_object_on_expected_origin(self):
        _,meta=self.metadata();path=meta['organization_id']+'/'+meta['id']+'.wav'
        good='https://wmjmtcjpunmzvonlkjcu.supabase.co/storage/v1/object/sign/pbx-audio-prompts/'+path+'?token=opaque'
        self.assertEqual(runtime.validate_asset_url(good,meta),good)
        for bad in (good.replace('https:','http:'),good.replace('supabase.co','supabase.co.evil.test'),
                    good.replace(path,'other.wav'),good.replace('?token=opaque','?token=opaque#fragment'),
                    good.replace('/sign/','/public/')):
            with self.assertRaises(runtime.FlowRuntimeError):runtime.validate_asset_url(bad,meta)

    def test_cache_is_hash_named_and_revalidates_bytes_without_network(self):
        content,meta=self.metadata()
        with tempfile.TemporaryDirectory() as root:
            target=runtime.asset_path(Path(root),meta)
            target.parent.mkdir(parents=True);target.write_bytes(content)
            with patch.object(runtime,'download',side_effect=AssertionError('unexpected network')):
                self.assertEqual(runtime.prepare_asset(Path(root),meta,None),target)
            target.write_bytes(b'corrupt')
            with self.assertRaises(runtime.FlowRuntimeError):runtime.prepare_asset(Path(root),meta,None)

    def test_redirects_are_not_followed_and_credentials_are_rejected(self):
        _,meta=self.metadata()
        bad='https://user:password@wmjmtcjpunmzvonlkjcu.supabase.co/storage/v1/object/sign/pbx-audio-prompts/'+meta['organization_id']+'/'+meta['id']+'.wav?token=opaque'
        with self.assertRaises(runtime.FlowRuntimeError):runtime.validate_asset_url(bad,meta)
        with self.assertRaises(runtime.FlowRuntimeError):runtime.NoRedirect().redirect_request(None,None,302,'',{},'https://other.test')

    def test_symlink_asset_or_parent_is_rejected(self):
        _,meta=self.metadata()
        with tempfile.TemporaryDirectory() as root:
            root=Path(root);target=runtime.asset_path(root,meta)
            target.parent.mkdir(parents=True)
            try:target.symlink_to(root/'missing')
            except OSError:self.skipTest('symlinks unavailable')
            with self.assertRaises(runtime.FlowRuntimeError):runtime.asset_path(root,meta)


@unittest.skipUnless(os.name=='posix','Actual Linux file ownership and worker imports')
class FlowTransactionTests(unittest.TestCase):
    def exercise(self,failure=None):
        from test_agent_profiles import fresh_agent
        agent=fresh_agent();org=str(uuid.uuid4());agent.PROFILE_ID=org
        with tempfile.TemporaryDirectory() as folder,ExitStack() as stack:
            root=Path(folder);(root/'extensions.d').mkdir()
            agent.STATE_DIR=root/'state';agent.QUEUE_STATE_DIR=root/'state'/'queues'
            agent.AGENT_CONFIG=root/'agent.json';agent.AGENT_CONFIG.write_text(json.dumps({'organization_id':org}))
            agent.DIALPLAN_MANAGED=root/'extensions.d'/'internal.conf'
            agent.QUEUE_TEST_FILE=root/'absent-queues.conf';agent.DIALPLAN_CONTEXT='uwi-'+uuid.UUID(org).hex
            original=agent.render_internal_routes()[0];agent.DIALPLAN_MANAGED.write_bytes(original)
            flow={'id':str(uuid.uuid4()),'organization_id':org,'name':'Own flow','test_extension':910,
                  'enabled':True,'updated_at':'2026-11-10T20:00:00Z','config':{
                    'version':1,'mode':'direct','prompt_id':None,'closed_prompt_id':None,'options':[],
                    'fallback':{'kind':'hangup'},'closed_target':{'kind':'hangup'},'timezone':'UTC',
                    'schedule_enabled':False,'windows':[],'holidays':[],'timeout_seconds':8,'repeats':1}}
            state={'flow':flow,'extensions':[],'queues':[],'prompts':[]}
            stack.enter_context(patch.object(agent,'operation_lock',return_value=nullcontext()))
            stack.enter_context(patch.object(agent.grp,'getgrnam',return_value=SimpleNamespace(gr_gid=os.getgid())))
            cli=stack.enter_context(patch.object(agent,'asterisk',return_value=''))
            stack.enter_context(patch.object(agent,'assert_fvx'))
            idle=stack.enter_context(patch.object(agent,'assert_no_calls',side_effect=agent.Busy('active') if failure=='busy' else None))
            verify=stack.enter_context(patch.object(runtime,'verify',side_effect=runtime.FlowRuntimeError('mismatch') if failure=='verify' else None))
            if failure:
                with self.assertRaises((agent.Busy,runtime.FlowRuntimeError)):runtime.apply(agent,state,org)
                self.assertEqual(agent.DIALPLAN_MANAGED.read_bytes(),original)
                self.assertFalse(runtime.paths(agent)[0].exists())
                self.assertFalse((agent.STATE_DIR/'flows'/(flow['id']+'.json')).exists())
                if failure=='busy':cli.assert_not_called();verify.assert_not_called()
            else:
                runtime.apply(agent,state,org)
                self.assertIn(b'Goto(uwf-',runtime.paths(agent)[0].read_bytes())
                self.assertIn(b'include => uwfl-',agent.DIALPLAN_MANAGED.read_bytes())
                self.assertEqual(runtime.states(agent)[flow['id']],state)
                verify.assert_called_once();self.assertGreaterEqual(idle.call_count,2)

    def test_success_adds_exact_internal_dispatch_and_state(self):self.exercise()
    def test_verification_failure_restores_all_previous_files(self):self.exercise('verify')
    def test_live_call_blocks_before_any_engine_command_or_write(self):self.exercise('busy')


if __name__=='__main__':unittest.main()
