"""Bounded private recording delivery. Fail closed; never infer call ownership."""
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import ssl
import stat
import time
from urllib.parse import urlsplit, parse_qsl
import uuid
import wave

import call_history
import recordings

SPOOL_ROOT = Path(recordings.SPOOL_ROOT)
CDR_PATH = Path('/var/log/asterisk/cdr-custom/union-calls.csv')
PID_PATH = Path('/run/asterisk/asterisk.pid')
PROC_ROOT = Path('/proc')
ORIGIN = 'https://wmjmtcjpunmzvonlkjcu.supabase.co'
MAX_BYTES = 128000044


class UploadError(ValueError):
    pass


def safe_path(path):
    path = Path(path)
    if not path.is_absolute() or any(p.is_symlink() for p in (path, *path.parents)):
        raise UploadError('Unsafe recording path')


def fingerprint(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns, info.st_nlink)


def private_file(path, owners, maximum, private_parent=False, public_read=False):
    safe_path(path)
    if not hasattr(os, 'O_NOFOLLOW'):
        raise UploadError('Secure file access unavailable')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid not in owners or
                info.st_size > maximum or (info.st_mode & 0o077 and not private_parent and not public_read) or
                (public_read and info.st_mode & 0o022)):
            raise UploadError('Untrusted recording file')
        return os.fdopen(fd, 'rb')
    except Exception:
        os.close(fd)
        raise


def asterisk_identity(uid):
    with private_file(PID_PATH, {0, uid}, 32, public_read=True) as stream:
        raw = stream.read(33).decode('ascii').strip()
    if not re.fullmatch(r'[1-9][0-9]{0,9}', raw):
        raise UploadError('Asterisk identity unavailable')
    process = PROC_ROOT / raw
    if Path(os.readlink(process / 'exe')).name != 'asterisk':
        raise UploadError('Asterisk identity unavailable')
    # PID reuse is detected using the kernel start-time field.
    data = (process / 'stat').read_text()
    start = data[data.rfind(')') + 2:].split()[19]
    return raw, start


def trusted_manifest(org):
    # Admission and timers use the current policy; completed older revisions
    # remain uploadable. Never compare the reservation against current revision.
    path = Path(recordings.POLICY_ROOT) / (org + '.json')
    with private_file(path, {0}, 30000, public_read=True) as stream:
        value = json.loads(stream.read(30001))
    if value.get('version') != 1:
        raise UploadError('Untrusted recording manifest')
    recordings.validate_policy(value.get('policy'), org)
    return value


def prove_closed(path, uid):
    before = asterisk_identity(uid)
    count = 0
    with os.scandir(PROC_ROOT / before[0] / 'fd') as descriptors:
        for entry in descriptors:
            count += 1
            if count > 4096:
                raise UploadError('Asterisk descriptors exceed bound')
            # A disappearing descriptor is unknown: retry on the next cycle.
            target = os.readlink(entry.path)
            if target == str(path) or target == str(path) + ' (deleted)':
                raise UploadError('Recording is still open')
    if asterisk_identity(uid) != before:
        raise UploadError('Asterisk identity changed')


def exact_event(unique_id, allowed, path=None):
    path = CDR_PATH if path is None else Path(path)
    safe_path(path)
    with path.open('rb') as stream:
        size = os.fstat(stream.fileno()).st_size
        offset = max(0, size - 8 * 1024 * 1024)
        stream.seek(offset)
        raw = stream.read(8 * 1024 * 1024)
    if offset:
        raw = raw.partition(b'\n')[2]
    selected = None
    for line in raw.splitlines(keepends=True):
        if len(line) > 16384 or not line.endswith(b'\n'):
            continue
        record = call_history.parse_record(line, allowed)
        if record and record['event_id'].split(':', 1)[0] == unique_id:
            if selected is None or int(record['event_id'].rsplit(':', 1)[1]) > int(selected['event_id'].rsplit(':', 1)[1]):
                selected = record
    return selected


def wave_duration(stream):
    try:
        stream.seek(0)
        with wave.open(stream, 'rb') as audio:
            if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype()) != (1, 2, 8000, 'NONE'):
                raise UploadError('Unsupported recording audio')
            frames = audio.getnframes()
            if not 0 < frames <= 7200 * 8000:
                raise UploadError('Invalid recording duration')
            remaining = frames * 2
            while remaining:
                chunk = audio.readframes(min(32768, remaining // 2))
                if not chunk or len(chunk) > remaining:
                    raise UploadError('Truncated recording')
                remaining -= len(chunk)
            return frames / 8000
    except (wave.Error, EOFError) as exc:
        raise UploadError('Invalid recording audio') from exc


def upload_url(url, path):
    if not isinstance(url, str) or len(url) > 6000:
        raise UploadError('Invalid upload destination')
    parsed = urlsplit(url)
    expected = '/storage/v1/object/upload/sign/pbx-call-recordings/' + path
    query = parse_qsl(parsed.query, keep_blank_values=True)
    if (parsed.scheme != 'https' or parsed.netloc != urlsplit(ORIGIN).netloc or parsed.path != expected or
            parsed.fragment or parsed.username or parsed.password or len(query) != 1 or query[0][0] != 'token' or not query[0][1]):
        raise UploadError('Invalid upload destination')
    return parsed


def validate_ticket(ticket, org, record):
    if not isinstance(ticket, dict) or ticket.get('accepted') is not True:
        raise UploadError('Recording was not accepted')
    recording_id = recordings.identity(ticket.get('id'))
    if any(ticket.get(key) != record[key] for key in ('event_id', 'scope')):
        raise UploadError('Recording acknowledgment mismatch')
    if ticket.get('already_ready') is True:
        return recording_id
    if any(ticket.get(key) != record[key] for key in ('sha256', 'size_bytes')):
        raise UploadError('Recording acknowledgment mismatch')
    path = org + '/' + recording_id + '.wav'
    if ticket.get('path') != path:
        raise UploadError('Recording path mismatch')
    upload_url(ticket.get('signed_url'), path)
    return recording_id


def transfer(stream, size, url, path):
    target = upload_url(url, path)
    connection = http.client.HTTPSConnection(target.hostname, timeout=20, context=ssl.create_default_context())
    try:
        connection.putrequest('PUT', target.path + '?' + target.query)
        connection.putheader('Content-Length', str(size))
        connection.putheader('Content-Type', 'audio/wav')
        connection.putheader('x-upsert', 'false')
        connection.endheaders()
        stream.seek(0)
        remaining = size
        while remaining:
            chunk = stream.read(min(65536, remaining))
            if not chunk:
                raise UploadError('Recording changed during upload')
            connection.send(chunk)
            remaining -= len(chunk)
        response = connection.getresponse()
        response.read(4096)
        if not 200 <= response.status < 300:
            raise UploadError('Recording upload not acknowledged')
    finally:
        connection.close()


def send(agent, payload):
    return agent.signed_request({'action': 'report_calls', 'recording_transfer': payload})


def locally_expired(reservation, now=None):
    started, expires = reservation.get('started_at'), reservation.get('expires_at')
    if (type(started) not in (int,float) or type(expires) not in (int,float) or
            not started < expires <= started+90*86400+.01):
        raise UploadError('Local recording retention unavailable')
    return expires <= (time.time() if now is None else now)


def channel_gone(agent, value):
    from recording_agi import stop_command
    channel=value.get('channel')
    stop_command(channel,'0x1')
    return agent is not None and agent.strip_ansi(agent.asterisk('core show channel '+channel)).strip()==channel+' is not a known channel'


def purge(agent):
    return send(agent, {'kind': 'purge'})


def housekeep(agent, platform=False):
    errors=[]
    try:purge(agent)
    except Exception as exc:errors.append(type(exc).__name__)
    if platform:
        try:purge_local_expired(agent)
        except Exception as exc:errors.append(type(exc).__name__)
    return errors


def deliver(agent, org, allowed, candidate, uid):
    safe_path(candidate)
    root = SPOOL_ROOT / org
    if candidate.parent.parent != root or not re.fullmatch(r'[a-f0-9]{32}', candidate.parent.name):
        raise UploadError('Recording outside organization')
    for directory in (root, candidate.parent):
        info = directory.stat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != uid or info.st_mode & 0o077:
            raise UploadError('Recording directory is not private')
    match = re.fullmatch(r'([A-Za-z0-9][A-Za-z0-9_.-]{0,79})-(internal|inbound|outbound)\.wav', candidate.name)
    if match is None:
        raise UploadError('Invalid recording name')
    reserve_path = candidate.with_suffix('.reserve')
    with private_file(reserve_path, {0, uid}, 1500) as reservation:
        reserve_info = os.fstat(reservation.fileno())
        value = json.loads(reservation.read(1501))
        revision = recordings.identity(value.get('revision'))
        if (uuid.UUID(revision).hex != candidate.parent.name or value.get('unique_id') != match[1] or
                value.get('scope') != match[2] or type(value.get('reserved_bytes')) is not int or
                not 44 < value['reserved_bytes'] <= MAX_BYTES or type(value.get('started_at')) not in (int, float)):
            raise UploadError('Invalid recording reservation')
        expired = locally_expired(value)
        if expired:
            prove_closed(candidate, uid)
            with private_file(candidate, {uid}, MAX_BYTES, private_parent=True) as expired_stream:
                expired_info = os.fstat(expired_stream.fileno())
                if (fingerprint(candidate.stat()) != fingerprint(expired_info) or
                        fingerprint(reserve_path.stat()) != fingerprint(reserve_info)):
                    raise UploadError('Expired recording changed before cleanup')
                candidate.unlink()
                reserve_path.unlink()
            return True
        event = exact_event(match[1], allowed)
        if event is None:
            return False
        prove_closed(candidate, uid)
        with private_file(candidate, {uid}, MAX_BYTES, private_parent=True) as stream:
            before = os.fstat(stream.fileno())
            if before.st_size > value['reserved_bytes'] or before.st_mtime > time.time() - 2:
                raise UploadError('Recording is not complete')
            duration = wave_duration(stream)
            stream.seek(0)
            digest = hashlib.sha256()
            while True:
                chunk = stream.read(65536)
                if not chunk:
                    break
                digest.update(chunk)
            if fingerprint(before) != fingerprint(os.fstat(stream.fileno())):
                raise UploadError('Recording changed during validation')
            record = dict(event_id=event['event_id'], policy_revision=revision, scope=match[2],
                          size_bytes=before.st_size, sha256=digest.hexdigest(), duration_seconds=duration)
            ticket = send(agent, {'kind': 'prepare', 'record': record})
            rid = validate_ticket(ticket, org, record)
            if ticket.get('already_ready') is not True:
                try:
                    transfer(stream, before.st_size, ticket['signed_url'], org + '/' + rid + '.wav')
                except (UploadError,OSError,http.client.HTTPException):
                    # A previous PUT may have succeeded before completion was
                    # lost. Never overwrite: let the signed server verify the
                    # existing object's exact digest/format before any cleanup.
                    pass
                if fingerprint(before) != fingerprint(os.fstat(stream.fileno())):
                    raise UploadError('Recording changed during upload')
                ack = send(agent, {'kind': 'complete', 'recording_id': rid})
                if not isinstance(ack, dict) or ack.get('accepted') is not True or ack.get('id') != rid:
                    raise UploadError('Recording completion not acknowledged')
            prove_closed(candidate, uid)
            safe_path(candidate)
            safe_path(reserve_path)
            if (fingerprint(candidate.stat()) != fingerprint(before) or
                    fingerprint(reserve_path.stat()) != fingerprint(reserve_info)):
                raise UploadError('Recording changed before cleanup')
            candidate.unlink()
            reserve_path.unlink()
            return True


def sync(agent, organization_id, allowed_endpoints):
    """At most one candidate per polling cycle; every failure preserves files."""
    import pwd
    recordings.identity(organization_id)
    uid = pwd.getpwnam('asterisk').pw_uid
    trusted_manifest(organization_id)
    root = SPOOL_ROOT / organization_id
    safe_path(root)
    if not root.exists():
        return 0
    # Bound scanning independently of the amount of data accumulated offline.
    seen = 0
    candidates=[]
    with os.scandir(root) as revisions:
        for revision in revisions:
            seen += 1
            if seen > 25000:
                break
            if not re.fullmatch(r'[a-f0-9]{32}', revision.name) or not revision.is_dir(follow_symlinks=False):
                continue
            with os.scandir(revision.path) as files:
                for entry in files:
                    seen += 1
                    if seen > 25000:
                        break
                    if entry.name.endswith('.wav'):
                        candidates.append(Path(entry.path))
            if seen>25000:break
    if not candidates:return 0
    candidates.sort()
    cursor=agent.STATE_DIR/'recording-upload-cursor.json'
    last=''
    if cursor.exists():
        with private_file(cursor,{0},1000) as stream:
            value=json.loads(stream.read(1001))
            if isinstance(value,dict) and isinstance(value.get('last'),str):last=value['last']
    candidate=next((path for path in candidates if str(path.relative_to(root))>last),candidates[0])
    # Advance only this independent media cursor, even on a retry, so a missing
    # old CDR cannot starve every newer recording. History's cursor is untouched.
    agent.write_atomic(cursor,json.dumps({'last':str(candidate.relative_to(root))}).encode())
    return int(deliver(agent, organization_id, allowed_endpoints, candidate, uid))


def purge_local_expired(agent, uid=None):
    """Platform housekeeping: at most one owned expired local file per cycle.

    No company login, active module, CDR lookup or cloud ACK is needed to honor
    its immutable local deadline. Unknown/open files are never deleted.
    """
    if uid is None:
        import pwd
        uid=pwd.getpwnam('asterisk').pw_uid
    safe_path(SPOOL_ROOT)
    if not SPOOL_ROOT.exists():return 0
    names=[]
    with os.scandir(SPOOL_ROOT) as directories:
        for entry in directories:
            if not entry.is_dir(follow_symlinks=False):continue
            try:recordings.identity(entry.name)
            except ValueError:continue
            names.append(entry.name)
    if not names:return 0
    names.sort();last=''
    cursor=agent.STATE_DIR/'recording-retention-cursor.json' if agent is not None else None
    if cursor is not None and cursor.exists():
        with private_file(cursor,{0},1000) as stream:
            value=json.loads(stream.read(1001))
            if isinstance(value,dict) and isinstance(value.get('last'),str):last=value['last']
    selected=next((name for name in names if name>last),names[0])
    if cursor is not None:agent.write_atomic(cursor,json.dumps({'last':selected}).encode())
    seen=0
    with os.scandir(SPOOL_ROOT) as organizations:
        for organization in organizations:
            if organization.name!=selected:continue
            if not organization.is_dir(follow_symlinks=False):continue
            try:recordings.identity(organization.name)
            except ValueError:continue
            with os.scandir(organization.path) as revisions:
                for revision in revisions:
                    if not re.fullmatch(r'[a-f0-9]{32}',revision.name) or not revision.is_dir(follow_symlinks=False):continue
                    with os.scandir(revision.path) as entries:
                        for entry in entries:
                            seen+=1
                            if seen>25000:return 0
                            if entry.name.endswith('.reserve'):
                                reserve=Path(entry.path);candidate=reserve.with_suffix('.wav')
                                try:
                                    with private_file(reserve,{0,uid},1500) as stream:
                                        before=os.fstat(stream.fileno());reservation=json.loads(stream.read(1501))
                                    match=re.fullmatch(r'([A-Za-z0-9][A-Za-z0-9_.-]{0,79})-(internal|inbound|outbound)\.reserve',reserve.name)
                                    if match is None or reservation.get('unique_id')!=match[1] or reservation.get('scope')!=match[2] or recordings.identity(reservation.get('revision')).replace('-','')!=revision.name:continue
                                    locally_expired(reservation)  # Validate immutable deadline, even before expiry.
                                    if candidate.exists() or type(reservation.get('started_at')) not in (int,float) or reservation['started_at']>time.time()-120:continue
                                    # Quota from a failed start has no media to
                                    # upload. Reclaim only after the exact local
                                    # channel is gone and no file is open.
                                    if not channel_gone(agent,reservation):continue
                                    prove_closed(candidate,uid)
                                    if candidate.exists() or fingerprint(reserve.stat())!=fingerprint(before):continue
                                    reserve.unlink();return 1
                                except (ValueError,OSError):continue
                            if not entry.name.endswith('.wav'):continue
                            candidate=Path(entry.path)
                            try:
                                with private_file(candidate.with_suffix('.reserve'),{0,uid},1500) as stream:
                                    reserve_info=os.fstat(stream.fileno());reservation=json.loads(stream.read(1501))
                                match=re.fullmatch(r'([A-Za-z0-9][A-Za-z0-9_.-]{0,79})-(internal|inbound|outbound)\.wav',candidate.name)
                                if match is None or reservation.get('unique_id')!=match[1] or reservation.get('scope')!=match[2] or recordings.identity(reservation.get('revision')).replace('-','')!=revision.name:continue
                                if locally_expired(reservation):
                                    return int(deliver(agent,organization.name,set(),candidate,uid))
                                if candidate.stat().st_size==44 and reservation['started_at']<time.time()-120 and channel_gone(agent,reservation):
                                    prove_closed(candidate,uid)
                                    with private_file(candidate,{uid},MAX_BYTES,private_parent=True) as stream:
                                        before=os.fstat(stream.fileno())
                                        with wave.open(stream,'rb') as audio:
                                            empty=audio.getparams()[:3]==(1,2,8000) and audio.getnframes()==0
                                        if empty and fingerprint(candidate.stat())==fingerprint(before) and fingerprint(candidate.with_suffix('.reserve').stat())==fingerprint(reserve_info):
                                            candidate.unlink();candidate.with_suffix('.reserve').unlink();return 1
                            except (ValueError,OSError):
                                continue
    return 0
