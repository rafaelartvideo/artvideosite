#!/usr/bin/env bash
# Reviewed runtime files and service write access only. Never reload Asterisk.
set -euo pipefail
umask 077
[[ "${1:-}" == '--acknowledge-recording-update' && "$#" == 1 ]] || { echo 'Aprovacao explicita necessaria.' >&2; exit 2; }
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
import uuid

OWNER_UID = 0
STAGE = Path(sys.argv[1])
TARGET = Path('/opt/union-pbx-agent')
UNITS = Path('/etc/systemd/system')
SOUNDS = Path('/var/lib/asterisk/sounds/union')
BACKUP_ROOT = Path('/root')
PREVIOUS_SHA = 'd4b1bcf28ffc31cc768bd0b7a72f11efad91a48036c6a2b2099636304c769a42'
# Exact reviewed LF sources; never accept a different predecessor or bundle.
PINS = {
    'agent.py': '356d59d1b27c77682b4ab1bd5d9fbc6f99b1ffe91253666d3b0df0bd8ae60acb',
    'sip_trunk_runtime.py': '0f71121881cea72614a98a0fa2c473eafbc7dde22d52d35f2cf8b9220bf605c0',
    'recordings.py': '185627cfa7eac2fd64cbda6efa87557227020212815f7d5eee8a8d5f53948e1f',
    'recording_agi.py': '7b46af693068215da981a56072dfed8f27d49854f6a8d78bb9a35046cfea3732',
    'recording_runtime.py': '6a0ca9007c87dd414983497b0eb9333de19cd2bd5d581c21d7ad3f63ea0a6c17',
    'recording_upload.py': '460aafd8ae3fce71d8fbb6f2f5eaa7592fa4a2779f908d1adb369623dd60fa3b',
    'inbound_router.py': '9204c804a9976747217eeca3b081c01f25ffc68f9f995a51ab1ac37b026787ce',
    'outbound_router.py': '983652a5c6bd1ca441753720ca2210ac7ee81463a0b3dd6c1105e929480f2430',
}
DROPIN_NAME = '80-union-recordings.conf'
POLICY_DIR = Path('/etc/asterisk/union-recording-policies')
SPOOL_DIR = Path('/var/spool/asterisk/union-recordings')
TENANTS = Path('/etc/union-pbx-agent/tenants')
DROPIN = ('[Service]\nReadWritePaths=' + str(POLICY_DIR) + ' ' + str(SPOOL_DIR) + '\n').encode()


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
    running_services = ['union-pbx-agent']
    for config_file in TENANTS.glob('*/agent.json'):
        check_path(config_file)
        org = config_file.parent.name
        if str(uuid.UUID(org)) != org or config_file.stat().st_uid != OWNER_UID or config_file.stat().st_mode & 0o077:
            raise RuntimeError('Perfil existente sem propriedade privada verificavel.')
        if json.loads(config_file.read_text()).get('organization_id') != org:
            raise RuntimeError('Identidade de perfil existente divergiu.')
        unit = 'union-pbx-agent@' + org + '.service'
        result = subprocess.run(['systemctl','is-active','--quiet',unit], stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        if result.returncode == 0: running_services.append(unit)
    for directory in (POLICY_DIR,SPOOL_DIR):
        check_path(directory,directory=True)
        if not directory.parent.is_dir(): raise RuntimeError('Diretorio pai de gravacoes ausente.')
        if directory.exists():
            info=directory.stat()
            if (info.st_uid,info.st_gid,stat.S_IMODE(info.st_mode)) != (OWNER_UID,group,0o750):
                raise RuntimeError('Diretorio de gravacoes existente exige revisao.')
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
    backup = Path(tempfile.mkdtemp(prefix='union-pbx-recordings-backup-', dir=BACKUP_ROOT))
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
        for unit in running_services: service('stop',unit)
        pbx.assert_no_calls()
        if not SOUNDS.exists():
            SOUNDS.mkdir(mode=0o750)
            created_dirs.append(SOUNDS)
            os.chown(SOUNDS, OWNER_UID, group)
            os.chmod(SOUNDS, 0o750)
        for directory in (POLICY_DIR,SPOOL_DIR):
            if not directory.exists():
                directory.mkdir(mode=0o750)
                created_dirs.append(directory)
                os.chown(directory,OWNER_UID,group)
                os.chmod(directory,0o750)
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
        for unit in running_services:
            service('start',unit)
            service('is-active','--quiet',unit)
        service('is-active', '--quiet', 'asterisk')
    except BaseException:
        errors = []
        if stopping:
            for unit in running_services:
                try: service('stop',unit)
                except Exception: pass
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
        for args in [('daemon-reload',)]+[('start',unit) for unit in running_services]:
            try:
                service(*args)
            except Exception as exc:
                errors.append(str(exc))
        print('Atualizacao falhou; backup: ' + str(backup), file=sys.stderr)
        if errors:
            print('Recuperacao exige revisao: ' + '; '.join(errors), file=sys.stderr)
        raise
    print(json.dumps({'installed': list(PINS), 'backup': str(backup), 'asterisk_reloaded': False,
                      'new_profile_services_started': False, 'services_restarted': running_services, 'agent_restarted': True}))
PY
