"""Opt-in universal runtime. Native mutation/verification delegated to root adapter.

Required adapter hooks are universal_apply_bundle(bundle, snapshot),
universal_verify_bundle(bundle, snapshot), universal_observe(org), and
universal_context_bindings(snapshot). They must preserve engine rollback and
root-owned legacy coverage. Without them active snapshots fail closed.
"""
from datetime import datetime,timezone
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import time
from universal_telephony import compile_document,validate_document,uuid,context
from universal_capacity import Ledger

class RuntimeErrorSafe(ValueError):pass
def fail():raise RuntimeErrorSafe('universal_configuration_unavailable')
def paths(agent):return agent.STATE_DIR/'universal-telephony.json'
def own(agent,org):
    uuid(org)
    if agent.PROFILE_ID not in (None,org):fail()
def write(path,value,mode=0o600):
    path=Path(path)
    if any(p.is_symlink() for p in (path,*path.parents)):fail()
    raw=json.dumps(value,sort_keys=True,separators=(',',':')).encode()
    fd,temp=tempfile.mkstemp(prefix='.universal-',dir=str(path.parent))
    try:
        os.chmod(temp,mode)
        with os.fdopen(fd,'wb') as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
        os.replace(temp,path)
    finally:
        if os.path.exists(temp):os.unlink(temp)
def load(agent):
    path=paths(agent)
    if any(p.is_symlink() for p in (path,*path.parents)):fail()
    info=path.stat()
    if info.st_size>4000000 or os.name=='posix' and (info.st_uid!=0 or info.st_mode&0o077):fail()
    return json.loads(path.read_bytes())
def init(agent,org):
    own(agent,org);path=paths(agent)
    if path.exists():
        if load(agent)['organization_id']!=org:fail()
        return
    write(path,dict(organization_id=org,revision=0,status='prepared',hash=None,snapshot=None,compiled_hash=None,observed={'ready':False,'active_legs':0,'legacy_coverage':False,'connections':[]}))
def capability(agent,org):
    try:
        own(agent,org)
        if load(agent)['organization_id']!=org:return []
    except Exception:return []
    return ['universal_telephony_v1']+(['universal_hot_groups_v1'] if callable(getattr(agent,'universal_observe_operational',None)) else [])
def applied_state(agent):
    value=load(agent)
    return {'revision':value['revision'],'hash':value['hash']} if value['status']=='applied' else {'revision':0,'hash':None}

def report(agent):
    state=load(agent);value=state.get('failure') or state
    result={k:value[k] for k in ('revision','status','hash','observed')}
    if state.get('failure'):
        # Failed observations express unknown state, never copied diagnostics.
        result['observed']=dict(result['observed'])
        result['observed']['connections']=[dict(row,checked_at=datetime.now(timezone.utc).isoformat()) for row in result['observed']['connections']]
    return result

def fresh_report(agent):
    state=load(agent)
    if state.get('failure') or state.get('status')!='applied':return report(agent)
    snapshot=state.get('snapshot')
    if not snapshot or not callable(getattr(agent,'universal_observe',None)):fail()
    # Reports are sent on the next poll, beyond the database's 30-second
    # observation window. Sample native state now rather than re-date old data.
    observed=agent.universal_observe(snapshot['organization_id'],snapshot)
    return {**{k:state[k] for k in ('revision','status','hash')},'observed':observed}

def record_failure(agent,state,snapshot):
    connections=snapshot['document']['connections']
    previous=state.get('observed',{})
    def count(value,maximum):return value if type(value) is int and 0<=value<=maximum else 0
    prior_rows={row.get('connection_id'):row for row in previous.get('connections',[]) if isinstance(row,dict)}
    rows=[]
    for connection in connections:
        prior=prior_rows.get(connection['id'],{})
        inbound=count(prior.get('inbound_used'),49999);outbound=count(prior.get('outbound_used'),49999)
        rows.append({'connection_id':connection['id'],'state':'unknown','used':inbound+outbound,
            'inbound_used':inbound,'outbound_used':outbound,'available':None,'checked_at':datetime.now(timezone.utc).isoformat()})
    observed={'ready':False,'active_legs':count(previous.get('active_legs'),999999),'legacy_coverage':False,'connections':rows}
    # The digest identifies the attempted public document, never a credential.
    digest=hashlib.sha256(json.dumps(snapshot['document'],sort_keys=True,separators=(',',':')).encode()).hexdigest()
    value=dict(state,failure={'revision':snapshot['revision'],'status':'failed','hash':digest,'observed':observed})
    write(paths(agent),value)

def attachment(agent):
    state=load(agent);org=state['organization_id'];name='uw-universal-'+org.replace('-','')+'.conf'
    path=agent.DIALPLAN_MANAGED.parent/name
    return path,context(org),'#include "extensions.d/'+name+'"'
def internal_attachment(agent):
    try:
        state=load(agent)
        if state['status']!='applied' or not state['snapshot']['document']['routing_enabled']:return ''
        path,ctx,include=attachment(agent)
        return 'include => '+ctx+'\n'+include+'\n' if path.is_file() else ''
    except Exception:return ''
def envelope(snapshot,org):
    if not isinstance(snapshot,dict):fail()
    full={'schema_version','organization_id','agent_id','revision','document','extensions','credentials','issued_at','expires_at','hash'}
    short={'schema_version','organization_id','agent_id','revision','issued_at','expires_at','hash','unchanged'}
    if set(snapshot) not in (full,short):fail()
    if snapshot['schema_version']!=1 or type(snapshot['schema_version']) is not int or snapshot['organization_id']!=org:fail()
    uuid(snapshot['agent_id'])
    if type(snapshot['revision']) is not int or not 1<=snapshot['revision']<=9223372036854775807:fail()
    supplied_hash=snapshot['hash']
    if supplied_hash is not None and (not isinstance(supplied_hash,str) or not re.fullmatch('[a-f0-9]{64}',supplied_hash)):fail()
    if set(snapshot)==short and supplied_hash is None:fail()
    now=time.time()
    for k in ('issued_at','expires_at'):
        if type(snapshot[k]) not in (int,float):fail()
    if not now-100<=snapshot['issued_at']<=now+5 or not now<snapshot['expires_at']<=now+100 or not 0<snapshot['expires_at']-snapshot['issued_at']<=100:fail()
    if set(snapshot)==short and snapshot['unchanged'] is not True:fail()
def operational_document(document):
    # Only admission policy (membership, strategy and priority) may change.
    value=json.loads(json.dumps(document))
    for group in value['groups']:
        group.pop('extension_ids')
        group.pop('strategy')
        for member in group['members']:member.pop('priority')
    return value

def is_operational_update(state,snapshot,compiled_hash):
    old=state.get('snapshot')
    return bool(old and state['status']=='applied' and old['document']['routing_enabled']
        and snapshot['document']['routing_enabled'] and snapshot['revision']>state['revision']
        and old['credentials']==snapshot['credentials']
        and state['compiled_hash']==compiled_hash
        and operational_document(old['document'])==operational_document(snapshot['document']))

def apply_snapshot(agent,snapshot,org):
    own(agent,org)
    envelope(snapshot,org);state=load(agent)
    if state['organization_id']!=org or snapshot['revision']<state['revision']:fail()
    original=json.loads(json.dumps(state))
    attempted=None
    try:
        if snapshot.get('unchanged'):
            if state['status']!='applied' or snapshot['revision']!=state['revision'] or snapshot['hash']!=state['hash']:fail()
            full=state['snapshot']
            attempted=full
            if full['document']['routing_enabled']:
                for name in ('universal_verify_bundle','universal_renew_lease'):
                    if not callable(getattr(agent,name,None)):fail()
                agent.universal_verify_bundle(None,full)
                agent.universal_renew_lease(org,snapshot['expires_at'])
            state['snapshot'].update(issued_at=snapshot['issued_at'],expires_at=snapshot['expires_at'])
            if callable(getattr(agent,'universal_observe',None)):
                state['observed']=agent.universal_observe(org,state['snapshot'])
            state.pop('failure',None)
            write(paths(agent),state);return report(agent)
        validate_document(snapshot['document'],org)
        if len(snapshot['document']['connections'])>100:fail()
        attempted=snapshot
        active=snapshot['document']['routing_enabled']
        if active:
            required=('universal_apply_bundle','universal_verify_bundle','universal_observe','universal_context_bindings','universal_transports','universal_legacy_coverage','universal_claimed_identities')
            if any(not callable(getattr(agent,n,None)) for n in required):fail()
            coverage=agent.universal_legacy_coverage(org)
            if coverage is not True:fail()
            has_identify=any(c['enabled'] and c['inbound_enabled'] and c['auth_mode'] in ('ip','digest') for c in snapshot['document']['connections'])
            if has_identify and not callable(getattr(agent,'universal_claimed_networks',None)):fail()
            networks=agent.universal_claimed_networks(org) if has_identify else ()
            bundle=compile_document(snapshot['document'],org,snapshot['extensions'],snapshot['credentials'],agent.universal_transports(),legacy_coverage=coverage,claimed_identities=agent.universal_claimed_identities(org),claimed_networks=networks)
            # Adapter validates native syntax, drains before changes, writes with
            # rollback and verifies loaded contexts/endpoints/registration.
            digest=hashlib.sha256(bundle.pjsip+b'\0'+bundle.routes).hexdigest()
            if is_operational_update(state,snapshot,digest) and callable(getattr(agent,'universal_observe_operational',None)):
                # Existing native configuration must match byte for byte.
                agent.universal_verify_bundle(bundle,snapshot)
                observed=agent.universal_observe_operational(org,snapshot)
            else:
                agent.universal_apply_bundle(bundle,snapshot)
                agent.universal_verify_bundle(bundle,snapshot)
                observed=agent.universal_observe(org,snapshot)
            if not isinstance(observed,dict) or not isinstance(observed.get('ready'),bool):fail()
        else:
            # Disabling an already active configuration must drain/remove through
            # the adapter, not merely remove an include from desired state.
            if state['snapshot'] and state['snapshot']['document']['routing_enabled']:
                if any(not callable(getattr(agent,name,None)) for name in ('universal_apply_bundle','universal_verify_bundle')):fail()
                empty=compile_document(snapshot['document'],org,[],[],{})
                agent.universal_apply_bundle(empty,snapshot)
                agent.universal_verify_bundle(empty,snapshot)
            bundle=compile_document(snapshot['document'],org,[],[],{})
            observed=agent.universal_observe(org,snapshot) if callable(getattr(agent,'universal_observe',None)) else {'ready':False,'active_legs':0,'legacy_coverage':False,'connections':[]}
        compiled_hash=hashlib.sha256(bundle.pjsip+b'\0'+bundle.routes).hexdigest()
        value=dict(organization_id=org,revision=snapshot['revision'],hash=compiled_hash,status='applied',snapshot=snapshot,compiled_hash=compiled_hash,observed=observed)
        write(paths(agent),value)
        return report(agent)
    except Exception as exc:
        busy=getattr(agent,'Busy',None)
        if isinstance(busy,type) and isinstance(exc,busy):raise
        if attempted is not None:
            try:record_failure(agent,original,attempted)
            except Exception:pass
        fail()
