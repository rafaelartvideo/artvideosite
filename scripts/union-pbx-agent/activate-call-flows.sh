#!/usr/bin/env bash
# Reviewed runtime files and service write access only. Never reload Asterisk.
set -euo pipefail
umask 077
[[ "${1:-}" == '--acknowledge-call-flow-update' && "$#" == 1 ]] || { echo 'Aprovacao explicita necessaria.' >&2; exit 2; }
[[ "$(id -u)" == 0 ]] || exit 2
stage="$(cd -- "$(dirname -- "$0")" && pwd)"
python3 - "$stage" <<'PY'
import grp
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
UNITS = Path('/etc/systemd/system')
SOUNDS = Path('/var/lib/asterisk/sounds/union')
BACKUP_ROOT = Path('/root')
PREVIOUS_SHA = '643e10620fc77a65103e4956b6fba47422f4fed1c8df5c52113f397975a60acd'
# ROOT must replace all three placeholders with hashes of the final LF sources.
PINS = {
    'agent.py': 'd119546868b5581f24c31d2fe365f01e5547aa7b2cd1cd2fe525b504f41aa884',
    'flow_runtime.py': 'c713b0a9c4b55710eb3ae366b3c233d9e762d354018a9a15a9a160771171b38a',
    'call_flows.py': '28ca3b3231df38b4675c14f5970f072e07a7d5e66cc493bc68b30d9485c1604c',
}
DROPIN_NAME = '70-union-call-flow-sounds.conf'
DROPIN = ('[Service]\nReadWritePaths=' + str(SOUNDS) + '\n').encode()


def check_path(path, directory=False):
    # Reject symlink ancestors as well as the final component.
    for part in (path, *path.parents):
        if part.is_symlink():
            raise RuntimeError('Symlink inesperado: ' + str(part))
    if path.exists() and (not path.is_dir() if directory else not path.is_file()):
        raise RuntimeError('Tipo de arquivo inesperado: ' + str(path))


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
        if os.path.exists(temporary):
            os.unlink(temporary)


def cancelled(signum, frame):
    raise RuntimeError('Atualizacao interrompida pelo sinal ' + str(signum))


for sig in (signal.SIGTERM, signal.SIGINT):
    signal.signal(sig, cancelled)
os.umask(0o077)
check_path(TARGET, directory=True)
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

# Always load the already installed worker; staging modules cannot shadow it.
sys.path.insert(0, str(TARGET))
spec = importlib.util.spec_from_file_location('call_flow_installer_previous_worker', TARGET / 'agent.py')
pbx = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pbx)
pbx.require_root()
with pbx.operation_lock():
    # Recheck the pinned starting point after acquiring the shared operation lock.
    if digest((TARGET / 'agent.py').read_bytes()) != PREVIOUS_SHA:
        raise RuntimeError('Agente instalado mudou durante a preparacao.')
    service('is-active', '--quiet', 'asterisk')
    service('is-active', '--quiet', 'union-pbx-agent')
    pbx.assert_no_calls()
    group = grp.getgrnam("asterisk").gr_gid
    check_path(UNITS, directory=True)
    check_path(SOUNDS.parent, directory=True)
    if not SOUNDS.parent.is_dir():
        raise RuntimeError('Diretorio de sons do Asterisk inexistente.')
    check_path(SOUNDS, directory=True)
    if SOUNDS.exists():
        info = SOUNDS.stat()
        if (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) != (OWNER_UID, group, 0o750):
            raise RuntimeError('Diretorio de avisos existente tem permissoes diferentes; revisar.')
    for unit in ('union-pbx-agent.service', 'union-pbx-agent@.service'):
        check_path(UNITS / unit)
        if not (UNITS / unit).is_file():
            raise RuntimeError('Unidade existente obrigatoria: ' + unit)
        directory = UNITS / (unit + '.d')
        check_path(directory, directory=True)
        path = directory / DROPIN_NAME
        check_path(path)
        if path.exists() and path.read_bytes() != DROPIN:
            raise RuntimeError('Dropin existente diferente; nenhuma substituicao: ' + str(path))
        bundle[path] = DROPIN
    for path in bundle:
        check_path(path)
    backup = Path(tempfile.mkdtemp(prefix='union-pbx-call-flows-backup-', dir=BACKUP_ROOT))
    snapshots = {}
    manifest = {}
    for index, path in enumerate(bundle):
        if path.exists():
            info = path.stat()
            raw = path.read_bytes()
            snapshots[path] = (raw, stat.S_IMODE(info.st_mode), info.st_uid, info.st_gid)
            filename = str(index) + '-' + path.name
            atomic(backup / filename, raw, 0o600, OWNER_UID, os.getgid())
            manifest[str(path)] = {'file': filename, 'mode': stat.S_IMODE(info.st_mode), 'uid': info.st_uid, 'gid': info.st_gid}
        else:
            snapshots[path] = None
            manifest[str(path)] = {'absent_before': True}
        manifest[str(path)]['expected_sha256'] = digest(bundle[path])
    manifest['sounds_directory_absent_before'] = not SOUNDS.exists()
    atomic(backup / 'manifest.json', (json.dumps(manifest, sort_keys=True) + '\n').encode(), 0o600, OWNER_UID, os.getgid())
    touched = []
    created_dirs = []
    stopping = False
    try:
        pbx.assert_no_calls()
        stopping = True  # stop may stop the process and still return failure.
        service('stop', 'union-pbx-agent')
        pbx.assert_no_calls()
        if not SOUNDS.exists():
            SOUNDS.mkdir(mode=0o750)
            created_dirs.append(SOUNDS)
            os.chown(SOUNDS, OWNER_UID, group)
            os.chmod(SOUNDS, 0o750)
        for path, raw in bundle.items():
            check_path(path)
            previous = snapshots[path]
            current = path.read_bytes() if path.exists() else None
            if current != (previous[0] if previous is not None else None):
                raise RuntimeError('Arquivo mudou durante a preparacao: ' + str(path))
            if snapshots[path] is not None and snapshots[path][0] == raw:
                continue
            if not path.parent.exists():
                path.parent.mkdir(mode=0o755)
                created_dirs.append(path.parent)
                os.chmod(path.parent, 0o755)
            touched.append(path)
            mode = 0o755 if path.parent == TARGET else 0o644
            atomic(path, raw, mode, OWNER_UID, os.getgid())
        service('daemon-reload')
        service('start', 'union-pbx-agent')
        service('is-active', '--quiet', 'union-pbx-agent')
        service('is-active', '--quiet', 'asterisk')
    except BaseException:
        errors = []
        if stopping:
            try:
                service('stop', 'union-pbx-agent')
            except Exception:
                pass
        for path in reversed(touched):
            try:
                check_path(path)
                previous = snapshots[path]
                current = path.read_bytes() if path.exists() else None
                accepted = (None, bundle[path]) if previous is None else (previous[0], bundle[path])
                if current not in accepted:
                    raise RuntimeError('Mudanca externa preservada: ' + str(path))
                if previous is None:
                    path.unlink(missing_ok=True)
                else:
                    atomic(path, *previous)
            except Exception as exc:
                errors.append(str(exc))
        for directory in reversed(created_dirs):
            try:
                directory.rmdir()  # Never recursively remove files created by another process.
            except OSError as exc:
                errors.append(str(exc))
        for args in (('daemon-reload',), ('start', 'union-pbx-agent')):
            try:
                service(*args)
            except Exception as exc:
                errors.append(str(exc))
        print('Atualizacao falhou; backup: ' + str(backup), file=sys.stderr)
        if errors:
            print('Recuperacao exige revisao: ' + '; '.join(errors), file=sys.stderr)
        raise
    print(json.dumps({'installed': list(PINS), 'backup': str(backup), 'asterisk_reloaded': False,
                      'profile_services_started': False, 'agent_restarted': True}))
PY
