#!/usr/bin/env bash
# Reviewed runtime files and service write access only. Never reload Asterisk.
set -euo pipefail
umask 077
[[ "${1:-}" == '--acknowledge-legacy-trunk-update' && "$#" == 1 ]] || { echo 'Aprovacao explicita necessaria.' >&2; exit 2; }
[[ "$(id -u)" == 0 ]] || exit 2
stage="$(cd -- "$(dirname -- "$0")" && pwd)"
python3 - "$stage" <<'PY'
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import tempfile

OWNER_UID = 0
STAGE = Path(sys.argv[1])
TARGET = Path('/opt/union-pbx-agent')
BACKUP_ROOT = Path('/root')
PREVIOUS_SHA = '356d59d1b27c77682b4ab1bd5d9fbc6f99b1ffe91253666d3b0df0bd8ae60acb'
PINS = {
    'agent.py': '0c51c5d15d20ae3977f2e00d75763c30a87de9a766d2792af7c7407515bc5a26',
    'legacy_trunks.py': 'bc98275b769a6df0632dab241a993d54f3f028f7b62ae870000c8ed9addff9bf',
}


def check_path(path, directory=False):
    for part in (path, *path.parents):
        if part.is_symlink():
            raise RuntimeError('Symlink inesperado: ' + str(part))
    if path.exists():
        info = path.stat()
        if not (stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)):
            raise RuntimeError('Tipo inesperado: ' + str(path))
        if info.st_uid != OWNER_UID or info.st_mode & 0o022:
            raise RuntimeError('Propriedade ou permissoes inseguras: ' + str(path))
    # Existing parent directories must be protected too. /tmp fixture ancestors
    # are permitted only when sticky, as on standard Linux temporary roots.
    for parent in path.parents:
        info = parent.stat()
        if info.st_uid != OWNER_UID and info.st_uid != 0:
            raise RuntimeError('Diretorio ancestral sem propriedade protegida.')
        if info.st_mode & 0o022 and not info.st_mode & stat.S_ISVTX:
            raise RuntimeError('Diretorio ancestral gravavel por terceiros.')


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def service(*args):
    subprocess.run(['systemctl', *args], check=True)


def atomic(path, raw, mode, uid, gid):
    fd, temporary = tempfile.mkstemp(prefix='.' + path.name + '.', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
            os.fchown(stream.fileno(), uid, gid)
            os.fchmod(stream.fileno(), mode)
        os.replace(temporary, path)
        directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)


def snapshot(path):
    check_path(path)
    if not path.exists(): return None
    info = path.stat()
    return (path.read_bytes(), stat.S_IMODE(info.st_mode), info.st_uid, info.st_gid)


def cancelled(signum, frame):
    raise RuntimeError('Atualizacao interrompida pelo sinal ' + str(signum))


for sig in (signal.SIGTERM, signal.SIGINT): signal.signal(sig, cancelled)
os.umask(0o077)
check_path(STAGE, directory=True)
check_path(TARGET, directory=True)
check_path(BACKUP_ROOT, directory=True)
check_path(TARGET / 'agent.py')
if digest((TARGET / 'agent.py').read_bytes()) != PREVIOUS_SHA:
    raise RuntimeError('Agente instalado mudou; reconciliar antes de aplicar.')
bundle = {}
for name, pin in PINS.items():
    path = STAGE / name
    check_path(path)
    raw = path.read_bytes()
    if digest(raw) != pin:
        raise RuntimeError('SHA de staging invalido: ' + name)
    compile(raw, str(path), 'exec')
    bundle[TARGET / name] = raw

# Import the installed predecessor, never executable staging code.
sys.path.insert(0, str(TARGET))
spec = importlib.util.spec_from_file_location('legacy_installer_previous_worker', TARGET / 'agent.py')
pbx = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pbx)
pbx.require_root()
with pbx.operation_lock():
    check_path(TARGET, directory=True)
    if digest((TARGET / 'agent.py').read_bytes()) != PREVIOUS_SHA:
        raise RuntimeError('Agente instalado mudou durante a preparacao.')
    service('is-active', '--quiet', 'asterisk')
    service('is-active', '--quiet', 'union-pbx-agent')
    pbx.assert_no_calls()
    snapshots = {path: snapshot(path) for path in bundle}
    backup = Path(tempfile.mkdtemp(prefix='union-pbx-legacy-trunks-backup-', dir=BACKUP_ROOT))
    manifest = {}
    for index, (path, previous) in enumerate(snapshots.items()):
        if previous is None:
            manifest[str(path)] = {'absent_before': True}
        else:
            raw, mode, uid, gid = previous
            filename = str(index) + '-' + path.name
            atomic(backup / filename, raw, 0o600, OWNER_UID, os.getgid())
            manifest[str(path)] = {'file': filename, 'mode': mode, 'uid': uid, 'gid': gid, 'previous_sha256': digest(raw)}
        manifest[str(path)]['expected_sha256'] = digest(bundle[path])
    atomic(backup / 'manifest.json', (json.dumps(manifest, sort_keys=True) + '\n').encode(), 0o600, OWNER_UID, os.getgid())
    touched = []
    stopping = False
    try:
        pbx.assert_no_calls()
        stopping = True  # A failing stop can still have stopped the worker.
        service('stop', 'union-pbx-agent')
        pbx.assert_no_calls()
        for path, raw in bundle.items():
            if snapshot(path) != snapshots[path]:
                raise RuntimeError('Arquivo mudou durante a preparacao: ' + str(path))
            touched.append(path)
            atomic(path, raw, 0o755, OWNER_UID, os.getgid())
        service('start', 'union-pbx-agent')
        service('is-active', '--quiet', 'union-pbx-agent')
        service('is-active', '--quiet', 'asterisk')
    except BaseException:
        # Avoid a second termination signal interrupting recovery.
        for sig in (signal.SIGTERM, signal.SIGINT): signal.signal(sig, signal.SIG_IGN)
        errors = []
        if stopping:
            try: service('stop', 'union-pbx-agent')
            except Exception: pass
        for path in reversed(touched):
            try:
                current = snapshot(path)
                previous = snapshots[path]
                # Preserve content or metadata changed outside this transaction.
                installed = (bundle[path], 0o755, OWNER_UID, os.getgid())
                if current not in (previous, installed):
                    raise RuntimeError('Mudanca externa preservada: ' + str(path))
                if previous is None:
                    path.unlink(missing_ok=True)
                    directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
                    try: os.fsync(directory_fd)
                    finally: os.close(directory_fd)
                else: atomic(path, *previous)
            except Exception as exc: errors.append(str(exc))
        if stopping:
            try:
                service('start', 'union-pbx-agent')
                service('is-active', '--quiet', 'union-pbx-agent')
            except Exception as exc: errors.append(str(exc))
        print('Atualizacao falhou; backup: ' + str(backup), file=sys.stderr)
        if errors: print('Recuperacao exige revisao: ' + '; '.join(errors), file=sys.stderr)
        raise
    print(json.dumps({'installed': list(PINS), 'backup': str(backup), 'asterisk_reloaded': False,
                      'new_profile_services_started': False, 'services_restarted': ['union-pbx-agent'], 'agent_restarted': True}))
PY
