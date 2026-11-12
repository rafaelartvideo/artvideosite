#!/usr/bin/env python3
"""Opt-in synthetic recording audit. No cloud, employee or provider call."""
import argparse
import base64
from contextlib import redirect_stdout, redirect_stderr
import hashlib
import io
import json
import os
from pathlib import Path
import re
import secrets
import signal
import sys
import time
import traceback
import uuid
import wave

from audit_sip_trunks import load_runtime

AUDIT_ROOT = Path('/var/lib/union-pbx-agent/recording-audits')


def audit_id(value):
    if not isinstance(value, str) or not re.fullmatch(r'[a-f0-9]{32}', value):
        raise ValueError('Invalid recording audit ID')
    return value


def save(worker, directory, state):
    worker.write_atomic(directory/'journal.json', worker.json_bytes(state))


def cleanup(worker, runtime, directory, state):
    audit_id(state['id'])
    if state.get('cleaned'):
        return
    worker.assert_no_calls()
    import pwd
    uid = pwd.getpwnam('asterisk').pw_uid
    org = str(uuid.UUID(state['id']))
    revision = state['revision']
    helper = Path('/opt')/('union-pbx-recording-audit-'+state['id'])
    spool = runtime.SPOOL_ROOT/org
    if spool.exists():
        for child in spool.iterdir():
            if child.name == '.quota.lock' and child.is_file() and not child.is_symlink():
                child.unlink()
                continue
            if child.name != uuid.UUID(revision).hex or child.is_symlink() or not child.is_dir():
                raise ValueError('Unexpected synthetic spool state; preserve for review')
            for artifact in child.iterdir():
                if artifact.is_symlink() or artifact.stat().st_uid != uid or artifact.stat().st_nlink != 1 or \
                   re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,79}-internal\.(?:wav|reserve)',artifact.name) is None:
                    raise ValueError('Unexpected synthetic recording; preserve for review')
                if artifact.suffix == '.reserve':
                    value = json.loads(artifact.read_text())
                    pid = value.get('timer_pid')
                    if type(pid) is int and pid > 1 and Path('/proc',str(pid)).exists():
                        arguments = Path('/proc',str(pid),'cmdline').read_bytes().split(b'\0')
                        expected = [str(helper/'recording_agi.py').encode(),b'--stop-after',b'300',
                                    value['channel'].encode(),value['monitor_id'].encode()]
                        if arguments[1:6] != expected:
                            raise ValueError('Timer identity changed; preserve for review')
                        os.kill(pid,signal.SIGTERM)
                artifact.unlink()
            child.rmdir()
        spool.rmdir()
    main = worker.DIALPLAN_MAIN
    current = hashlib.sha256(main.read_bytes()).hexdigest()
    if current not in state['allowed_main']:
        raise ValueError('Global dialplan changed outside audit; preserve journal')
    before = base64.b64decode(state['main_before'],validate=True)
    worker.write_atomic(main,before,state['mode'],state['gid'])
    os.chown(main,state['uid'],state['gid'])
    parent = main.parent/'extensions.d'
    for name in ('uw-recording-audit-'+state['id']+'.conf', 'uw-recording-driver-'+state['id']+'.conf',
                 'uw-recordings-'+state['id']+'.conf'):
        target=parent/name
        if target.is_symlink():
            raise ValueError('Synthetic dialplan replaced by symlink')
        target.unlink(missing_ok=True)
    manifest=runtime.CONFIG_ROOT/(org+'.json')
    if manifest.is_symlink():raise ValueError('Synthetic manifest replaced by symlink')
    manifest.unlink(missing_ok=True)
    if helper.exists():
        for artifact in helper.iterdir():
            if artifact.name not in ('recording_agi.py','recordings.py') or artifact.is_symlink():
                raise ValueError('Unexpected helper artifact; preserve for review')
            artifact.unlink()
        helper.rmdir()
    worker.guarded_reload('dialplan reload')
    for route,before_route in state['routes'].items():
        if worker.strip_ansi(worker.asterisk('dialplan show '+route))!=before_route:
            raise ValueError('Production route changed during recording audit')
    worker.assert_fvx('union-fvx-registration/check Registered')
    if main.read_bytes()!=before:raise ValueError('Recording main restoration mismatch')
    worker.asterisk('dialplan set global UW_REC_LEASE_'+state['id']+' 0')
    state['cleaned']=True
    save(worker,directory,state)


def run(runtime_directory, cleanup_id=None):
    worker,_,_,_=load_runtime(runtime_directory)
    runtime=worker.recording_support()
    if cleanup_id:
        directory=AUDIT_ROOT/audit_id(cleanup_id)
        runtime.trusted(directory/'journal.json',True)
        state=json.loads((directory/'journal.json').read_text())
        with worker.operation_lock():cleanup(worker,runtime,directory,state)
        print(json.dumps({'audit_id':state['id'],'cleaned':True,'synthetic_calls':0}))
        return
    identity=uuid.uuid4().hex
    org=str(uuid.UUID(identity))
    revision=str(uuid.uuid4())
    AUDIT_ROOT.mkdir(mode=0o700,parents=True,exist_ok=True)
    directory=AUDIT_ROOT/identity
    directory.mkdir(mode=0o700)
    helper=Path('/opt')/('union-pbx-recording-audit-'+identity)
    main=worker.DIALPLAN_MAIN
    original=main.read_bytes();info=main.stat()
    managed=main.parent/'extensions.d'/('uw-recording-audit-'+identity+'.conf')
    driver_file=main.parent/'extensions.d'/('uw-recording-driver-'+identity+'.conf')
    context='uwra-'+identity
    before_routes={route:worker.strip_ansi(worker.asterisk('dialplan show '+route)) for route in
                   ('301@union-internal','302@union-internal','850@union-internal',
                    '301@uwi-00000000000040008000000000000001','302@uwi-00000000000040008000000000000001')}
    first=original+(b'' if original.endswith(b'\n') else b'\n')+b'\n'+(
        '#include "extensions.d/'+managed.name+'"\n#include "extensions.d/'+driver_file.name+'"\n').encode()
    final=first+('#include "extensions.d/uw-recordings-'+identity+'.conf"\n').encode()
    state={'id':identity,'revision':revision,'main_before':base64.b64encode(original).decode(),
           'mode':info.st_mode&0o777,'uid':info.st_uid,'gid':info.st_gid,'routes':before_routes,
           'allowed_main':[hashlib.sha256(raw).hexdigest() for raw in (original,first,final)],
           'passed':False,'cleaned':False}
    save(worker,directory,state)
    output=io.StringIO()
    try:
        with redirect_stdout(output),redirect_stderr(output):
            with worker.operation_lock():
                worker.assert_no_calls()
                if helper.exists() or managed.exists() or driver_file.exists():raise ValueError('Synthetic path already exists')
                helper.mkdir(mode=0o755)
                for name in ('recording_agi.py','recordings.py'):
                    worker.write_atomic(helper/name,(runtime_directory/name).read_bytes(),0o755 if name=='recording_agi.py' else 0o644)
                import recordings
                recordings.AGI=str(helper/'recording_agi.py')
                runtime.AGI_ROOT=helper
                worker.select_profile(org)
                worker.STATE_DIR=directory/'state';worker.STATE_DIR.mkdir(mode=0o700)
                (worker.STATE_DIR/'extensions').mkdir(mode=0o700)
                worker.QUEUE_STATE_DIR=worker.STATE_DIR/'queues'
                worker.QUEUE_TEST_FILE=directory/'unused-queues.conf'
                worker.DIALPLAN_MANAGED=managed
                worker.AGENT_CONFIG=directory/'agent.json'
                worker.write_atomic(worker.AGENT_CONFIG,worker.json_bytes({'organization_id':org}))
                extension_id=str(uuid.uuid4())
                worker.write_atomic(worker.STATE_DIR/'extensions'/(extension_id+'.json'),worker.json_bytes({
                    'id':extension_id,'organization_id':org,'endpoint':'uw-'+uuid.uuid4().hex,
                    'number':301,'enabled':True,'password':secrets.token_urlsafe(32)}))
                group=worker.grp.getgrnam('asterisk').gr_gid
                worker.write_atomic(managed,worker.render_internal_routes()[0],0o640,group)
                driver=('['+context+']\nexten => s,1,NoOp(Synthetic unanswered recording audit)\n same => n,Gosub(uwrec-'+identity+',internal,1)\n'
                        ' same => n,Dial(Local/callee@'+context+'/n,5)\n same => n,Hangup()\n'
                        'exten => callee,1,Answer()\n same => n,Playtones(440)\n same => n,Wait(2)\n same => n,Hangup()\n').encode()
                worker.write_atomic(driver_file,driver,0o640,group)
                worker.write_atomic(main,first,info.st_mode&0o777,info.st_gid);os.chown(main,info.st_uid,info.st_gid)
                worker.guarded_reload('dialplan reload')
            runtime.init(worker.runtime_api(),org)
            policy=dict(organization_id=org,revision=revision,enabled=True,scopes=['internal'],notice_enabled=False,
                        notice_prompt_id=None,purpose='Synthetic engine test',legal_basis='contract',
                        information_reference='Synthetic audio only',retention_days=1,quota_bytes=67108864,
                        max_duration_seconds=300,status='pending')
            runtime.apply_snapshot(worker.runtime_api(),policy,org)
            manifest=runtime.CONFIG_ROOT/(org+'.json')
            value=json.loads(manifest.read_text());value['synthetic_local_context']=context
            worker.write_atomic(manifest,worker.json_bytes(value),0o640,group)
            with worker.operation_lock():
                worker.assert_no_calls()
                worker.asterisk('channel originate Local/s@'+context+'/n application Wait 8')
            deadline=time.monotonic()+12
            time.sleep(.5)
            while time.monotonic()<deadline:
                try:worker.assert_no_calls();break
                except worker.Busy:time.sleep(.2)
            worker.assert_no_calls()
            files=list((runtime.SPOOL_ROOT/org).glob('*/*.wav'))
            if len(files)!=1:raise ValueError('Synthetic capture file not unique')
            import recording_upload,pwd
            recording_upload.prove_closed(files[0],pwd.getpwnam('asterisk').pw_uid)
            with files[0].open('rb') as stream:
                duration=recording_upload.wave_duration(stream)
            with wave.open(str(files[0]),'rb') as audio:frames=audio.readframes(audio.getnframes())
            if not 0<duration<10 or not any(frames):raise ValueError('Synthetic tone not captured')
            state.update(passed=True,duration_seconds=duration,size_bytes=files[0].stat().st_size,
                         sha256=hashlib.sha256(files[0].read_bytes()).hexdigest(),synthetic_calls=1,external_calls=0)
            save(worker,directory,state)
    finally:
        try:
            with worker.operation_lock():cleanup(worker,runtime,directory,state)
        except Exception:
            print(json.dumps({'cleanup_id':identity,'cleaned':False,'preserve_journal':str(directory)}),file=sys.stderr)
            raise
    print(json.dumps({key:state[key] for key in ('id','passed','cleaned','duration_seconds','size_bytes','sha256','synthetic_calls','external_calls')}))


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--acknowledge-recording-audit',action='store_true')
    parser.add_argument('--runtime-directory',type=Path,default=Path('/opt/union-pbx-agent'))
    parser.add_argument('--cleanup')
    parser.add_argument('--diagnostics',action='store_true')
    args=parser.parse_args(argv)
    if not args.apply:
        print(json.dumps({'preview':True,'synthetic_calls':1,'external_calls':0,'human_voice':False}))
        return 0
    if not args.acknowledge_recording_audit:
        return 2
    try:
        if args.cleanup:audit_id(args.cleanup)
        run(args.runtime_directory,args.cleanup)
        return 0
    except Exception as exc:
        if args.diagnostics:
            print(json.dumps({'error_type':type(exc).__name__, 'frames':[
                {'file':Path(frame.filename).name,'function':frame.name,'line':frame.lineno}
                for frame in traceback.extract_tb(exc.__traceback__)[-6:]]}),file=sys.stderr)
        print(json.dumps({'passed':False,'error_type':type(exc).__name__,
                          'recovery':'audit_recordings.py --apply --acknowledge-recording-audit --cleanup ID'}),file=sys.stderr)
        return 1


if __name__=='__main__':raise SystemExit(main())
