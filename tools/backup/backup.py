#!/usr/bin/env python3
"""Manual encrypted PostgreSQL + Supabase S3 backup. No scheduling or pruning."""
import argparse
import contextlib
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import threading
import uuid

REQUIRED = ('BACKUP_ROOT', 'BACKUP_RECIPIENT', 'PGSERVICE', 'PGSERVICEFILE',
            'PGPASSFILE', 'PGSSLROOTCERT', 'RCLONE_CONFIG', 'BACKUP_STORAGE_SOURCE')


def configuration(env):
    errors = [f'{key}: required' for key in REQUIRED if not env.get(key)]
    if env.get('BACKUP_ROOT') and not Path(env['BACKUP_ROOT']).is_absolute():
        errors.append('BACKUP_ROOT: must be absolute')
    if env.get('BACKUP_RECIPIENT') and not re.fullmatch(r'[A-Fa-f0-9]{40}|[A-Fa-f0-9]{64}', env['BACKUP_RECIPIENT']):
        errors.append('BACKUP_RECIPIENT: full public key fingerprint required')
    if env.get('BACKUP_STORAGE_SOURCE') and not re.fullmatch(r'[A-Za-z0-9_-]+:', env['BACKUP_STORAGE_SOURCE']):
        errors.append('BACKUP_STORAGE_SOURCE: use whole S3 remote root, e.g. union-source:')
    return errors


def private_file(path):
    p = Path(path)
    return p.is_file() and not p.is_symlink() and stat.S_IMODE(p.stat().st_mode) & 0o077 == 0


def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--dry-run', action='store_true', help='offline plan only; never reads production or writes files')
    mode.add_argument('--check', action='store_true', help='validate local tools/config/key only; no source connection')
    mode.add_argument('--execute', action='store_true', help='manual read-only source export to approved destination')
    args = parser.parse_args()
    errors = configuration(os.environ)
    if args.dry_run:
        print('NOT ACTIVE: manual backup preparation only. No reads, writes, scheduling, or pruning.')
        print('Plan: consistent custom pg_dump -> GPG; Storage S3 incremental encrypted blobs + encrypted manifest.')
        print('Missing/invalid configuration names: ' + (', '.join(errors) or 'none; run --check next'))
        return 0
    if errors:
        raise RuntimeError('; '.join(errors))
    validate_local()
    if args.check:
        print('Local configuration valid. Source access, capacity, completeness and restoration NOT verified.')
        return 0
    run_backup()
    return 0


def validate_local():
    for tool in ('pg_dump', 'pg_dumpall', 'pg_restore', 'rclone', 'gpg'):
        if not shutil.which(tool):
            raise RuntimeError(f'{tool}: install and review pinned version first')
    for name in ('PGSERVICEFILE', 'PGPASSFILE', 'RCLONE_CONFIG'):
        if not private_file(os.environ[name]):
            raise RuntimeError(f'{name}: require regular non-symlink file with mode 0600 or stricter')
    if not Path(os.environ['PGSSLROOTCERT']).is_file():
        raise RuntimeError('PGSSLROOTCERT: CA file missing')
    root = Path(os.environ['BACKUP_ROOT'])
    if not root.is_dir() or root.is_symlink() or stat.S_IMODE(root.stat().st_mode) & 0o077:
        raise RuntimeError('BACKUP_ROOT: pre-create approved private directory, mode 0700')
    subprocess.run(['gpg', '--batch', '--list-keys', os.environ['BACKUP_RECIPIENT']], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    version = subprocess.check_output(['pg_dump', '--version'], text=True)
    if not re.search(r'\b(17|18|19)\.', version):
        raise RuntimeError('pg_dump: require PostgreSQL 17+ compatible client; review version for this source')


def normalize_listing(items):
    output = []
    seen = set()
    for item in items:
        path = item['Path']
        if (not isinstance(path, str) or not path or path.startswith('/')
                or any(part in ('', '.', '..') for part in path.split('/')) or '\x00' in path
                or path in seen or not isinstance(item['Size'], int) or item['Size'] < 0
                or item.get('IsDir', False)):
            raise ValueError('unsafe or duplicate Storage listing entry')
        seen.add(path)
        output.append({key: item.get(key, {}) if key == 'Hashes' else item[key]
                       for key in ('Path', 'Size', 'ModTime', 'Hashes')})
    return sorted(output, key=lambda item: item['Path'])


def cache_key(item):
    # Only content hashes enable reuse. Missing hash => download again, even if size/time match.
    if not any(item['Hashes'].values()):
        return None
    return hashlib.sha256(json.dumps(item, sort_keys=True).encode()).hexdigest()


def encrypted_stream(command, destination, recipient, env=None):
    partial = destination.with_suffix(destination.suffix + '.partial')
    h = hashlib.sha256()
    size = 0
    producer = encryptor = None
    warning = []
    def drain(stream):
        for block in iter(lambda: stream.read(8192), b''):
            if block:
                warning[:] = [True]
        stream.close()
    try:
        with open(partial, 'xb') as output:
            producer = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
            monitor = threading.Thread(target=drain, args=(producer.stderr,), daemon=True)
            monitor.start()
            encryptor = subprocess.Popen(['gpg', '--batch', '--yes', '--trust-model', 'always',
                '--encrypt', '--recipient', recipient, '--output', '-'], stdin=subprocess.PIPE,
                stdout=output, stderr=subprocess.DEVNULL)
            try:
                for block in iter(lambda: producer.stdout.read(1024 * 1024), b''):
                    h.update(block)
                    size += len(block)
                    encryptor.stdin.write(block)
            finally:
                producer.stdout.close()
                encryptor.stdin.close()
            source_status = producer.wait()
            encryption_status = encryptor.wait()
            monitor.join()
            if source_status or encryption_status or warning:
                raise RuntimeError('producer/encryption failed or producer emitted warnings; artifact rejected')
            output.flush()
            os.fsync(output.fileno())
        if destination.exists():
            raise RuntimeError('refusing to overwrite existing artifact')
        partial.rename(destination)
        return {'sha256': h.hexdigest(), 'size': size, 'cipher_sha256': digest(destination)}
    finally:
        for proc in (producer, encryptor):
            if proc is not None and proc.poll() is None:
                proc.kill()
                proc.wait()
        partial.unlink(missing_ok=True)


def encrypted_json(value, path, recipient):
    payload = json.dumps(value, sort_keys=True, ensure_ascii=False).encode()
    # JSON may include customer object names; pass through memory/pipe, never argv or disk.
    partial = path.with_suffix(path.suffix + '.partial')
    try:
        with open(partial, 'xb') as output:
            subprocess.run(['gpg', '--batch', '--yes', '--trust-model', 'always', '--encrypt',
                            '--recipient', recipient, '--output', '-'], input=payload,
                           stdout=output, stderr=subprocess.DEVNULL, check=True)
            output.flush()
            os.fsync(output.fileno())
        partial.rename(path)
    finally:
        partial.unlink(missing_ok=True)


def storage_listing(source):
    raw = subprocess.check_output(['rclone', 'lsjson', source, '--recursive', '--files-only',
                                   '--hash', '--s3-versions=false'], stderr=subprocess.DEVNULL)
    return normalize_listing(json.loads(raw))


def run_backup():
    os.umask(0o077)
    root = Path(os.environ['BACKUP_ROOT'])
    recipient = os.environ['BACKUP_RECIPIENT']
    # Each fingerprint gets its own pool: rotation never reuses objects encrypted for an old key.
    pool = root / 'objects' / recipient.upper()
    pool.mkdir(parents=True, exist_ok=True)
    with open(root / '.backup.lock', 'a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('another backup is running')
        run_id = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
        run = root / 'runs' / run_id
        run.mkdir(parents=True)
        source = os.environ['BACKUP_STORAGE_SOURCE']
        before = storage_listing(source)
        pg_env = dict(os.environ, PGSSLMODE='verify-full', PGCONNECT_TIMEOUT='20')
        # No URL/password in argv. One archive has a single consistent schema+data snapshot.
        database = encrypted_stream(['pg_dump', '--dbname=sslmode=verify-full', '--format=custom', '--no-password',
                                      '--lock-wait-timeout=30s'], run / 'database.dump.gpg', recipient, pg_env)
        roles = encrypted_stream(['pg_dumpall', '--dbname=sslmode=verify-full', '--roles-only',
                                  '--no-role-passwords', '--no-password'], run / 'roles.sql.gpg', recipient, pg_env)
        objects = []
        downloaded = 0
        for item in before:
            key = cache_key(item)
            cached = pool / (key + '.json') if key else None
            record = json.loads(cached.read_text()) if cached and cached.exists() else None
            if record:
                blob = pool / record['blob']
                if not re.fullmatch(r'[a-f0-9]{32}\.gpg', record['blob']) or not blob.is_file() or digest(blob) != record['cipher_sha256']:
                    raise RuntimeError('incremental object integrity failed; no success marker written')
            else:
                blob = pool / (uuid.uuid4().hex + '.gpg')
                record = encrypted_stream(['rclone', 'cat', source + item['Path']], blob, recipient)
                if record['size'] != item['Size']:
                    raise RuntimeError('Storage object changed size during download')
                record['blob'] = blob.name
                downloaded += 1
                if cached:
                    temp = cached.with_suffix('.partial')
                    temp.write_text(json.dumps(record))
                    temp.replace(cached)
            objects.append(dict(item, **record))
        if storage_listing(source) != before:
            raise RuntimeError('Storage changed during backup; retry in a quiet window')
        manifest = {'format': 1, 'run_id': run_id, 'recipient': recipient.upper(),
                    'database': database, 'roles': roles, 'storage': objects,
                    'consistency': 'Database consistent snapshot; Storage stable endpoint listings, not atomic cross-service snapshot'}
        encrypted_json(manifest, run / 'manifest.json.gpg', recipient)
        # Marker contains only ciphertext digests; full paths/object names remain encrypted.
        marker = {'format': 1, 'database.dump.gpg': digest(run / 'database.dump.gpg'),
                  'manifest.json.gpg': digest(run / 'manifest.json.gpg'),
                  'roles.sql.gpg': digest(run / 'roles.sql.gpg'), 'objects': len(objects),
                  'downloaded': downloaded}
        (run / 'READY.json').write_text(json.dumps(marker, indent=2) + '\n')
        print(f'Encrypted capture completed: {run_id}; objects={len(objects)}; downloaded={downloaded}. Restoration still requires a drill.')


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (RuntimeError, subprocess.SubprocessError, OSError, ValueError, KeyError) as exc:
        # Never print subprocess arguments, remote names, object paths, credentials or raw errors.
        print('Backup failed: ' + (str(exc) if isinstance(exc, RuntimeError) else type(exc).__name__) + '. No READY marker is valid for this failed run.', file=sys.stderr)
        sys.exit(1)
