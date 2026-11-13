"""Explicit root-only preservation and control of the existing platform FVX objects.

No credentials or native command output may leave this module. Preparation never
reloads Asterisk. Disabled files are owned comment-only placeholders.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import uuid

NAMES = ('union-fvx.conf', 'union-outbound-test.conf')
EMPTY = b'; Union legacy trunk paused; originals retained in private root state.\n'


class LegacyTrunkError(ValueError):
    def __init__(self): super().__init__('Legacy trunk configuration could not be verified.')


def fail(): raise LegacyTrunkError()


def trusted(path, mode=None, gid=None):
    path = Path(path)
    for item in (path, *path.parents):
        info = item.lstat()
        owners = {0}
        # Existing Asterisk package ownership is accepted only for these exact
        # global paths. Private state and the two preserved sources stay root.
        if item in (Path('/etc/asterisk'), Path('/etc/asterisk/pjsip.conf')):
            import pwd
            owners.add(pwd.getpwnam('asterisk').pw_uid)
        if stat.S_ISLNK(info.st_mode) or info.st_uid not in owners or info.st_mode & 0o022: fail()
    info = path.stat()
    if not stat.S_ISREG(info.st_mode): fail()
    if mode is not None and stat.S_IMODE(info.st_mode) != mode: fail()
    if gid is not None and info.st_gid != gid: fail()
    return info


def own(agent, org):
    try:
        if str(uuid.UUID(org)) != org or agent.PROFILE_ID is not None or os.geteuid() != 0: fail()
        trusted(agent.AGENT_CONFIG, 0o600)
        if json.loads(agent.AGENT_CONFIG.read_text())['organization_id'] != org: fail()
    except Exception: fail()


def state_path(agent): return agent.STATE_DIR / 'legacy-trunks-runtime.json'


def write(path, data, mode, uid, gid):
    fd, temp = tempfile.mkstemp(prefix='.legacy-', dir=path.parent)
    try:
        os.fchmod(fd, mode)
        os.fchown(fd, uid, gid)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp): os.unlink(temp)


def trusted_directory(path):
    for directory in (path, *path.parents):
        info = directory.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022: fail()


def save(agent, state):
    trusted_directory(agent.STATE_DIR)
    write(state_path(agent), json.dumps(state, separators=(',', ':')).encode(), 0o600, 0, 0)


def includes(agent):
    trusted(agent.PJSIP_FILE)
    lines = agent.PJSIP_FILE.read_text().splitlines()
    selected = []
    for name in NAMES:
        exact = '#include "pjsip.d/' + name + '"'
        matching = [line.strip() for line in lines if name in line and not line.lstrip().startswith(';')]
        if matching != [exact]: fail()
        selected.append(exact)
    return selected


def parse(first, second):
    """Parse only named approved objects; never include input in exceptions."""
    try:
        groups = []
        expected = [ [('union-fvx-registration', 'registration'), ('union-fvx-auth', 'auth'), ('union-fvx-in', 'endpoint')],
                     [('union-fvx-out-test', 'endpoint'), ('union-fvx-out-test', 'aor')] ]
        for raw, allowed in zip((first, second), expected):
            sections = []
            for line in raw.decode('utf-8').splitlines():
                line = line.strip()
                if not line or line.startswith(';'): continue
                if line.startswith('['):
                    if not re.fullmatch(r'\[[a-z0-9-]+\]', line): fail()
                    sections.append((line[1:-1], {}))
                else:
                    if not sections or not re.fullmatch(r'[a-zA-Z0-9_]+\s*=\s*[^\r\n\x00#]+', line): fail()
                    key, value = map(str.strip, line.split('=', 1))
                    if key in sections[-1][1]: fail()
                    sections[-1][1][key] = value
            if [(name, data.get('type')) for name, data in sections] != allowed: fail()
            groups.append(sections)
        reg, auth, inbound = [entry[1] for entry in groups[0]]
        outbound = groups[1][0][1]
        match = re.fullmatch(r'sip:([A-Za-z0-9.-]+):([0-9]+)', reg['server_uri'])
        username = auth['username']
        if not match or not re.fullmatch(r'[A-Za-z0-9_.+\-]{1,128}', username): fail()
        host, port = match.group(1), int(match.group(2))
        if len(host) > 253 or any(not re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?', part) for part in host.split('.')): fail()
        if not 1 <= port <= 65535 or reg.get('client_uri') != 'sip:' + username + '@' + host or outbound.get('from_user') != username: fail()
        if reg.get('outbound_auth') != 'union-fvx-auth' or not auth.get('password'): fail()
        if outbound.get('outbound_auth') != 'union-fvx-auth': fail()
        contact = re.fullmatch(r'sip:([A-Za-z0-9.-]+)(?::([0-9]+))?', groups[1][1][1].get('contact', ''))
        if not contact or contact.group(1) != host or int(contact.group(2) or 5060) != port: fail()
        return {'host': host, 'port': port, 'username': username}
    except Exception: fail()


def load(agent, org):
    own(agent, org)
    try:
        trusted(state_path(agent), 0o600)
        state = json.loads(state_path(agent).read_text())
        if state['organization_id'] != org or str(uuid.UUID(state['id'])) != state['id']: fail()
        if includes(agent) != state['includes']: fail()
        originals = []
        for name, entry in zip(NAMES, state['files']):
            raw = base64.b64decode(entry['data'], validate=True)
            if hashlib.sha256(raw).hexdigest() != entry['sha256'] or entry['uid'] != 0 or entry['mode'] != 0o640: fail()
            path = agent.SIP_DIR / name
            trusted(path, entry['mode'], entry['gid'])
            if path.read_bytes() != (raw if state['enabled'] else EMPTY): fail()
            originals.append(raw)
        if len(state['files']) != 2 or type(state['enabled']) is not bool: fail()
        parse(*originals)
        return state
    except Exception: fail()


def init(agent, organization_id, trunk_id):
    own(agent, organization_id)
    if str(uuid.UUID(trunk_id)) != trunk_id: fail()
    with agent.operation_lock():
        agent.assert_no_calls()
        if state_path(agent).exists():
            state = load(agent, organization_id)
            if state['id'] != trunk_id: fail()
            return
        import grp
        gid = grp.getgrnam('asterisk').gr_gid
        entries, raws = [], []
        for name in NAMES:
            path = agent.SIP_DIR / name
            info = trusted(path, 0o640, gid)
            raw = path.read_bytes()
            raws.append(raw)
            entries.append(dict(data=base64.b64encode(raw).decode(), sha256=hashlib.sha256(raw).hexdigest(), uid=info.st_uid, gid=info.st_gid, mode=0o640))
        parse(*raws)
        save(agent, dict(organization_id=organization_id, id=trunk_id, revision=1, enabled=True, files=entries, includes=includes(agent)))


def capability(agent, org):
    try:
        load(agent, org)
        return ['legacy_trunks_v1']
    except Exception: return []


def observe(agent, enabled):
    registrations = agent.asterisk('pjsip show registrations')
    endpoints = agent.asterisk('pjsip show endpoints')
    rows = re.findall(r'^\s*union-fvx-registration/\S+\s+.*$', registrations, re.M)
    present = [bool(re.search(r'^\s*Endpoint:\s+' + name + r'(?:/|\s|$)', endpoints, re.M)) for name in ('union-fvx-in', 'union-fvx-out-test')]
    consistent = bool(rows) and all(present) if enabled else not rows and not any(present)
    status = 'registered' if rows and re.search(r'\bRegistered\b', rows[0]) else ('unregistered' if consistent or rows else 'unknown')
    return consistent, status


def report(agent, org=None):
    try:
        if org is None:
            trusted(agent.AGENT_CONFIG, 0o600)
            org = json.loads(agent.AGENT_CONFIG.read_text())['organization_id']
        state = load(agent, org)
        consistent, registration = observe(agent, state['enabled'])
        facts = parse(*(base64.b64decode(entry['data']) for entry in state['files']))
        return [dict(id=state['id'], revision=state.get('failed_revision', state['revision']), status='failed' if state.get('failed_revision') or not consistent else 'applied', enabled=state['enabled'], registration_state=registration, **facts)]
    except Exception: return []


def apply_snapshot(agent, rows, org):
    own(agent, org)
    if not isinstance(rows, list) or len(rows) > 1: fail()
    if not rows: return report(agent, org)
    row = rows[0]
    if set(row) != {'id', 'organization_id', 'revision', 'enabled'} or row['organization_id'] != org or type(row['enabled']) is not bool or type(row['revision']) is not int or not 1 <= row['revision'] < 2**63: fail()
    try:
        with agent.operation_lock():
            state = load(agent, org)
            if row['id'] != state['id']: fail()
            if row['revision'] < state['revision']: return report(agent, org)
            if row['revision'] == state['revision'] and row['enabled'] != state['enabled']: fail()
            changed = row['enabled'] != state['enabled']
            written = []
            try:
                agent.assert_no_calls()
                if changed:
                    for name, entry in zip(NAMES, state['files']):
                        agent.assert_no_calls()
                        path = agent.SIP_DIR / name
                        before = path.read_bytes()
                        expected = base64.b64decode(entry['data']) if state['enabled'] else EMPTY
                        if before != expected: fail()
                        write(path, base64.b64decode(entry['data']) if row['enabled'] else EMPTY, entry['mode'], entry['uid'], entry['gid'])
                        written.append((path, before, entry))
                    agent.assert_no_calls()
                    agent.asterisk('pjsip reload')
                    agent.assert_no_calls()
                if not observe(agent, row['enabled'])[0]: fail()
                state.update(enabled=row['enabled'], revision=row['revision'])
                state.pop('failed_revision', None)
                save(agent, state)
            except Exception as error:
                for path, before, entry in reversed(written):
                    # Restore only our own just-written variant, never external edits.
                    current = base64.b64decode(entry['data']) if row['enabled'] else EMPTY
                    trusted(path, entry['mode'], entry['gid'])
                    if path.read_bytes() != current: fail()
                    write(path, before, entry['mode'], entry['uid'], entry['gid'])
                if written:
                    agent.assert_no_calls()
                    agent.asterisk('pjsip reload')
                if isinstance(error, agent.Busy): return []
                state['failed_revision'] = row['revision']
                save(agent, state)
    except agent.Busy: return []
    except Exception: fail()
    return report(agent, org)
