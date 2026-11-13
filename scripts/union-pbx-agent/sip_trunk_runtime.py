"""Opt-in isolated-profile SIP snapshots. State/backups are private root 0600;
engine configuration is root:asterisk 0640 so Asterisk can actually read it.

init(agent,org) is an explicit operator action, never called by capability.
capability(agent,org) checks installed files and loaded runtime without mutation.
apply_snapshot(agent,rows,org) takes the WHOLE own-org snapshot and returns only
{id,revision,status} reports for pending/changed revisions. Callers must never log
rows, compiled bytes, CLI details or exception strings. Revisions are positive
JSON integers, bounded by Postgres bigint. The persisted catalog is the admitted
catalog at application time so disabled cleanup can proceed after ramal removal.
Credentials are never read from another organization's files or legacy FVX.
An enabled successful cloud snapshot renews only its organization's 95-second
outbound lease, including steady snapshots without reload. Capability/init and
busy/failed/disabled-only snapshots never renew it. Existing calls are unaffected.
CLI syntax/acknowledgement: Asterisk main/pbx_variables.c handle_set_global.
"""
import json
import os
from pathlib import Path
import re
import tempfile
import time
import uuid

from sip_trunks import FIELDS, compile_trunks, trunk_names, lease_name, _uuid


class TrunkRuntimeError(ValueError): pass


def fail():
    raise TrunkRuntimeError('Isolated SIP trunk configuration could not be verified.')


def own(agent, org):
    _uuid(org)
    if agent.PROFILE_ID is None or agent.PROFILE_ID != org: fail()


def paths(agent):
    suffix = _uuid(agent.PROFILE_ID)
    return (agent.SIP_DIR/('uw-trunks-'+suffix+'.conf'),
            agent.DIALPLAN_MANAGED.parent/('uw-trunks-'+suffix+'.conf'),
            agent.STATE_DIR/'sip-trunks.json', 'uwto-'+suffix)


def pjsip_include(agent):
    return '#include "pjsip.d/'+paths(agent)[0].name+'"'


def attachment(agent):
    _, route, _, context = paths(agent)
    return route, context, '#include "extensions.d/'+route.name+'"'


def internal_attachment(agent):
    route, context, include = attachment(agent)
    return 'include => '+context+'\n'+include+'\n' if route.is_file() else ''


def empty_routes(agent):
    return ('['+paths(agent)[3]+']\n').encode()


def empty_state(org):
    return dict(organization_id=org, rows=[], extensions={}, transports={})


def safe_file(path, private=False, engine_group=None):
    for parent in (path, *path.parents):
        if parent.is_symlink(): fail()
    if not path.is_file(): fail()
    if os.name == 'posix':
        info = path.stat()
        if info.st_mode&0o7111 or not info.st_mode&0o400:fail()
        if engine_group is not None:
            import pwd
            owners={0,pwd.getpwnam('asterisk').pw_uid}
            if info.st_uid not in owners or info.st_gid!=engine_group or info.st_mode&0o777!=0o640:fail()
        elif private:
            if info.st_uid!=0 or info.st_mode&0o077:fail()
        else:
            # Existing global engine files may intentionally be owned by the
            # Asterisk service account (including 0600 pjsip.conf). Preserve
            # their exact metadata rather than widening engine-wide access.
            import pwd
            if info.st_uid not in {0,pwd.getpwnam('asterisk').pw_uid} or info.st_mode&0o022:fail()


def engine_group(agent):
    return agent.grp.getgrnam('asterisk').gr_gid


def renew_lease(agent,org):
    # Only apply_snapshot after a fresh signed/admitted whole snapshot calls
    # this. No capability check, local restart, init or failed apply can renew.
    own(agent,org)
    name=lease_name(org);expiry=str(int(time.time())+95)
    output=agent.strip_ansi(agent.asterisk('dialplan set global '+name+' '+expiry))
    # Asterisk CLI processes may exit zero even for an unsupported command.
    # Confirm the documented acknowledgement, never print raw CLI output.
    if output.strip()!="-- Global variable '"+name+"' set to '"+expiry+"'":fail()


def safe_path(path):
    if any(parent.is_symlink() for parent in (path,*path.parents)): fail()


def load(agent, org):
    state_path = paths(agent)[2]
    safe_file(state_path, True)
    try:
        state = json.loads(state_path.read_bytes())
        if set(state) != {'organization_id','rows','extensions','transports'} or state['organization_id'] != org: fail()
        return state
    except Exception: fail()


def transports(agent):
    result = {}
    output = agent.strip_ansi(agent.asterisk('pjsip show transports'))
    # Asterisk rows have exactly ID, protocol, COS, TOS and bind address. Headers,
    # example text and arbitrary substring matches cannot grant a transport.
    for line in output.splitlines():
        match = re.fullmatch(r'\s*Transport:\s+([A-Za-z0-9_-]+)\s+(udp|tcp|tls)\s+[0-9]+\s+[0-9]+\s+(?:[0-9.]+|\[[0-9A-Fa-f:]+\]):[0-9]+\s*',line)
        if match:
            if match[1] in result: fail()
            result[match[1]] = match[2]
    return result


def catalog(agent, org):
    result = {}
    for path in (agent.STATE_DIR/'extensions').glob('*.json'):
        safe_file(path, True)
        state = json.loads(path.read_bytes()); agent.validate_local_owner(state)
        _uuid(state['id'])
        if path.stem != state['id'] or state.get('organization_id') != org: fail()
        if not state.get('enabled'): continue
        endpoint = state.get('endpoint')
        if not isinstance(endpoint,str) or not re.fullmatch(r'uw-[a-f0-9]{32}',endpoint): fail()
        if any(item['endpoint'] == endpoint for item in result.values()): fail()
        result[state['id']] = dict(organization_id=org, endpoint=endpoint)
    return result


def normalize(rows, org, actual):
    if not isinstance(rows,list) or len(rows)>100: fail()
    result=[];seen=set()
    for row in rows:
        if not isinstance(row,dict) or not FIELDS.issubset(row) or set(row)-FIELDS-{'revision','status'}: fail()
        if (row['organization_id']!=org or type(row.get('revision')) is not int
                or not 1<=row['revision']<=9223372036854775807): fail()
        _uuid(row['id'])
        if row['id'] in seen: fail()
        seen.add(row['id'])
        if row.get('status','pending') not in ('pending','applied','failed'): fail()
        item={key:row[key] for key in FIELDS}; item['revision']=row['revision']
        if item['enabled'] is True:
            if not isinstance(item['transport'],str) or item['transport'] not in actual: fail()
        result.append(item)
    return sorted(result,key=lambda row:row['id'])


def failure_reports(rows,org):
    """Bounded identity-only acknowledgements; no untrusted error text."""
    if not isinstance(rows,list) or len(rows)>100:return []
    reports=[]
    for row in rows:
        if not isinstance(row,dict) or row.get('organization_id')!=org or row.get('status','pending')!='pending':continue
        revision=row.get('revision')
        if type(revision) is not int or not 1<=revision<=9223372036854775807:continue
        try:_uuid(row.get('id'))
        except Exception:continue
        reports.append(dict(id=row['id'],revision=revision,status='failed'))
    return reports


def rendered(agent, state, recording_override=None):
    rows=[{key:row[key] for key in FIELDS} for row in state['rows']]
    compiled=compile_trunks(state['organization_id'],rows,state['extensions'],state['transports'])
    includes=['include => '+trunk_names(state['organization_id'],row['id'])['outbound']+'\n'
              for row in state['rows'] if row['enabled']]
    route=('['+paths(agent)[3]+']\n'+''.join(includes)).encode()+compiled.dialplan
    modes=getattr(agent,'call_mode_support',lambda:None)()
    if modes is not None:route=modes.decorate(agent,route,external=True)
    recording=getattr(agent,'recording_support',lambda:None)()
    if recording is not None:route=recording.decorate(agent,route,'outbound',recording_override)
    return compiled.pjsip,route


def verify(agent, org):
    own(agent,org); state=load(agent,org)
    sip, route=rendered(agent,state); sip_path,route_path,_,context=paths(agent)
    for path,expected in ((sip_path,sip),(route_path,route)):
        safe_file(path,engine_group=engine_group(agent))
        if path.read_bytes()!=expected: fail()
    safe_file(agent.PJSIP_FILE)
    if agent.PJSIP_FILE.read_text().splitlines().count(pjsip_include(agent))!=1: fail()
    active=[row for row in state['rows'] if row['enabled']]
    agent._verify_loaded_context(context,empty_routes(agent)+''.join(
        'include => '+trunk_names(org,row['id'])['outbound']+'\n' for row in active).encode(),[],
        [trunk_names(org,row['id'])['outbound'] for row in active])
    for row in active:
        names=trunk_names(org,row['id'])
        sections=re.split(rb'(?m)(?=^\[)',route)
        for key,numbers in (('inbound',['_.','s']),('outbound',['_55.'])):
            source=next((section for section in sections if section.startswith(('['+names[key]+']\n').encode())),None)
            if source is None: fail()
            agent._verify_loaded_context(names[key],source,numbers,[])
        detail=agent.strip_ansi(agent.asterisk('pjsip show endpoint '+names['endpoint']))
        for field,value in [('context',names['inbound']),('transport',row['transport']),
                            ('allow_transfer','false'),('allow_subscribe','false')]:
            values=re.findall(r'(?m)^\s*'+field+r'\s*:\s*(\S+)\s*$',detail)
            if values!=[value]: fail()
        # Endpoint lookup alone is insufficient: verify registration binding in
        # the live engine, without ever requesting/auth logging its secret.
        detail=agent.strip_ansi(agent.asterisk('pjsip show registration '+names['registration']))
        for field,value in [('endpoint',names['endpoint']),('contact_user',names['contact']),('line','true')]:
            if re.findall(r'(?m)^\s*'+field+r'\s*:\s*(\S+)\s*$',detail)!=[value]: fail()
    return state


def capability(agent,org):
    if agent.PROFILE_ID is None or agent.PROFILE_ID!=org: return []
    if not paths(agent)[2].exists(): return []
    try:
        with agent.operation_lock():
            verify(agent,org)
            output=agent.strip_ansi(agent.asterisk('core show function CHANNEL'))
            if not re.search(r'(?m)^\s*endpoint\s+-',output): return []
    except Exception: return []
    return ['sip_trunks_v1']


def _restore(agent, previous, proposed):
    for path,content in proposed.items():
        if path.is_symlink() or not path.exists() or path.read_bytes() not in (content,previous[path][0] if previous[path] else None): fail()
    for path,old in previous.items():
        if old is None: path.unlink(missing_ok=True)
        else:
            content,info=old
            agent.write_atomic(path,content,info.st_mode&0o777,info.st_gid)
            os.chown(path,info.st_uid,info.st_gid)


def reload_sip(agent):
    # Asterisk can return exit zero for an unknown CLI command. Its generic
    # 'pjsip reload' is not available on the deployed Asterisk 22 runtime.
    for module in ('res_pjsip.so','res_pjsip_outbound_registration.so'):
        output=agent.strip_ansi(agent.guarded_reload('module reload '+module))
        if not re.search(r"(?m)^\s*Module '"+re.escape(module)+r"' reloaded successfully\.?\s*$",output):fail()


def transaction(agent, proposed, org):
    for path in (*proposed,agent.BACKUP_DIR): safe_path(path)
    previous={path:(path.read_bytes(),path.stat()) if path.exists() else None for path in proposed}
    agent.assert_no_calls()
    old_fvx=agent.asterisk('pjsip show registrations')
    backup=Path(tempfile.mkdtemp(prefix='sip-trunks-',dir=agent.BACKUP_DIR))
    os.chmod(backup,0o700);os.chown(backup,0,0)
    for index,(path,old) in enumerate(previous.items()):
        if old is not None:
            target=backup/(str(index)+'.conf');agent.write_atomic(target,old[0],0o600);os.chown(target,0,0)
    # No caller can print backup contents; manifest paths contain no credentials.
    agent.write_atomic(backup/'manifest.json',agent.json_bytes({str(path):dict(file=str(index)+'.conf',
        existed=old is not None,mode=old[1].st_mode&0o777 if old else None,
        uid=old[1].st_uid if old else None,gid=old[1].st_gid if old else None)
        for index,(path,old) in enumerate(previous.items())}),0o600)
    written={}
    try:
        for path,content in proposed.items():
            agent.assert_no_calls()
            old=previous[path]
            engine_file=path in paths(agent)[:2]
            mode=old[1].st_mode&0o777 if path in (agent.PJSIP_FILE,agent.DIALPLAN_MANAGED) and old else (0o640 if engine_file else 0o600)
            gid=engine_group(agent) if engine_file else (old[1].st_gid if old else 0)
            agent.write_atomic(path,content,mode,gid);written[path]=content
            os.chown(path,old[1].st_uid if old and path in (agent.PJSIP_FILE,agent.DIALPLAN_MANAGED) else 0,gid)
        reload_sip(agent);agent.guarded_reload('dialplan reload')
        verify(agent,org); agent._verify_profile_runtime_locked();agent.assert_fvx(old_fvx)
    except Exception:
        _restore(agent,{path:previous[path] for path in written},written)
        # Calls starting mid-transaction prevent reload; on-disk rollback still
        # completes. Capability subsequently blocks until runtime is reconciled.
        try:
            reload_sip(agent);agent.guarded_reload('dialplan reload');agent.assert_fvx(old_fvx)
        except Exception: pass
        raise


def apply_snapshot(agent,rows,org):
    try:
        own(agent,org);agent.require_root()
        with agent.operation_lock():
            agent.assert_no_calls();agent._verify_profile_runtime_locked()
            old=verify(agent,org) or load(agent,org)
            actual=transports(agent); normalized=normalize(rows,org,actual)
            old_rows={row['id']:row for row in old['rows']}
            new_ids={row['id'] for row in normalized}
            if any(row['enabled'] and identity not in new_ids for identity,row in old_rows.items()):fail()
            statuses={row['id']:row.get('status','pending') for row in rows}
            if any(statuses[row['id']]=='failed' for row in normalized):return []
            state=dict(organization_id=org,rows=normalized,extensions=catalog(agent,org),transports=actual)
            for row in normalized:
                prev=old_rows.get(row['id'])
                if prev and (row['revision']<prev['revision'] or (row['revision']==prev['revision'] and row!=prev)): fail()
            sip,route=rendered(agent,state);sip_path,route_path,state_path,_=paths(agent)
            # Preserve the existing admitted catalog snapshot when configuration
            # and revisions are unchanged, avoiding writes due to unrelated data.
            changed=normalized!=old['rows'] or sip_path.read_bytes()!=sip or route_path.read_bytes()!=route
            reports=[dict(id=row['id'],revision=row['revision'],status='applied') for row in normalized
                     if row!=old_rows.get(row['id']) or statuses[row['id']]=='pending']
            if not changed:
                if any(row['enabled'] for row in normalized):renew_lease(agent,org)
                return reports
            proposed={sip_path:sip,route_path:route,state_path:agent.json_bytes(state)}
            internal,_=agent.render_internal_routes();proposed[agent.DIALPLAN_MANAGED]=internal
            agent.BACKUP_DIR.mkdir(parents=True,exist_ok=True,mode=0o700)
            transaction(agent,proposed,org)
            if any(row['enabled'] for row in normalized):renew_lease(agent,org)
            return reports
    except agent.Busy: raise
    except Exception: raise TrunkRuntimeError('Isolated SIP trunk snapshot was not applied.') from None


def init(agent,org):
    own(agent,org);agent.require_root()
    with agent.operation_lock():
        agent.assert_no_calls();agent._verify_profile_runtime_locked()
        sip,route,state,_=paths(agent)
        if any(path.exists() or path.is_symlink() for path in (sip,route,state)): fail()
        safe_file(agent.PJSIP_FILE);safe_file(agent.DIALPLAN_MANAGED)
        if pjsip_include(agent) in agent.PJSIP_FILE.read_text().splitlines(): fail()
        # Build internal attachment explicitly while the target does not yet
        # exist; runtime rendering will produce these same bytes after install.
        internal,_=agent.render_internal_routes()
        _,context,include=attachment(agent)
        lines=internal.splitlines(keepends=True)
        offset=next((index for index,line in enumerate(lines) if line.startswith((b'include =>',b'#include'))),len(lines))
        lines.insert(offset,('include => '+context+'\n'+include+'\n').encode())
        internal=b''.join(lines)
        main=agent.PJSIP_FILE.read_bytes()
        proposed={sip:b'',route:empty_routes(agent),state:agent.json_bytes(empty_state(org)),
                  agent.PJSIP_FILE:main+(b'' if main.endswith(b'\n') else b'\n')+pjsip_include(agent).encode()+b'\n',
                  agent.DIALPLAN_MANAGED:internal}
        agent.BACKUP_DIR.mkdir(parents=True,exist_ok=True,mode=0o700)
        transaction(agent,proposed,org)
