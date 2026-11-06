#!/usr/bin/env python3
"""Verify an encrypted capture on an isolated recovery machine. Never restores a database."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from backup import digest


def decrypted_hash(path):
    proc = subprocess.Popen(['gpg', '--batch', '--decrypt', str(path)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    h = hashlib.sha256()
    size = 0
    try:
        for block in iter(lambda: proc.stdout.read(1024 * 1024), b''):
            h.update(block)
            size += len(block)
        proc.stdout.close()
        if proc.wait():
            raise ValueError('decryption failed')
        return h.hexdigest(), size
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()


def verify(root, run_id, deep):
    if not re.fullmatch(r'[A-Za-z0-9_-]+', run_id):
        raise ValueError('invalid run identifier')
    run = root / 'runs' / run_id
    marker = json.loads((run / 'READY.json').read_text())
    for name in ('database.dump.gpg', 'roles.sql.gpg', 'manifest.json.gpg'):
        if digest(run / name) != marker[name]:
            raise ValueError('capture checksum mismatch')
    manifest = json.loads(subprocess.check_output(['gpg', '--batch', '--decrypt', str(run / 'manifest.json.gpg')], stderr=subprocess.DEVNULL))
    if manifest['format'] != 1 or not re.fullmatch(r'[A-Fa-f0-9]{40}|[A-Fa-f0-9]{64}', manifest['recipient']):
        raise ValueError('unsupported manifest')
    files = [(run / 'database.dump.gpg', manifest.get('database')),
             (run / 'roles.sql.gpg', manifest.get('roles'))]
    for item in manifest['storage']:
        if not re.fullmatch(r'[a-f0-9]{32}\.gpg', item['blob']):
            raise ValueError('invalid blob identifier')
        blob = root / 'objects' / manifest['recipient'].upper() / item['blob']
        if digest(blob) != item['cipher_sha256']:
            raise ValueError('Storage checksum mismatch')
        files.append((blob, item))
    if deep:
        for path, record in files:
            if not record or decrypted_hash(path) != (record['sha256'], record['size']):
                raise ValueError('plaintext checksum mismatch')
    return len(manifest['storage'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--run', required=True)
    parser.add_argument('--deep', action='store_true', help='decrypt and hash every DB, roles and Storage byte in memory; requires recovery private key')
    args = parser.parse_args()
    try:
        count = verify(args.root, args.run, args.deep)
    except (ValueError, OSError, KeyError, subprocess.SubprocessError):
        print('Verification failed. Keep capture quarantined; no restore performed.', file=sys.stderr)
        return 1
    print(f'Integrity verified for capture and {count} Storage objects. Deep decryption={args.deep}. Database restoration NOT tested.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
