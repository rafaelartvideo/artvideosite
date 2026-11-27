"""Root-owned native bridge. Only generated tenant files are ever replaced.

The admission manifest is deliberately separate from the private cloud snapshot.
Every reconciliation closes admission before obtaining authoritative channels.
"""
import copy
import base64
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import time

import recording_runtime as transaction_runtime
import universal_observer
import universal_telephony_runtime as runtime
from universal_capacity import Ledger
from universal_telephony import context, names, uuid

CONFIG_ROOT = Path('/etc/union-pbx-agent/universal')
LEDGER = Path('/var/lib/union-pbx-agent/universal-engine/capacity.sqlite')


def fail():
    raise runtime.RuntimeErrorSafe('universal_configuration_unavailable')


def cli(agent, command):
    return re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', agent.asterisk(command))


def trusted_global(agent, path):
    # Native pjsip.conf may be service-owned. Preserve that exact ownership;
    # tenant manifests and generated files remain root-owned and stricter.
    if path != agent.PJSIP_FILE:
        return transaction_runtime.trusted(path)
    transaction_runtime.safe_path(path)
    info=path.stat()
    if info.st_uid==0:return transaction_runtime.trusted(path)
    import pwd
    owner=pwd.getpwnam('asterisk').pw_uid
    group=agent.grp.getgrnam('asterisk').gr_gid
    if not path.is_file() or info.st_nlink!=1 or info.st_uid!=owner or info.st_gid!=group or info.st_mode&0o077:
        fail()
    return info


def own(agent, org):
    runtime.own(agent, org)
    transaction_runtime.trusted(agent.AGENT_CONFIG, private=True)
    if json.loads(agent.AGENT_CONFIG.read_text()).get('organization_id') != org:
        fail()


def paths(agent, org):
    uuid(org)
    stem = 'uw-universal-' + org.replace('-', '') + '.conf'
    return agent.SIP_DIR / stem, agent.DIALPLAN_MANAGED.parent / stem, CONFIG_ROOT / (org + '.json')


def ledger(agent):
    # Installer provisions these shared paths; never loosen parent permissions.
    gid = agent.grp.getgrnam('asterisk').gr_gid
    for path, mode in ((LEDGER.parent, 0o770), (LEDGER, 0o660)):
        transaction_runtime.safe_path(path)
        info = path.stat()
        if (info.st_uid, info.st_gid, info.st_mode & 0o777) != (0, gid, mode):
            fail()
    return Ledger(LEDGER)


def manifest_write(agent, org, value):
    path = paths(agent, org)[2]
    transaction_runtime.safe_path(path)
    gid = agent.grp.getgrnam('asterisk').gr_gid
    agent.write_atomic(path, agent.json_bytes(value), 0o640, gid)
    os.chown(path, 0, gid)


def include(raw, line):
    lines = raw.decode().splitlines()
    if lines.count(line) > 1:
        fail()
    return raw if line in lines else raw + (b'' if raw.endswith(b'\n') else b'\n') + line.encode() + b'\n'


def transaction(agent, proposed, check, *, sip=False):
    # Reuse the backup/concurrent-write/idle/FVX safeguards. The extra reload
    # after its rollback restores SIP memory as well as dialplan memory.
    def verify():
        if sip:
            if 'reloaded successfully' not in agent.guarded_reload('module reload res_pjsip.so').lower():
                fail()
        check()
    try:
        transaction_runtime.transaction(agent, proposed, verify)
    except Exception as exc:
        busy=getattr(agent,'Busy',None)
        if isinstance(busy,type) and isinstance(exc,busy):raise
        if sip:
            try:
                agent.guarded_reload('module reload res_pjsip.so')
            except Exception:
                pass
        fail()


def prepare(agent, org):
    own(agent, org)
    sip, dial, _ = paths(agent, org)
    # Existing active material must never be emptied by repeated preparation.
    desired = {}
    for path in (sip, dial):
        if not path.exists():
            desired[path] = transaction_runtime.spec(agent, b'', path)
        else:
            transaction_runtime.trusted(path)
    for path, line in ((agent.PJSIP_FILE, '#include "pjsip.d/' + sip.name + '"'),
                       (agent.DIALPLAN_MAIN, '#include "extensions.d/' + dial.name + '"')):
        trusted_global(agent, path)
        desired[path] = transaction_runtime.spec(agent, include(path.read_bytes(), line), path)
    def check():
        for path, line in ((agent.PJSIP_FILE, '#include "pjsip.d/' + sip.name + '"'),
                           (agent.DIALPLAN_MAIN, '#include "extensions.d/' + dial.name + '"')):
            if path.read_text().splitlines().count(line) != 1:
                fail()
        # Empty includes do not need SIP reload (no account is activated).
        if dial.read_bytes():
            verify_routes(agent, dial.read_bytes())
    transaction(agent, desired, check)


def internal_attachment(agent):
    try:
        value = runtime.load(agent)
        if not value['snapshot'] or not value['snapshot']['document']['routing_enabled']:
            return ''
        return 'include => ' + context(value['organization_id']) + '\n'
    except Exception:
        return ''


def legacy_coverage(agent, org):
    own(agent, org)
    # No legacy route is silently exempted from organization aggregate quotas.
    # Root FVX accounts retain unknown capacity until an explicit migration.
    if agent.PROFILE_ID is None:
        for command in ('pjsip show endpoints','pjsip show registrations'):
            raw = cli(agent, command)
            if not re.search(r'(?i)(?:objects found\s*:|no objects found)', raw):
                fail()
            if any(name in raw for name in ('union-fvx-in','union-fvx-out-test','union-fvx-registration')):
                return False
    state = agent.STATE_DIR / 'sip-trunks.json'
    if state.exists():
        transaction_runtime.trusted(state, private=True)
        value = json.loads(state.read_text())
        if value.get('organization_id') != org or not isinstance(value.get('rows'), list):
            fail()
        if any(row.get('enabled') for row in value['rows']):
            return False
    if agent.PROFILE_ID is not None and any((agent.STATE_DIR / name).exists() for name in ('legacy-trunks.json','legacy-trunks-runtime.json')):
        return False
    # Empty initialized v1 state does not consume capacity. Unknown own v1
    # loaded objects do: do not exempt an untracked account merely for no state.
    prefix = 'uwt-' + org.replace('-', '') + '-'
    return prefix not in cli(agent, 'pjsip show endpoints') and prefix not in cli(agent, 'pjsip show registrations')


def transports(agent):
    result = {}
    text = cli(agent, 'pjsip show transports')
    for line in text.splitlines():
        match = re.match(r'^\s*Transport:\s+([A-Za-z0-9_-]{1,100})\s+(udp|tcp|tls)\s', line, re.I)
        if match:
            result[match[1]] = match[2].lower()
    return result


def foreign_snapshots(agent, org):
    # Inspect native included configuration, not merely this profile's state.
    # All active managed accounts are represented by their SIP auth+AOR/URI.
    trusted_global(agent, agent.PJSIP_FILE)
    result = [agent.PJSIP_FILE.read_text()]
    for path in agent.SIP_DIR.glob('*.conf'):
        if path == paths(agent, org)[0]:
            continue
        transaction_runtime.trusted(path)
        result.append(path.read_text())
    return result


def claimed_identities(agent, org):
    own(agent, org)
    claims = set()
    # Asterisk resolves references across included files. Object namespaces are
    # typed: an endpoint, auth and AOR may legitimately share the same name.
    blocks = [block for text in foreign_snapshots(agent, org)
              for block in re.split(r'(?m)^\[', text)[1:]]
    auth = {}; objects = {}
    for block in blocks:
        name = block.split(']', 1)[0]
        user = re.search(r'(?m)^username\s*=\s*([^\s;]+)\s*$', block)
        if user:
            if name in auth and auth[name] != user[1].lower():fail()
            auth[name] = user[1].lower()
        if re.search(r'(?m)^type\s*=\s*aor\s*$', block):
            if name in objects and objects[name] != block:fail()
            objects[name] = block
    for block in blocks:
        # Digest-only endpoints reference both auth and AOR; the username
        # does not appear in that AOR's contact URI.
        aors = re.search(r'(?m)^aors\s*=\s*([^\s;]+)', block)
        reference = re.search(r'(?m)^outbound_auth\s*=\s*([^\s;]+)', block)
        if aors and reference:
            if reference[1] not in auth:
                fail()
            for aor in aors[1].split(','):
                contact = re.search(r'(?m)^contact\s*=\s*sips?:([^\s;]+)', objects.get(aor, ''))
                if not contact:
                    fail()
                authority = contact[1].split('@')[-1].split(':')[0].lower()
                claims.add((authority, auth[reference[1]]))
        host = re.search(r'(?m)^(?:server_uri|contact)\s*=\s*sips?:([^\s;]+)', block)
        if not host:
            continue
        uri = host[1]; authority = uri.split('@')[-1].split(':')[0].lower()
        reference = re.search(r'(?m)^outbound_auth\s*=\s*([^\s;]+)', block)
        if reference and reference[1] in auth:
            claims.add((authority, auth[reference[1]]))
        elif '@' in uri:
            claims.add((authority, uri.split('@')[0].lower()))
        else:
            # An IP-auth trunk cannot be identified by a username.
            claims.add((authority, ''))
    return frozenset(claims)


def claimed_networks(agent, org):
    own(agent, org)
    networks = []
    import ipaddress
    for text in foreign_snapshots(agent, org):
        for match in re.finditer(r'(?m)^match\s*=\s*([^;\n]+)', text):
            for value in match[1].split(','):
                try:
                    networks.append(str(ipaddress.ip_network(value.strip(), strict=False)))
                except ValueError:
                    # DNS identification claims cannot safely prove disjointness.
                    fail()
    return tuple(networks)


def context_bindings(agent, snapshot):
    org = snapshot['organization_id']; own(agent, org)
    local = {}
    for path in (agent.STATE_DIR / 'extensions').glob('*.json'):
        transaction_runtime.trusted(path, private=True)
        row = json.loads(path.read_text()); agent.validate_local_owner(row)
        if row.get('organization_id') != org or path.stem != row.get('id'):
            fail()
        local[row['id']] = row
    for row in snapshot['extensions']:
        actual = local.get(row['id'])
        if actual is None and agent.PROFILE_ID is None and row.get('number')==301 and row.get('endpoint_name')=='union-301':
            import call_mode_runtime as modes
            policy=modes.state(agent)
            entry=next((item for item in (policy or {}).get('snapshot',{}).get('extensions',[]) if item['id']==row['id']),None)
            if entry and entry['number']==301 and entry['endpoint_name']=='union-301' and entry.get('is_managed') is False:
                actual={'id':row['id'],'number':301,'endpoint':'union-301','enabled':entry['enabled'],'organization_id':org}
                local[row['id']]=actual
        if not actual or any((actual.get(k) != row.get(v)) for k, v in
                             (('number', 'number'), ('endpoint', 'endpoint_name'), ('enabled', 'enabled'))):
            fail()
    queues = agent.queue_states()
    result = {}
    for did in snapshot['document']['dids']:
        if not did['enabled']:
            continue
        target = did['destination_id']; kind = did['destination_kind']
        if kind == 'extension':
            actual = local.get(target)
            if not actual or not actual.get('enabled'):
                fail()
            binding = {'context': agent.DIALPLAN_CONTEXT, 'extension': str(actual['number'])}
        elif kind == 'queue':
            actual = queues.get(target)
            if not actual or actual.get('organization_id') != org or not actual.get('enabled'):
                fail()
            binding = {'context': agent.QUEUE_TEST_CONTEXT, 'extension': str(actual['test_extension'])}
        else:
            from call_flows import flow_context
            path = agent.STATE_DIR / 'flows' / (uuid(target) + '.json')
            transaction_runtime.trusted(path, private=True)
            actual = json.loads(path.read_text())['flow']
            if actual.get('organization_id') != org or actual.get('id') != target or not actual.get('enabled'):
                fail()
            binding = {'context': flow_context(org, target), 'extension': 's'}
        result[did['id']] = binding
    return result


def render_routes(agent, bundle, snapshot):
    raw = bundle.routes
    if not raw:
        return raw
    # The called channel is the provider, not an employee. The existing source
    # wrapper and AGI policy enforce employee outbound permission; inbound
    # employee Dial/Queue hooks enforce receive with __UWCM_EXTERNAL=1.
    recording = agent.recording_support()
    if recording is not None:
        raw = recording.decorate(agent, raw, 'outbound')
    return raw


def verify_routes(agent, raw):
    text = raw.decode()
    sections = list(re.finditer(r'(?m)^\[([A-Za-z0-9_-]+)\]\s*\n', text))
    for index, match in enumerate(sections):
        block = text[match.end():sections[index + 1].start() if index + 1 < len(sections) else len(text)]
        extensions = re.findall(r'(?m)^exten => ([^,]+),1,', block)
        agent._verify_loaded_context(match[1], ('[' + match[1] + ']\n' + block).encode(), extensions, [])


def native_endpoint_matches(detail, endpoint, inbound):
    # Asterisk 22 abbreviates long endpoint labels even in an exact lookup.
    # The complete account-specific context remains available in its fields.
    label = re.search(r'(?m)^\s*Endpoint:\s+([A-Za-z0-9_-]+)(?=[/\s]|$)', detail)
    return bool(label and len(label[1]) >= min(50,len(endpoint)) and endpoint.startswith(label[1]) and
                re.search(r'(?m)^\s*context\s*:\s*' + re.escape(inbound) + r'\s*$', detail))


def verify_bundle(agent, bundle, snapshot):
    org = snapshot['organization_id']; own(agent, org)
    if bundle is None:
        from universal_telephony import compile_document
        bundle = compile_document(snapshot['document'], org, snapshot['extensions'], snapshot['credentials'],
                                  transports(agent), legacy_coverage=legacy_coverage(agent, org),
                                  claimed_identities=claimed_identities(agent, org), claimed_networks=claimed_networks(agent, org))
    sip, dial, _ = paths(agent, org)
    for path, raw in ((sip, bundle.pjsip), (dial, render_routes(agent, bundle, snapshot))):
        transaction_runtime.trusted(path)
        if path.read_bytes() != raw:
            fail()
    for path, line in ((agent.PJSIP_FILE, '#include "pjsip.d/' + sip.name + '"'),
                       (agent.DIALPLAN_MAIN, '#include "extensions.d/' + dial.name + '"')):
        if path.read_text().splitlines().count(line) != 1:
            fail()
    verify_routes(agent, dial.read_bytes())
    if not snapshot['document']['routing_enabled']:
        verify_empty(agent, org)
        return
    verify_call_modes(agent, snapshot)
    verify_root_bridge(agent, org, active=True)
    for cid, endpoint in bundle.endpoints:
        detail = cli(agent, 'pjsip show endpoint ' + endpoint)
        if not native_endpoint_matches(detail, endpoint, names(org, cid)['inbound']):
            fail()
        connection = next(c for c in snapshot['document']['connections'] if c['id'] == cid)
        if connection['auth_mode'] == 'registration':
            registration = names(org, cid)['registration']
            detail = cli(agent, 'pjsip show registration ' + registration)
            if not re.search(r'(?m)^\s*' + re.escape(registration) + r'/', detail):
                fail()


def verify_call_modes(agent, snapshot):
    import call_modes
    import call_mode_runtime as modes
    org = snapshot['organization_id']
    state = modes.state(agent)
    if not state or state['snapshot']['organization_id'] != org:
        fail()
    expected = call_modes.compile_context(state['snapshot'], org, agent.DIALPLAN_CONTEXT if agent.PROFILE_ID else 'union-internal', agent.PROFILE_ID is None)
    path = modes.context_file(agent, org); transaction_runtime.trusted(path)
    if path.read_bytes() != expected:
        fail()
    verify_routes(agent, expected)
    applied = {row['id']: row for row in state['snapshot']['extensions']}
    for row in snapshot['extensions']:
        if not row['enabled']:
            continue
        actual = applied.get(row['id'])
        if not actual or not actual['enabled'] or actual['endpoint_name'] != row['endpoint_name'] or actual['number'] != row['number'] or actual.get('external_mode', actual['mode']) != row['external_mode']:
            fail()
        detail=cli(agent,'pjsip show endpoint '+row['endpoint_name'])
        if not re.search(r'(?m)^\s*context\s*:\s*'+re.escape(call_modes.context_name(org))+r'\s*$',detail):
            fail()


def verify_empty(agent, org):
    sip, dial, _ = paths(agent, org)
    if sip.read_bytes() or dial.read_bytes():
        fail()
    prefix = 'uwu-' + org.replace('-', '') + '-'
    for command in ('pjsip show endpoints', 'pjsip show registrations'):
        raw = cli(agent, command)
        if prefix in raw or not re.search(r'(?i)(?:objects found\s*:|no objects found)', raw):
            fail()
    # Asterisk must acknowledge the CLI, and the exact old routing entry cannot
    # remain loaded. Any retained provider inbound context is similarly rejected.
    raw = cli(agent, 'dialplan show')
    if re.search(r"Context '" + re.escape(prefix), raw) or not re.search(r'(?:Context |There are )', raw):
        fail()
    verify_root_bridge(agent, org, active=False)


def apply_bundle(agent, bundle, snapshot):
    org = snapshot['organization_id']; own(agent, org)
    quota = ledger(agent); quota.block(org)
    sip, dial, manifest = paths(agent, org)
    if manifest.exists():
        transaction_runtime.trusted(manifest)
        old = json.loads(manifest.read_text()); old['ready'] = False
        manifest_write(agent, org, old)
    proposed = {path: transaction_runtime.spec(agent, raw, path) for path, raw in
                ((sip, bundle.pjsip), (dial, render_routes(agent, bundle, snapshot)))}
    # Attachment must be present during this transaction, before runtime persists
    # the new snapshot. Do not regenerate unrelated internal/recording policies.
    raw = agent.DIALPLAN_MANAGED.read_bytes()
    line = 'include => ' + context(org)
    lines = [item for item in raw.decode().splitlines() if item != line]
    if snapshot['document']['routing_enabled']:
        lines.append(line)
    proposed[agent.DIALPLAN_MANAGED] = transaction_runtime.spec(agent, ('\n'.join(lines) + '\n').encode(), agent.DIALPLAN_MANAGED)
    bridge, bridge_raw = root_bridge_proposal(agent, snapshot)
    proposed.update(bridge)
    def check():
        verify_bundle(agent, bundle, snapshot)
        if bridge_raw is not None:
            verify_routes(agent, bridge_raw)
    transaction(agent, proposed, check, sip=True)


def root_bridge_proposal(agent, snapshot):
    if agent.PROFILE_ID is not None:
        return {}, None
    import call_mode_runtime as modes
    org=snapshot['organization_id']; enabled=snapshot['document']['routing_enabled']
    name='union-fvx-crm-outbound.conf'; target=agent.DIALPLAN_MANAGED.parent/name
    state_path=agent.STATE_DIR/'universal-native-originals.json'
    stored=None
    if state_path.exists():
        transaction_runtime.trusted(state_path, private=True)
        stored=json.loads(state_path.read_text())
        if set(stored)!={'organization_id','original','active'} or stored['organization_id']!=org or type(stored['active']) is not bool:
            fail()
    if not enabled and (stored is None or not stored['active']):
        return {}, None
    current=modes.legacy_base(agent,name)
    if current is None:
        fail()
    bridge=('['+'union-fvx-crm-outbound'+']\nexten => _55.,1,Goto('+context(org)+',${EXTEN},1)\n').encode()
    if stored is None:
        # Only an already verified cm-owned route is eligible. Its unadorned
        # baseline is private, contains no SIP files and is restored on disable.
        stored={'organization_id':org,'original':base64.b64encode(current).decode(),'active':False}
    original=base64.b64decode(stored['original'],validate=True)
    if current != (bridge if stored['active'] else original):
        fail()
    raw=bridge if enabled else original
    content,proposals=modes.external_proposal(agent,name,raw)
    proposals[target]=transaction_runtime.spec(agent,content,target)
    proposals[state_path]=transaction_runtime.spec(agent,agent.json_bytes({**stored,'active':enabled}),state_path,True)
    return proposals,content


def verify_root_bridge(agent, org, *, active):
    if agent.PROFILE_ID is not None:
        return
    import call_mode_runtime as modes
    state_path=agent.STATE_DIR/'universal-native-originals.json'
    if not state_path.exists():
        if active:
            fail()
        return
    transaction_runtime.trusted(state_path, private=True)
    stored=json.loads(state_path.read_text())
    if stored.get('organization_id')!=org or stored.get('active') is not active:
        fail()
    expected=('['+'union-fvx-crm-outbound'+']\nexten => _55.,1,Goto('+context(org)+',${EXTEN},1)\n').encode() if active else base64.b64decode(stored['original'],validate=True)
    name='union-fvx-crm-outbound.conf'
    if modes.legacy_base(agent,name)!=expected:
        fail()
    verify_routes(agent,(agent.DIALPLAN_MANAGED.parent/name).read_bytes())


def connection_observations(agent, snapshot):
    org = snapshot['organization_id']; result = []
    for row in snapshot['document']['connections']:
        state = 'disabled' if not snapshot['document']['routing_enabled'] or not row['enabled'] else ('unregistered' if row['auth_mode']=='registration' else 'unknown')
        if snapshot['document']['routing_enabled'] and row['enabled']:
            n = names(org, row['id'])
            if row['auth_mode'] == 'registration':
                raw = cli(agent, 'pjsip show registration ' + n['registration'])
                if re.search(r'\bRegistered\b', raw):
                    state = 'registered'
            else:
                raw = cli(agent, 'pjsip show endpoint ' + n['endpoint'])
                if re.search(r'\b(?:Not in use|In use|Ringing|Busy)\b', raw):
                    state = 'available'
        result.append({'connection_id': row['id'], 'state': state, 'checked_at': time.time(), 'used': 0,
                       'inbound_used': 0, 'outbound_used': 0, 'available': None})
    return result


def available_capacity(document, connection, legs):
    """Conservative headroom across every applicable upper quota, no guesses."""
    if not document['routing_enabled'] or not connection['enabled']:
        return 0
    cid=connection['id']
    trunks={t['id'] for t in document['trunks'] if cid in t['connection_ids'] and t['enabled']}
    groups={g['id'] for g in document['groups'] if g['enabled'] and any(m['connection_id']==cid for m in g['members'])}
    bounds=[]
    for direction in ('inbound','outbound'):
        if not connection[direction+'_enabled']:continue
        pools=[p for p in document['capacity_pools'] if p['scope']=='organization'
               or p['scope']=='provider' and p['scope_id']==connection['provider_id']
               or p['scope']=='contract' and p['scope_id']==connection['contract_id']
               or p['scope']=='connection' and p['scope_id']==cid
               or p['scope']=='trunk' and p['scope_id'] in trunks
               or direction=='outbound' and p['scope']=='group' and p['scope_id'] in groups]
        if not pools:return None
        directional=[]
        for pool in pools:
            limit=pool['shared_limit'] if pool['mode']=='shared' else pool[direction+'_limit']
            if pool['confidence']=='unknown' or limit is None:return None
            used=sum(pool['id'] in leg['pools'] and (pool['mode']=='shared' or leg['direction']==direction) for leg in legs)
            directional.append(max(0,limit-used))
        bounds.append(min(directional))
    return min(bounds) if bounds else 0


def prepared_ready(agent, org):
    sip, dial, _ = paths(agent, org)
    for path, line in ((agent.PJSIP_FILE, '#include "pjsip.d/' + sip.name + '"'),
                       (agent.DIALPLAN_MAIN, '#include "extensions.d/' + dial.name + '"')):
        trusted_global(agent, path)
        if path.read_text().splitlines().count(line) != 1:
            fail()
    for path in (sip, dial):
        transaction_runtime.trusted(path)
    source = Path(__file__).parent
    installed = Path('/opt/union-pbx-agent')
    for name in ('universal_capacity_agi.py', 'universal_capacity.py', 'universal_telephony.py', 'recording_agi.py'):
        transaction_runtime.trusted(source / name)
        transaction_runtime.trusted(installed / name)
        if (source / name).read_bytes() != (installed / name).read_bytes():
            fail()
    if not os.access(installed / 'universal_capacity_agi.py', os.X_OK):
        fail()
    return True


def observe(agent, org, snapshot=None):
    own(agent, org)
    if snapshot is None:
        snapshot = runtime.load(agent)['snapshot']
    if not snapshot:
        return {'ready': False, 'active_legs': 0, 'legacy_coverage': legacy_coverage(agent, org), 'connections': []}
    quota = ledger(agent); quota.block(org)
    _, _, path = paths(agent, org)
    if path.exists():
        transaction_runtime.trusted(path)
        old = json.loads(path.read_text()); old['ready'] = False; manifest_write(agent, org, old)
    sampled_legs = quota.legs(org)
    channels = universal_observer.stable_snapshot(command=agent.asterisk)
    active = tuple(channels['active_uniqueids'])
    abandoned = tuple(leg['token'] for leg in quota.legs(org)
                      if leg['uniqueid'] is None and leg.get('origin_uniqueid') and leg['origin_uniqueid'] not in active)
    quota.reconcile(org, channels['boot'], active, complete=True, establishing_quiescent=True, abandoned_tokens=abandoned, sampled_legs=sampled_legs)
    coverage = legacy_coverage(agent, org)
    observations = connection_observations(agent, snapshot)
    legs = quota.legs(org)
    for row in observations:
        row['used'] = sum(leg['connection'] == row['connection_id'] for leg in legs)
        row['inbound_used'] = sum(leg['connection'] == row['connection_id'] and leg['direction']=='inbound' for leg in legs)
        row['outbound_used'] = row['used'] - row['inbound_used']
        connection=next(c for c in snapshot['document']['connections'] if c['id']==row['connection_id'])
        row['available']=available_capacity(snapshot['document'],connection,legs)
        if row['state'] not in ('registered','available') and row['available'] is not None:row['available']=0
    enabled = snapshot['document']['routing_enabled']
    # Inactive snapshots still expose prepared engine and full connection state,
    # allowing cloud configuration admission without activating any account.
    ready = prepared_ready(agent, org)
    if not enabled:
        verify_empty(agent, org)
    if enabled:
        verify_bundle(agent, None, snapshot)
        if not coverage:
            fail()
        quota.admit(org, snapshot['revision'], channels['boot'], snapshot['expires_at'],
                    snapshot['document']['capacity_pools'], complete=True)
    public = copy.deepcopy(snapshot); public.pop('credentials', None)
    value = {'snapshot': public, 'boot': channels['boot'], 'lease_until': snapshot['expires_at'],
             'ready': bool(enabled and ready), 'legacy_coverage': coverage,
             'destinations': context_bindings(agent, snapshot) if enabled else {},
             'connections': {row['connection_id']: row for row in observations}}
    manifest_write(agent, org, value)
    reports = [{**row, 'checked_at': datetime.fromtimestamp(row['checked_at'], timezone.utc).isoformat()} for row in observations]
    return {'ready': ready, 'active_legs': len(quota.legs(org)), 'legacy_coverage': coverage, 'connections': reports}


def renew_lease(agent, org, expires_at):
    own(agent, org)
    path = paths(agent, org)[2]; transaction_runtime.trusted(path)
    value = json.loads(path.read_text())
    if value['snapshot']['organization_id'] != org or not value.get('ready') or not time.time() < expires_at <= time.time() + 100:
        fail()
    # Renewing a lease also refreshes health/reconciliation, never timers out legs.
    snapshot = runtime.load(agent)['snapshot']; snapshot['expires_at'] = expires_at
    observe(agent, org, snapshot)
