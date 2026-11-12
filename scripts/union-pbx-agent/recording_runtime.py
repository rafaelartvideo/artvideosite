"""Opt-in automatic recordings. No initialization or writes from capability.

Policy application rewrites only owned/generated dialplan, under the shared
operation lock and zero-channel guard. Captures remain disabled until a fresh
signed policy has been applied, verified and leased. Phone routing survives
capture failures. Credentials and signed URLs never enter durable state.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import time

import recordings

CONFIG_ROOT = Path(recordings.POLICY_ROOT)
SPOOL_ROOT = Path(recordings.SPOOL_ROOT)
AGI_ROOT = Path(recordings.AGI).parent


class RecordingRuntimeError(ValueError):
    pass


def safe_path(path):
    if not path.is_absolute() or any(part.is_symlink() for part in (path, *path.parents)):
        raise RecordingRuntimeError('Unsafe recording path')


def trusted(path, private=False):
    safe_path(path)
    info = path.stat()
    if not path.is_file() or info.st_uid != 0 or info.st_mode & (0o077 if private else 0o022):
        raise RecordingRuntimeError('Untrusted recording file')
    return info


def own(agent, organization_id):
    recordings.identity(organization_id)
    config = json.loads(agent.AGENT_CONFIG.read_text())
    if config.get('organization_id') != organization_id or agent.PROFILE_ID not in (None, organization_id):
        raise RecordingRuntimeError('Recording organization mismatch')


def paths(agent, organization_id):
    recordings.identity(organization_id)
    return (agent.STATE_DIR / 'recordings-runtime.json', agent.STATE_DIR / 'recordings.json',
            agent.DIALPLAN_MANAGED.parent / ('uw-recordings-' + organization_id.replace('-', '') + '.conf'),
            CONFIG_ROOT / (organization_id + '.json'))


def state(agent):
    path = agent.STATE_DIR / 'recordings.json'
    if not path.exists():
        return None
    trusted(path, private=True)
    result = json.loads(path.read_text())
    own(agent, result['policy']['organization_id'])
    recordings.validate_policy(result['policy'], result['policy']['organization_id'])
    return result


def decorate(agent, raw, scope, override=None):
    current = state(agent) if override is None else None
    policy = override if override is not None else (current['policy'] if current else None)
    return recordings.decorate_routes(raw, policy, policy['organization_id'], scope) if policy else raw


def helper_check():
    source = Path(__file__).parent
    for name in ('recording_agi.py', 'recordings.py'):
        trusted(source / name)
        trusted(AGI_ROOT / name)
        if (source / name).read_bytes() != (AGI_ROOT / name).read_bytes():
            raise RecordingRuntimeError('Recording helper bundle mismatch')
    if not os.access(AGI_ROOT / 'recording_agi.py', os.X_OK):
        raise RecordingRuntimeError('Recording helper not executable')


def stub(organization_id):
    name = recordings.context_name(organization_id)
    lines = ['; Prepared recording runtime, capture disabled.', '[' + name + ']']
    lines.extend('exten => ' + scope + ',1,Return()' for scope in recordings.SCOPES)
    for scope in recordings.SCOPES:
        lines.extend(['[' + name + '-notice-' + scope + ']', 'exten => s,1,Return()'])
    return ('\n'.join(lines) + '\n').encode()


def verify_context(agent, raw, organization_id):
    text = raw.decode()
    names = [recordings.context_name(organization_id)] + [recordings.context_name(organization_id) + '-notice-' + scope for scope in recordings.SCOPES]
    for index, name in enumerate(names):
        match = re.search(r'(?m)^\[' + re.escape(name) + r'\]\n', text)
        if match is None:
            raise RecordingRuntimeError('Recording context missing')
        following = re.search(r'(?m)^\[', text[match.end():])
        end = match.end() + following.start() if following else len(text)
        agent._verify_loaded_context(name, text[match.start():end].encode(),
                                     list(recordings.SCOPES) if index == 0 else ['s'], [])


def verify(agent, organization_id):
    own(agent, organization_id)
    prepared, _, context, manifest = paths(agent, organization_id)
    trusted(prepared, private=True)
    if json.loads(prepared.read_text()) != {'version': 1, 'organization_id': organization_id}:
        raise RecordingRuntimeError('Recording runtime identity mismatch')
    helper_check()
    include = '#include "extensions.d/' + context.name + '"'
    if agent.DIALPLAN_MAIN.read_text().splitlines().count(include) != 1:
        raise RecordingRuntimeError('Recording include mismatch')
    trusted(context)
    current = state(agent)
    expected = recordings.compile_context(current['policy'], organization_id) if current else stub(organization_id)
    if context.read_bytes() != expected:
        raise RecordingRuntimeError('Recording context changed outside reconciliation')
    verify_context(agent, expected, organization_id)
    if current:
        trusted(manifest)
        value = json.loads(manifest.read_text())
        if value.get('policy') != current['policy'] or value.get('version') != 1:
            raise RecordingRuntimeError('Recording manifest mismatch')
        internal, _ = agent.render_internal_routes()
        if agent.DIALPLAN_MANAGED.read_bytes() != internal:
            raise RecordingRuntimeError('Recording internal hooks mismatch')
        if agent.QUEUE_TEST_FILE.exists() and agent.QUEUE_TEST_FILE.read_bytes() != agent.render_queue_configs()[1]:
            raise RecordingRuntimeError('Recording queue hooks mismatch')
        for name, original in current.get('legacy_originals', {}).items():
            scope = 'inbound' if name == 'union-fvx-managed.conf' else 'outbound'
            target = agent.DIALPLAN_MANAGED.parent / name
            expected_route = recordings.decorate_routes(base64.b64decode(original), current['policy'], organization_id, scope)
            if target.read_bytes() != expected_route:
                raise RecordingRuntimeError('Recording external hooks mismatch')
            context_name = 'union-fvx-managed' if scope == 'inbound' else 'union-fvx-crm-outbound'
            agent._verify_loaded_context(context_name, expected_route, ['s'] if scope == 'inbound' else ['_55.'], [])
    return current


def capability(agent, organization_id):
    if not (agent.STATE_DIR / 'recordings-runtime.json').exists():
        return []
    try:
        with agent.operation_lock():
            verify(agent, organization_id)
    except Exception:
        return []
    return ['recordings_v1']


def transaction(agent, proposed, verify_after):
    # Check idle before even creating a backup or touching a proposed path.
    agent.assert_no_calls()
    previous = {}
    for path in proposed:
        safe_path(path)
        previous[path] = (path.read_bytes(), path.stat()) if path.exists() else None
    agent.BACKUP_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    backup = Path(tempfile.mkdtemp(prefix='recordings-', dir=agent.BACKUP_DIR))
    metadata = {}
    for index, (path, old) in enumerate(previous.items()):
        if old:
            agent.write_atomic(backup / str(index), old[0])
        metadata[str(path)] = {'file': str(index), 'existed': old is not None,
                               'uid': old[1].st_uid if old else None, 'gid': old[1].st_gid if old else None,
                               'mode': old[1].st_mode & 0o777 if old else None,
                               'expected_sha256': hashlib.sha256(proposed[path][0]).hexdigest()}
    agent.write_atomic(backup / 'manifest.json', agent.json_bytes(metadata))
    old_fvx = agent.asterisk('pjsip show registrations')
    written = []
    try:
        for path, (raw, mode, uid, gid) in proposed.items():
            agent.assert_no_calls()
            if (path.read_bytes() if path.exists() else None) != (previous[path][0] if previous[path] else None):
                raise RecordingRuntimeError('Concurrent recording configuration change')
            agent.write_atomic(path, raw, mode, gid)
            os.chown(path, uid, gid)
            written.append(path)
        result = agent.guarded_reload('dialplan reload')
        if 'reloaded' not in result.lower():
            raise RecordingRuntimeError('Recording dialplan reload not acknowledged')
        verify_after()
        agent.assert_fvx(old_fvx)
    except Exception:
        for path in written:
            if path.is_symlink() or path.read_bytes() not in (proposed[path][0], previous[path][0] if previous[path] else None):
                raise RecordingRuntimeError('External change: preserve recording backup for recovery') from None
        for path in reversed(written):
            old = previous[path]
            if old is None:
                path.unlink(missing_ok=True)
            else:
                agent.write_atomic(path, old[0], old[1].st_mode & 0o777, old[1].st_gid)
                os.chown(path, old[1].st_uid, old[1].st_gid)
        try:
            agent.guarded_reload('dialplan reload')
            agent.assert_fvx(old_fvx)
        except Exception:
            pass  # Guards preserve active calls; capability detects stale memory.
        raise


def spec(agent, raw, path, private=False):
    if path.exists():
        info = path.stat()
        return (raw, info.st_mode & 0o777, info.st_uid, info.st_gid)
    return (raw, 0o600 if private else 0o640, 0, 0 if private else agent.grp.getgrnam('asterisk').gr_gid)


def init(agent, organization_id):
    own(agent, organization_id)
    agent.require_root()
    helper_check()
    import pwd
    uid = pwd.getpwnam('asterisk').pw_uid
    gid = agent.grp.getgrnam('asterisk').gr_gid
    for directory, owner, group, mode in ((CONFIG_ROOT, 0, gid, 0o750), (SPOOL_ROOT, 0, gid, 0o750),
                                         (SPOOL_ROOT / organization_id, uid, gid, 0o700)):
        safe_path(directory)
        if not directory.exists():
            directory.mkdir(mode=mode)
            os.chown(directory, owner, group)
        info = directory.stat()
        if (info.st_uid, info.st_gid, info.st_mode & 0o777) != (owner, group, mode):
            raise RecordingRuntimeError('Recording directory ownership mismatch')
    prepared, _, context, _ = paths(agent, organization_id)
    with agent.operation_lock():
        agent.assert_no_calls()
        if prepared.exists() or context.exists():
            verify(agent, organization_id)
            return
        raw = agent.DIALPLAN_MAIN.read_bytes()
        include = '#include "extensions.d/' + context.name + '"'
        if include in raw.decode().splitlines():
            raise RecordingRuntimeError('Recording include already exists')
        proposed = {
            prepared: spec(agent, agent.json_bytes({'version': 1, 'organization_id': organization_id}), prepared, True),
            context: spec(agent, stub(organization_id), context),
            agent.DIALPLAN_MAIN: spec(agent, raw + (b'' if raw.endswith(b'\n') else b'\n') + include.encode() + b'\n', agent.DIALPLAN_MAIN),
        }
        transaction(agent, proposed, lambda: verify(agent, organization_id))


def catalog(agent, organization_id):
    endpoints = set()
    for path in (agent.STATE_DIR / 'extensions').glob('*.json'):
        trusted(path, True)
        value = json.loads(path.read_text())
        agent.validate_local_owner(value)
        if value.get('organization_id', organization_id) != organization_id:
            raise RecordingRuntimeError('Recording extension organization mismatch')
        if value.get('enabled'):
            endpoint = value.get('endpoint', '')
            if re.fullmatch(r'uw-[a-f0-9]{32}', endpoint) is None:
                raise RecordingRuntimeError('Recording extension mismatch')
            endpoints.add(endpoint)
    if agent.PROFILE_ID is None:
        endpoints.update(('union-301', 'union-fvx-in', 'union-fvx-out-test'))
    elif (agent.STATE_DIR / 'sip-trunks.json').exists():
        from sip_trunks import trunk_names
        trusted(agent.STATE_DIR / 'sip-trunks.json', True)
        value = json.loads((agent.STATE_DIR / 'sip-trunks.json').read_text())
        if value.get('organization_id') != organization_id:
            raise RecordingRuntimeError('Recording trunk mismatch')
        for row in value['rows']:
            if row.get('enabled'):
                endpoints.add(trunk_names(organization_id, row['id'])['endpoint'])
    return sorted(endpoints)


def normalized(policy, organization_id):
    fields = ('organization_id', 'revision', 'enabled', 'scopes', 'notice_enabled', 'notice_prompt_id',
              'purpose', 'legal_basis', 'information_reference', 'retention_days', 'quota_bytes', 'max_duration_seconds')
    result = {key: policy.get(key) for key in fields}
    recordings.validate_policy(result, organization_id)
    return result


def legacy_routes(agent, policy, previous):
    originals = dict(previous.get('legacy_originals', {})) if previous else {}
    proposed = {}
    if agent.PROFILE_ID is not None:
        return {}, {}
    for name, scope in (('union-fvx-managed.conf', 'inbound'), ('union-fvx-crm-outbound.conf', 'outbound')):
        path = agent.DIALPLAN_MANAGED.parent / name
        requested = policy['enabled'] and scope in policy['scopes']
        if not requested and name not in originals:
            continue
        if name in originals:
            base = base64.b64decode(originals[name], validate=True)
        else:
            trusted(path)
            base = path.read_bytes()
            if scope == 'outbound':
                import outbound_router
                if base != outbound_router.route_config():
                    raise RecordingRuntimeError('Outbound recording baseline requires review')
            else:
                router_state = agent.STATE_DIR / 'inbound-fvx-router.json'
                trusted(router_state, True)
                saved = json.loads(router_state.read_text())
                if saved.get('route_sha') != hashlib.sha256(base).hexdigest() or base.decode().count('[union-fvx-managed]') != 1:
                    raise RecordingRuntimeError('Inbound recording baseline requires review')
                import inbound_router
                if saved['mode'] == 'direct_301':
                    expected = inbound_router.direct_route()
                else:
                    queue = next((q for q in agent.queue_states().values() if q['enabled'] and q['test_extension'] == saved.get('number')), None)
                    if queue is None:
                        raise RecordingRuntimeError('Inbound queue binding unavailable')
                    expected = inbound_router.queue_route(queue)
                if base != expected:
                    raise RecordingRuntimeError('Inbound recording baseline differs from generator')
        content = recordings.decorate_routes(base, policy, policy['organization_id'], scope)
        proposed[path] = spec(agent, content, path)
        if scope == 'inbound':
            router_state = agent.STATE_DIR / 'inbound-fvx-router.json'
            saved = json.loads(router_state.read_text())
            saved['route_sha'] = hashlib.sha256(content).hexdigest()
            proposed[router_state] = spec(agent, agent.json_bytes(saved), router_state, True)
        if requested:
            originals[name] = base64.b64encode(base).decode()
        else:
            originals.pop(name, None)
    return originals, proposed


def apply_snapshot(agent, policy, organization_id):
    if policy is None:
        return
    desired = normalized(policy, organization_id)
    # A newer desired revision revokes admission immediately, even while a
    # conversation prevents the guarded dialplan update. Existing recordings
    # are bounded by their timers; no call is hung up or reloaded here.
    with agent.operation_lock():
        current=state(agent)
        if current and current['policy']['revision']!=desired['revision']:
            name=recordings.lease_name(organization_id)
            answer=agent.strip_ansi(agent.asterisk('dialplan set global '+name+' 0'))
            if name not in answer:raise RecordingRuntimeError('Recording revocation not acknowledged')
            manifest_file=paths(agent,organization_id)[3]
            trusted(manifest_file)
            previous=json.loads(manifest_file.read_text())
            previous['lease_until']=0
            agent.write_atomic(manifest_file,agent.json_bytes(previous),0o640,agent.grp.getgrnam('asterisk').gr_gid)
    if policy.get('status')=='failed':return
    if desired['enabled'] and desired['notice_enabled']:
        from flow_runtime import prepare_asset, SOUNDS_ROOT
        prompt = policy.get('notice_prompt')
        if not isinstance(prompt, dict) or prompt.get('id') != desired['notice_prompt_id']:
            raise RecordingRuntimeError('Recording notice metadata unavailable')
        prompt = {**prompt, 'organization_id': organization_id}
        prepare_asset(SOUNDS_ROOT, prompt, prompt.get('url'), agent.grp.getgrnam('asterisk').gr_gid)
    with agent.operation_lock():
        current = verify(agent, organization_id)
        prepared, state_file, context, manifest_file = paths(agent, organization_id)
        manifest = {'version': 1, 'policy': desired, 'lease_until': 0,
                    'allowed_endpoints': catalog(agent, organization_id)}
        if desired['enabled'] and not manifest['allowed_endpoints']:
            raise RecordingRuntimeError('Recording endpoints unavailable')
        if desired['enabled'] and desired['notice_enabled']:
            from call_flows import prompt_stem
            manifest['notice_prompt_stem'] = prompt_stem(desired['notice_prompt_id'], organization_id,
                                                        {desired['notice_prompt_id']: policy['notice_prompt']})
        if not current or current['policy'] != desired:
            agent.assert_no_calls()
            originals, proposed = legacy_routes(agent, desired, current)
            next_state = {'policy': desired, 'legacy_originals': originals}
            proposed.update({state_file: spec(agent, agent.json_bytes(next_state), state_file, True),
                             manifest_file: spec(agent, agent.json_bytes(manifest), manifest_file),
                             context: spec(agent, recordings.compile_context(desired, organization_id), context),
                             agent.DIALPLAN_MANAGED: spec(agent, agent.render_internal_routes(recording_override=desired)[0], agent.DIALPLAN_MANAGED)})
            if agent.QUEUE_TEST_FILE.exists():
                proposed[agent.QUEUE_TEST_FILE] = spec(agent, agent.render_queue_configs(recording_override=desired)[1], agent.QUEUE_TEST_FILE)
            if agent.PROFILE_ID is not None and (agent.STATE_DIR / 'sip-trunks.json').exists():
                import sip_trunk_runtime
                sip_state = sip_trunk_runtime.load(agent, organization_id)
                route = sip_trunk_runtime.paths(agent)[1]
                proposed[route] = spec(agent, sip_trunk_runtime.rendered(agent, sip_state, recording_override=desired)[1], route)
            transaction(agent, proposed, lambda: verify(agent, organization_id))
        if desired['enabled']:
            expiry = int(time.time()) + 95
            result = agent.strip_ansi(agent.asterisk('dialplan set global ' + recordings.lease_name(organization_id) + ' ' + str(expiry)))
            if str(expiry) not in result or recordings.lease_name(organization_id) not in result:
                raise RecordingRuntimeError('Recording lease not acknowledged')
            manifest['lease_until'] = expiry
        # Only this admitted snapshot renews capture; capability/init never do.
        agent.write_atomic(manifest_file, agent.json_bytes(manifest), 0o640, agent.grp.getgrnam('asterisk').gr_gid)
        if policy.get('status') == 'pending':
            report(agent, {'revision': desired['revision'], 'status': 'applied', 'error': None})
        else:
            (agent.STATE_DIR / 'recording-report.json').unlink(missing_ok=True)


def report(agent, value=None):
    path = agent.STATE_DIR / 'recording-report.json'
    if value is not None:
        recordings.identity(value['revision'])
        if value['status'] not in ('applied', 'failed'):
            raise RecordingRuntimeError('Invalid recording report')
        agent.write_atomic(path, agent.json_bytes(value))
    if path.exists():
        trusted(path, True)
        return json.loads(path.read_text())
    return None
