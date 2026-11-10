#!/usr/bin/env python3
"""Opt-in engine audit: synthetic private audio, no employee or external call."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import tempfile
import time
import uuid
import wave

import agent
import flow_runtime
from call_flows import flow_context


def run(originate=False):
    agent.require_root()
    org=str(uuid.uuid4());flow_id=str(uuid.uuid4());prompt_id=str(uuid.uuid4())
    agent.select_profile(org)
    main=agent.DIALPLAN_MAIN
    directory=Path(tempfile.mkdtemp(prefix='union-flow-audit-',dir='/root'))
    agent.STATE_DIR=directory/'state';agent.QUEUE_STATE_DIR=agent.STATE_DIR/'queues'
    agent.AGENT_CONFIG=directory/'agent.json'
    agent.AGENT_CONFIG.write_text(json.dumps({'organization_id':org}))
    agent.DIALPLAN_MANAGED=main.parent/'extensions.d'/('union-flow-audit-'+uuid.UUID(org).hex+'.conf')
    agent.QUEUE_TEST_FILE=directory/'no-queues.conf'
    flow_file,dispatch,_=flow_runtime.attachment(agent)
    driver='uwfd-'+uuid.UUID(org).hex
    include='#include "extensions.d/'+agent.DIALPLAN_MANAGED.name+'"'
    group=agent.grp.getgrnam('asterisk').gr_gid
    original=main.read_bytes();info=main.stat()
    old_fvx=agent.asterisk('pjsip show registrations')
    sounds_created=not flow_runtime.SOUNDS_ROOT.exists()
    asset=None;main_written=None;passed=False;call_result=None;logger_name=None
    try:
        with agent.operation_lock():
            agent.assert_no_calls()
            if main.is_symlink() or agent.DIALPLAN_MANAGED.exists() or flow_file.exists():raise RuntimeError('Audit paths not clean')
            if sounds_created:
                flow_runtime.SOUNDS_ROOT.mkdir(mode=0o750)
                os.chown(flow_runtime.SOUNDS_ROOT,0,group);flow_runtime.SOUNDS_ROOT.chmod(0o750)
            content=io.BytesIO()
            with wave.open(content,'wb') as audio:
                audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(8000)
                audio.writeframes(b'\0\0'*8000)
            raw=content.getvalue()
            prompt={'id':prompt_id,'organization_id':org,'sha256':hashlib.sha256(raw).hexdigest(),
                    'duration_seconds':1,'size_bytes':len(raw)}
            asset=flow_runtime.asset_path(flow_runtime.SOUNDS_ROOT,prompt)
            asset.parent.mkdir(mode=0o750);os.chown(asset.parent,0,group);asset.parent.chmod(0o750)
            agent.write_atomic(asset,raw,0o640,group)
            initial=agent.render_internal_routes()[0]
            # A local driver sends one RTP digit after the menu answers. It has
            # no Dial, trunk, real endpoint, or external destination.
            driver_text=('\n['+driver+']\nexten => s,1,Wait(0.5)\n same => n,SendDTMF(1)\n same => n,Wait(0.5)\n same => n,Hangup()\n').encode()
            # Keep driver in its own included file so reconciliation cannot
            # erase it when regenerating the internal dispatch.
            driver_file=agent.DIALPLAN_MANAGED.with_name('union-flow-driver-'+uuid.UUID(org).hex+'.conf')
            agent.write_atomic(driver_file,driver_text,0o640,group)
            agent.write_atomic(agent.DIALPLAN_MANAGED,initial,0o640,group)
            main_written=original+b'\n'+(include+'\n#include "extensions.d/'+driver_file.name+'"\n').encode()
            agent.write_atomic(main,main_written,info.st_mode&0o777,info.st_gid)
            agent.guarded_reload('dialplan reload')
        config={'version':1,'mode':'menu','prompt_id':prompt_id,'closed_prompt_id':None,
                'options':[{'digit':'1','target':{'kind':'hangup'}}],
                'fallback':{'kind':'hangup'},'closed_target':{'kind':'hangup'},
                'timezone':'America/Sao_Paulo','schedule_enabled':True,
                'windows':[{'days':[1,2,3,4,5,6,7],'start':'00:00','end':'24:00'}],
                'holidays':['2099-01-01'],'timeout_seconds':5,'repeats':0}
        flow={'id':flow_id,'organization_id':org,'name':'Synthetic engine audit','test_extension':910,
              'enabled':True,'updated_at':'2026-11-10T20:00:00Z','config':config}
        flow_runtime.apply(agent,{'flow':flow,'extensions':[],'queues':[],'prompts':[prompt]},org)
        flow_runtime.verify(agent,org)
        if originate:
            context=flow_context(org,flow_id)
            logger_name='union-flow-audit-'+uuid.UUID(org).hex
            agent.asterisk('logger add channel '+logger_name+' verbose(3),dtmf,warning,error')
            log=Path('/var/log/asterisk')/logger_name
            if not log.is_file():raise RuntimeError('Temporary audit logger not available')
            log.chmod(0o640);offset=log.stat().st_size
            with agent.operation_lock():
                agent.assert_no_calls()
                agent.asterisk('channel originate Local/s@'+context+'/n extension s@'+driver)
            deadline=time.monotonic()+8
            while time.monotonic()<deadline:
                time.sleep(.2)
                with log.open('rb') as stream:stream.seek(offset);trace=stream.read(2000000).decode(errors='replace')
                if '[1@'+context+':' in trace:break
            call_result={'digit_route_observed':'[1@'+context+':' in trace,
                         'audio_playback_observed':str(asset.relative_to(flow_runtime.SOUNDS_ROOT.parent).with_suffix('')) in trace}
            if not all(call_result.values()):raise RuntimeError('Synthetic digit/playback not confirmed')
            while time.monotonic()<deadline:
                try:agent.assert_no_calls();break
                except agent.Busy:time.sleep(.2)
            agent.assert_no_calls()
        passed=True
    finally:
        with agent.operation_lock():
            agent.assert_no_calls()
            if main_written is not None:
                if main.read_bytes()!=main_written:raise RuntimeError('External main change: audit cleanup needs review')
                agent.write_atomic(main,original,info.st_mode&0o777,info.st_gid)
            for path in (agent.DIALPLAN_MANAGED,flow_file,locals().get('driver_file')):
                if path is not None:path.unlink(missing_ok=True)
            agent.guarded_reload('dialplan reload')
            agent.assert_fvx(old_fvx)
            if main.read_bytes()!=original:raise RuntimeError('Main rollback mismatch')
            if asset is not None:
                asset.unlink(missing_ok=True)
                asset.parent.rmdir()
            if sounds_created:flow_runtime.SOUNDS_ROOT.rmdir()
            if logger_name is not None:agent.asterisk('logger remove channel '+logger_name)
    print(json.dumps({'passed':passed,'cleaned':True,'audit_id':org,'external_calls':0,
                      'synthetic_call':call_result,'evidence_directory':str(directory)}))


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--acknowledge-flow-audit',action='store_true')
    parser.add_argument('--synthetic-call',action='store_true')
    args=parser.parse_args()
    if args.apply and args.acknowledge_flow_audit:run(args.synthetic_call)
    else:print(json.dumps({'preview':True,'external_calls':0,'temporary_contexts':True,'synthetic_call':args.synthetic_call}))
