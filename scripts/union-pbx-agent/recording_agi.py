#!/usr/bin/python3
"""Unprivileged capture helper. AGI protocol only; no caller strings or shell.

Installed with recordings.py in a root-owned, non-writable directory. A bounded
child timer stops only its MixMonitor ID, independently of the polling agent.
"""
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys
import time

import recordings

CONFIG_ROOT = Path(recordings.POLICY_ROOT)
SPOOL_ROOT = Path(recordings.SPOOL_ROOT)
CHANNEL = re.compile(r'(?:PJSIP/[A-Za-z0-9_-]{1,100}-[a-fA-F0-9]{8,16}|Local/[A-Za-z0-9_@/-]{1,180}-[a-fA-F0-9]{8};[12])')
MONITOR = re.compile(r'0x[a-fA-F0-9]{1,32}')


class CaptureError(ValueError):
    pass


def read_environment(stream):
    result = {}
    for _ in range(64):
        line = stream.readline(4097)
        if len(line) > 4096 or not line.endswith('\n'):
            raise CaptureError('Invalid AGI environment')
        if line == '\n':
            return result
        key, separator, value = line.rstrip('\n').partition(': ')
        if not separator or not re.fullmatch(r'agi_[a-z0-9_]+', key) or key in result:
            raise CaptureError('Invalid AGI environment')
        result[key] = value
    raise CaptureError('Invalid AGI environment')


def parse_reply(line):
    if not isinstance(line, str) or len(line) > 4096:
        raise CaptureError('Invalid AGI reply')
    match = re.fullmatch(r'200 result=(-?[0-9]+)(?: \(([^\r\n)]*)\))?(?: endpos=[0-9]+)?\n?', line)
    if match is None or int(match[1]) < 0:
        raise CaptureError('AGI command not acknowledged')
    return int(match[1]), match[2] or ''


class Agi:
    def __init__(self, reader=sys.stdin, writer=sys.stdout):
        self.reader, self.writer = reader, writer

    def request(self, command):
        if '\n' in command or '\r' in command or len(command) > 2000:
            raise CaptureError('Invalid AGI command')
        self.writer.write(command + '\n')
        self.writer.flush()
        return parse_reply(self.reader.readline(4097))

    def variable(self, name):
        return self.request('GET VARIABLE ' + name)[1]


def safe_path(path):
    if not path.is_absolute() or any(parent.is_symlink() for parent in (path, *path.parents)):
        raise CaptureError('Unsafe recording path')


def manifest(organization_id, revision, scope, require_lease=True):
    recordings.identity(organization_id)
    recordings.identity(revision)
    if scope not in recordings.SCOPES:
        raise CaptureError('Invalid recording scope')
    path = CONFIG_ROOT / (organization_id + '.json')
    safe_path(path)
    info = path.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_size > 30000:
        raise CaptureError('Recording manifest not trusted')
    value = json.loads(path.read_text())
    policy = recordings.validate_policy(value['policy'], organization_id)
    now = time.time()
    if value.get('version') != 1 or policy['revision'] != revision or not policy['enabled'] or scope not in policy['scopes'] or \
       (require_lease and (type(value.get('lease_until')) not in (int, float) or not now < value['lease_until'] <= now + 100)):
        raise CaptureError('Recording lease unavailable')
    endpoints = value.get('allowed_endpoints')
    if not isinstance(endpoints, list) or not 1 <= len(endpoints) <= 128 or \
       any(not isinstance(endpoint, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', endpoint) for endpoint in endpoints):
        raise CaptureError('Recording endpoint bindings unavailable')
    return value


def stop_command(channel, monitor_id):
    if not isinstance(channel, str) or CHANNEL.fullmatch(channel) is None or \
       not isinstance(monitor_id, str) or MONITOR.fullmatch(monitor_id) is None:
        raise CaptureError('Exact channel and recording ID required')
    return ['/usr/sbin/asterisk', '-rx', 'mixmonitor stop ' + channel + ' ' + monitor_id]


def reserve(value, unique_id, scope, channel):
    import fcntl
    policy = value['policy']
    org = policy['organization_id']
    relative = recordings.recording_name(policy, org, unique_id, scope)
    root = SPOOL_ROOT / org
    target = root / relative
    safe_path(root)
    safe_path(target)
    if not root.is_dir() or root.stat().st_mode & 0o077:
        raise CaptureError('Private recording spool unavailable')
    target.parent.mkdir(mode=0o700, exist_ok=True)
    if target.parent.stat().st_mode & 0o077:
        raise CaptureError('Private recording revision unavailable')
    lock = os.open(root / '.quota.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        deadline = time.monotonic() + .5
        while True:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise CaptureError('Recording reservation busy')
                time.sleep(.02)
        reservations = list(root.glob('*/*.reserve'))
        if len(reservations) >= 5000:
            raise CaptureError('Recording reservation limit')
        used = 0
        for path in reservations:
            try:
                safe_path(path)
                if not path.exists():continue  # A confirmed upload can remove it concurrently.
                if not path.is_file() or path.stat().st_size > 1500:
                    raise CaptureError('Invalid recording reservation')
                previous = json.loads(path.read_text())
            except FileNotFoundError:
                continue
            amount = previous.get('reserved_bytes')
            if type(amount) is not int or not 44 < amount <= 128000044:
                raise CaptureError('Invalid recording reservation')
            used += amount
        amount = policy['max_duration_seconds'] * 16000 + 44
        if used + amount > policy['quota_bytes'] or target.exists():
            raise CaptureError('Recording spool quota exceeded')
        reservation = target.with_suffix('.reserve')
        started_at=time.time()
        raw = json.dumps({'reserved_bytes': amount, 'channel': channel, 'unique_id': unique_id,
                          'scope': scope, 'revision': policy['revision'], 'started_at': started_at,
                          'expires_at': started_at+policy['retention_days']*86400}).encode()
        fd = os.open(reservation, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        return target, reservation
    finally:
        os.close(lock)


def capture(mode, organization_id, revision, scope, env, agi):
    value = manifest(organization_id, revision, scope, require_lease=mode != 'notice')
    channel = env.get('agi_channel', '')
    if CHANNEL.fullmatch(channel) is None:
        raise CaptureError('Invalid channel binding')
    endpoint = agi.request('GET FULL VARIABLE "${CHANNEL(endpoint)}"')[1]
    if endpoint not in value['allowed_endpoints'] or not channel.startswith('PJSIP/' + endpoint + '-'):
        # Local channels are allowed only by a private synthetic audit manifest,
        # never by the CRM policy or an arbitrary channel-name prefix.
        synthetic = value.get('synthetic_local_context')
        if not isinstance(synthetic, str) or not re.fullmatch(r'uwra-[a-f0-9]{32}', synthetic) or \
           not re.fullmatch(r'Local/' + ('(?:s|callee)' if mode == 'notice' else 's') + '@' + re.escape(synthetic) + r'-[a-f0-9]{8};[12]', channel):
            raise CaptureError('Channel does not belong to recording policy')
    policy = value['policy']
    if mode == 'notice':
        if policy['notice_enabled']:
            stem = value.get('notice_prompt_stem', '')
            expected = 'union/' + organization_id.replace('-', '') + '/'
            if not isinstance(stem, str) or not stem.startswith(expected) or not re.fullmatch(r'union/[a-f0-9]{32}/[a-f0-9]{32}-[a-f0-9]{64}', stem):
                raise CaptureError('Recording notice unavailable')
            agi.request('EXEC Playback ' + stem)
        return
    if mode != 'start':
        raise CaptureError('Invalid capture action')
    if agi.variable('UW_REC_STARTED') == '1':
        return
    if scope == 'inbound' and policy['notice_enabled']:
        agi.request('ANSWER')
        capture('notice', organization_id, revision, scope, env, agi)
    # Recheck after an optional notice: a long playback cannot extend admission.
    value = manifest(organization_id, revision, scope)
    target, reservation = reserve(value, env.get('agi_uniqueid'), scope, channel)
    started = False
    monitor_id = None
    try:
        agi.request('EXEC MixMonitor ' + str(target) + ',bi(UW_REC_ID)')
        monitor_id = agi.variable('UW_REC_ID')
        stop_command(channel, monitor_id)
        # No shell, inherited protocol descriptors or diagnostic file. The timer
        # survives the polling agent and stops this monitor, never the call.
        child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--stop-after',
                          str(policy['max_duration_seconds']), channel, monitor_id],
                         stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                         close_fds=True, start_new_session=True)
        import select
        if not select.select([child.stdout], [], [], 1)[0] or child.stdout.readline(20) != b'READY\n':
            raise CaptureError('Recording stop timer unavailable')
        child.stdout.close()
        saved = json.loads(reservation.read_text())
        saved.update(timer_pid=child.pid, monitor_id=monitor_id)
        temporary = reservation.with_name('.' + reservation.name + '.' + secrets.token_hex(8))
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            with os.fdopen(fd, 'wb') as stream:
                stream.write(json.dumps(saved).encode())
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, reservation)
        finally:
            temporary.unlink(missing_ok=True)
        started = True
        agi.request('SET VARIABLE UW_REC_STARTED 1')
    finally:
        if not started:
            # If the AGI reply was lost, stop the channel's hooks rather than
            # leaving unbounded capture. The reservation remains conservative
            # until the root reconciler proves the resulting file is closed.
            agi.request('EXEC StopMixMonitor' + (' ' + monitor_id if monitor_id and MONITOR.fullmatch(monitor_id) else ''))


def main(argv=None):
    arguments = sys.argv[1:] if argv is None else argv
    if len(arguments) == 4 and arguments[0] == '--stop-after':
        try:
            seconds = int(arguments[1])
            command = stop_command(arguments[2], arguments[3])
            if not 300 <= seconds <= 7200:
                raise CaptureError('Invalid timer duration')
            print('READY', flush=True)
            time.sleep(seconds)
            subprocess.run(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, timeout=5, check=False)
            return 0
        except Exception:
            return 1
    agi = Agi()
    try:
        environment = read_environment(sys.stdin)
        if len(arguments) != 4:
            raise CaptureError('Capture arguments unavailable')
        capture(*arguments, environment, agi)
    except Exception:
        # A capture failure must never hang up or prevent a legitimate call.
        try:
            agi.request('SET VARIABLE UW_REC_STATE unavailable')
        except Exception:
            pass
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
