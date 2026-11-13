"""Opt-in transactional call admission; preparation never occurs during polling."""
import base64
from contextlib import contextmanager
import hashlib
import json
import re
import time
import call_modes
import recording_runtime as rr

_PREVIEW={}
class CallModeRuntimeError(ValueError): pass

def own(agent,org): rr.own(agent,org)
def file(agent): return agent.STATE_DIR/'call-modes.json'
def context_file(agent,org): return agent.DIALPLAN_MANAGED.parent/(call_modes.context_name(org)+'.conf')
def state(agent):
    if str(agent.STATE_DIR) in _PREVIEW: return _PREVIEW[str(agent.STATE_DIR)]
    path=file(agent)
    if not path.exists(): return None
    rr.trusted(path,True)
    value=json.loads(path.read_text()); own(agent,value['snapshot']['organization_id'])
    call_modes.validate_snapshot(value['snapshot'],value['snapshot']['organization_id'],agent.PROFILE_ID is None)
    if set(value.get('legacy_originals',{}))-{'union-fvx-managed.conf','union-fvx-crm-outbound.conf'}: raise CallModeRuntimeError('Invalid external route identity')
    return value

def source_context(agent):
    current=state(agent)
    return call_modes.context_name(current['snapshot']['organization_id']) if current else (agent.DIALPLAN_CONTEXT if agent.PROFILE_ID else 'union-internal')
def decorate(agent,raw,external=False):
    current=state(agent)
    scoped=current and any('internal_mode' in row for row in current['snapshot']['extensions'])
    return call_modes.decorate_routes(raw,current['snapshot']['organization_id'],external=external and scoped) if current else raw

@contextmanager
def preview(agent,snapshot):
    key=str(agent.STATE_DIR); previous=_PREVIEW.get(key)
    current=state(agent) or {}; _PREVIEW[key]={**current,'snapshot':snapshot}
    try: yield
    finally:
        if previous is None: _PREVIEW.pop(key,None)
        else: _PREVIEW[key]=previous

def validate_catalog(agent,snapshot,org):
    own(agent,org); call_modes.validate_snapshot(snapshot,org,agent.PROFILE_ID is None)
    local={}
    for path in (agent.STATE_DIR/'extensions').glob('*.json'):
        rr.trusted(path,True); row=json.loads(path.read_text()); agent.validate_local_owner(row)
        local[row['id']]={'id':row['id'],'endpoint_name':row['endpoint'],'number':row['number'],'enabled':row['enabled'],'is_managed':True}
    supplied={r['id']:{k:v for k,v in r.items() if k not in ('mode','internal_mode','external_mode')} for r in snapshot['extensions'] if r['is_managed']}
    if any(supplied.get(identity)!=row for identity,row in local.items()) or any(row['enabled'] for identity,row in supplied.items() if identity not in local): raise CallModeRuntimeError('Call mode catalog differs from owned extensions')
    manual=[r for r in snapshot['extensions'] if not r['is_managed']]
    if (agent.PROFILE_ID is None and (len(manual)!=1 or not manual[0]['enabled'])) or (agent.PROFILE_ID is not None and manual): raise CallModeRuntimeError('Manual call mode binding mismatch')

def manual_render(raw,context):
    text=raw.decode(); chunks=re.split(r'(?m)(?=^\[)',text); found=0
    for i,chunk in enumerate(chunks):
        if re.match(r'\[union-301\]\s*\n',chunk) and re.search(r'(?m)^type\s*=\s*endpoint\s*$',chunk):
            found+=1
            if len(re.findall(r'(?m)^context\s*=',chunk))!=1: raise CallModeRuntimeError('Manual endpoint context mismatch')
            chunk=re.sub(r'(?m)^context\s*=.*$', 'context='+context,chunk)
            if re.search(r'(?m)^set_var\s*=\s*TRANSFER_CONTEXT=',chunk): chunk=re.sub(r'(?m)^set_var\s*=\s*TRANSFER_CONTEXT=.*$', 'set_var=TRANSFER_CONTEXT='+context,chunk)
            else: chunk=chunk.rstrip('\n')+'\nset_var=TRANSFER_CONTEXT='+context+'\n'
            chunks[i]=chunk
    if found!=1: raise CallModeRuntimeError('Manual endpoint missing')
    return ''.join(chunks).encode()

def legacy_base(agent,name):
    current=state(agent)
    if not current or name not in current.get('legacy_originals',{}):return None
    raw=base64.b64decode(current['legacy_originals'][name],validate=True)
    expected,_=external_proposal(agent,name,raw)
    path=agent.DIALPLAN_MANAGED.parent/name; rr.trusted(path)
    if path.read_bytes()!=expected:raise CallModeRuntimeError('External route changed outside reconciliation')
    return raw

def legacy_capture(agent):
    if agent.PROFILE_ID is not None:return {}
    recording=rr.state(agent); result={}
    for name,scope in (('union-fvx-managed.conf','inbound'),('union-fvx-crm-outbound.conf','outbound')):
        path=agent.DIALPLAN_MANAGED.parent/name; rr.trusted(path)
        if recording and name in recording.get('legacy_originals',{}): base=base64.b64decode(recording['legacy_originals'][name],validate=True)
        elif scope=='outbound':
            import outbound_router
            base=outbound_router.route_config()
            if path.read_bytes()!=base: raise CallModeRuntimeError('External route baseline mismatch')
        else:
            import inbound_router
            saved_path=agent.STATE_DIR/'inbound-fvx-router.json'; rr.trusted(saved_path,True); saved=json.loads(saved_path.read_text())
            base=inbound_router.direct_route() if saved['mode']=='direct_301' else inbound_router.queue_route(next(q for q in agent.queue_states().values() if q['enabled'] and q['test_extension']==saved.get('number')))
            if path.read_bytes()!=base or saved['route_sha']!=hashlib.sha256(base).hexdigest(): raise CallModeRuntimeError('Inbound baseline mismatch')
        result[name]=base64.b64encode(base).decode()
    return result

def external_proposal(agent,name,raw,recording_policy=None):
    if name not in ('union-fvx-managed.conf','union-fvx-crm-outbound.conf'):raise CallModeRuntimeError('Unknown external route')
    current=state(agent); content=decorate(agent,raw,external=True); proposals={}
    recording=rr.state(agent); policy=recording_policy if recording_policy is not None else (recording['policy'] if recording else None)
    if policy:
        import recordings
        content=recordings.decorate_routes(content,policy,policy['organization_id'],'inbound' if name=='union-fvx-managed.conf' else 'outbound')
    if current:
        current={**current,'legacy_originals':{**current.get('legacy_originals',{}),name:base64.b64encode(raw).decode()}}
        proposals[file(agent)]=rr.spec(agent,agent.json_bytes(current),file(agent),True)
    if recording and name in recording.get('legacy_originals',{}):
        recording={**recording,'legacy_originals':{**recording['legacy_originals'],name:base64.b64encode(raw).decode()}}
        path=agent.STATE_DIR/'recordings.json'; proposals[path]=rr.spec(agent,agent.json_bytes(recording),path,True)
    return content,proposals

def verify(agent,org):
    own(agent,org); current=state(agent)
    if not current: raise CallModeRuntimeError('Call modes not prepared')
    snapshot=current['snapshot']; call_modes.validate_snapshot(snapshot,org,agent.PROFILE_ID is None)
    base=agent.DIALPLAN_CONTEXT if agent.PROFILE_ID else 'union-internal'
    expected=call_modes.compile_context(snapshot,org,base,agent.PROFILE_ID is None); path=context_file(agent,org); rr.trusted(path)
    if path.read_bytes()!=expected or agent.DIALPLAN_MAIN.read_text().splitlines().count('#include "extensions.d/'+path.name+'"')!=1: raise CallModeRuntimeError('Call mode context changed')
    for chunk in re.split(rb'(?m)(?=^\[)',expected):
        if chunk.startswith(b'['):
            name=chunk.split(b']',1)[0][1:].decode(); agent._verify_loaded_context(name,chunk,['s'] if name.endswith('-receive') else ['_X!'],[])
    for path,expected in ((agent.MASTER_FILE,agent.render_master()),(agent.DIALPLAN_MANAGED,agent.render_internal_routes()[0])):
        if path.read_bytes()!=expected: raise CallModeRuntimeError('Call mode rendered files mismatch')
    if agent.QUEUE_TEST_FILE.exists() and agent.QUEUE_TEST_FILE.read_bytes()!=agent.render_queue_configs()[1]: raise CallModeRuntimeError('Call mode queue mismatch')
    if agent.PROFILE_ID is None:
        manual=agent.SIP_DIR/'union-browser-301.conf'
        if manual.read_bytes()!=manual_render(base64.b64decode(current['manual_original'],validate=True),source_context(agent)): raise CallModeRuntimeError('Manual endpoint changed')
    for row in snapshot['extensions']:
        if row['enabled']:
            detail=agent.strip_ansi(agent.asterisk('pjsip show endpoint '+row['endpoint_name']))
            if not re.search(r'(?m)^\s*context\s*:\s*'+re.escape(source_context(agent))+r'\s*$',detail): raise CallModeRuntimeError('Endpoint context not loaded')
    for name in current.get('legacy_originals',{}):
        content,_=external_proposal(agent,name,legacy_base(agent,name))
        if (agent.DIALPLAN_MANAGED.parent/name).read_bytes()!=content: raise CallModeRuntimeError('External call mode hook mismatch')
    return current

def reconcile(agent,snapshot,org,initial=False):
    validate_catalog(agent,snapshot,org); previous=state(agent)
    if previous:
        if snapshot['revision']<previous['snapshot']['revision']: raise CallModeRuntimeError('Stale call mode revision')
        if snapshot['revision']==previous['snapshot']['revision']:
            if snapshot!=previous['snapshot']: raise CallModeRuntimeError('Call mode revision conflict')
            return verify(agent,org)
        verify(agent,org)
    elif not initial: raise CallModeRuntimeError('Call modes require explicit preparation')
    agent.assert_no_calls()
    if initial and (agent.STATE_DIR/'recordings-runtime.json').exists(): rr.verify(agent,org)
    next_state={**(previous or {}),'snapshot':snapshot}
    if initial:
        next_state['legacy_originals']=legacy_capture(agent)
        if agent.PROFILE_ID is None:
            manual=agent.SIP_DIR/'union-browser-301.conf'; rr.trusted(manual); original=manual.read_bytes()
            endpoint_sections=[chunk for chunk in re.split(rb'(?m)(?=^\[)',original) if chunk.startswith(b'[union-301]\n') and re.search(rb'(?m)^type=endpoint\s*$',chunk)]
            if len(endpoint_sections)!=1 or re.findall(rb'(?m)^context=([^\r\n]+)',endpoint_sections[0])!=[b'union-internal']: raise CallModeRuntimeError('Manual original mismatch')
            next_state['manual_original']=base64.b64encode(original).decode()
    key=str(agent.STATE_DIR); _PREVIEW[key]=next_state
    try:
        path=context_file(agent,org); base=agent.DIALPLAN_CONTEXT if agent.PROFILE_ID else 'union-internal'
        proposed={path:rr.spec(agent,call_modes.compile_context(snapshot,org,base,agent.PROFILE_ID is None),path),file(agent):rr.spec(agent,agent.json_bytes(next_state),file(agent),True)}
        for target,raw in ((agent.MASTER_FILE,agent.render_master()),(agent.DIALPLAN_MANAGED,agent.render_internal_routes()[0])): proposed[target]=rr.spec(agent,raw,target)
        if agent.QUEUE_TEST_FILE.exists(): proposed[agent.QUEUE_TEST_FILE]=rr.spec(agent,agent.render_queue_configs()[1],agent.QUEUE_TEST_FILE)
        main=agent.DIALPLAN_MAIN.read_bytes(); include=('#include "extensions.d/'+path.name+'"').encode()
        if initial:
            if include in main.splitlines(): raise CallModeRuntimeError('Unexpected call mode include')
            proposed[agent.DIALPLAN_MAIN]=rr.spec(agent,main+(b'' if main.endswith(b'\n') else b'\n')+include+b'\n',agent.DIALPLAN_MAIN)
        if agent.PROFILE_ID is None:
            manual=agent.SIP_DIR/'union-browser-301.conf'; proposed[manual]=rr.spec(agent,manual_render(base64.b64decode(next_state['manual_original']),source_context(agent)),manual)
            for name,encoded in next_state['legacy_originals'].items():
                content,_=external_proposal(agent,name,base64.b64decode(encoded)); target=agent.DIALPLAN_MANAGED.parent/name; proposed[target]=rr.spec(agent,content,target)
                if name=='union-fvx-managed.conf':
                    target=agent.STATE_DIR/'inbound-fvx-router.json'; saved=json.loads(target.read_text()); saved['route_sha']=hashlib.sha256(content).hexdigest(); proposed[target]=rr.spec(agent,agent.json_bytes(saved),target,True)
        elif (agent.STATE_DIR/'sip-trunks.json').exists():
            import sip_trunk_runtime as st
            target=st.paths(agent)[1]; proposed[target]=rr.spec(agent,st.rendered(agent,st.load(agent,org))[1],target)
        def check():
            if initial:
                result=agent.guarded_reload('module reload res_pjsip.so')
                if 'reloaded successfully' not in result.lower(): raise CallModeRuntimeError('PJSIP reload not acknowledged')
                deadline=time.monotonic()+8
                while True:
                    try: verify(agent,org); break
                    except CallModeRuntimeError:
                        if time.monotonic()>=deadline: raise
                        time.sleep(.2)
                return
            verify(agent,org)
        try: rr.transaction(agent,proposed,check)
        except Exception:
            try: agent.guarded_reload('module reload res_pjsip.so')
            except Exception: pass
            raise
    finally: _PREVIEW.pop(key,None)
    return verify(agent,org)

def init(agent,org,snapshot):
    agent.require_root()
    with agent.operation_lock():
        if state(agent): return verify(agent,org)
        if snapshot['revision']!=1 or any(any(r.get(k,r['mode'])!='both' for k in ('mode','internal_mode','external_mode')) for r in snapshot['extensions']): raise CallModeRuntimeError('Initial call modes must preserve both directions')
        return reconcile(agent,snapshot,org,True)
def apply_snapshot(agent,snapshot,org):
    if snapshot is None:return
    with agent.operation_lock(): return reconcile(agent,snapshot,org)
def capability(agent,org):
    if not file(agent).exists():return []
    try:
        with agent.operation_lock():verify(agent,org)
        return ['call_modes_v2']
    except Exception:return []
def report(agent,value=None):
    path=agent.STATE_DIR/'call-modes-report.json'
    if value is not None:
        if set(value)!={'revision','status'} or type(value['revision']) is not int or not 1<=value['revision']<2**63 or value['status'] not in ('applied','failed'): raise CallModeRuntimeError('Invalid call mode report')
        agent.write_atomic(path,agent.json_bytes(value)); return value
    if path.exists():
        rr.trusted(path,True); value=json.loads(path.read_text())
        if set(value)!={'revision','status'} or type(value['revision']) is not int or not 1<=value['revision']<2**63 or value['status'] not in ('applied','failed'): raise CallModeRuntimeError('Invalid call mode report')
        return value
    current=state(agent)
    if not current:return None
    try:verify(agent,current['snapshot']['organization_id']); status='applied'
    except Exception:status='failed'
    return {'revision':current['snapshot']['revision'],'status':status}
