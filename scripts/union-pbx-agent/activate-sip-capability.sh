#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ "$#" == 3 && "${1:-}" == '--acknowledge-sip-capability-update' && "${2:-}" == '--profile' ]] || exit 2
[[ "$(id -u)" == 0 ]] || exit 2
stage="$(cd -- "$(dirname -- "$0")" && pwd)"
python3 - "$stage" "$3" <<'PY'
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

STAGE = Path(sys.argv[1])
PROFILE = sys.argv[2]
TARGET = Path('/opt/union-pbx-agent')
BACKUP_ROOT = Path('/root')
OLD_SHA = '0f71121881cea72614a98a0fa2c473eafbc7dde22d52d35f2cf8b9220bf605c0'
RUNTIME_SHA = 'f23513b6b46fccad256882c474eda29cc5cc09ad05d60f3036775f1bb80aab6c'
AGENT_SHA = '0c51c5d15d20ae3977f2e00d75763c30a87de9a766d2792af7c7407515bc5a26'


def fail(): raise RuntimeError('Atualizacao SIP nao verificada.')


def cancelled(signum, frame): fail()


def checked(path, private=False):
    for part in (path, *path.parents):
        info = part.lstat()
        if stat.S_ISLNK(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022: fail()
    info = path.stat()
    if not stat.S_ISREG(info.st_mode) or (private and stat.S_IMODE(info.st_mode) != 0o600): fail()
    return info


def digest(raw): return hashlib.sha256(raw).hexdigest()


def service(*args):
    subprocess.run(['systemctl', *args], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def atomic(path, data, info):
    fd, temp = tempfile.mkstemp(prefix='.sip-capability-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            os.fchown(stream.fileno(), info.st_uid, info.st_gid)
            os.fchmod(stream.fileno(), stat.S_IMODE(info.st_mode))
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(directory)
        finally: os.close(directory)
    finally:
        if os.path.exists(temp): os.unlink(temp)


def activate(agent, profile, runtime, new):
    unit = 'union-pbx-agent@' + profile + '.service'
    service('is-active', '--quiet', 'asterisk')
    service('is-active', '--quiet', unit)
    with agent.operation_lock():
        agent.assert_no_calls()
        info = checked(runtime)
        old = runtime.read_bytes()
        if digest(old) != OLD_SHA: fail()
        backup = Path(tempfile.mkdtemp(prefix='union-sip-capability-', dir=BACKUP_ROOT))
        os.chmod(backup, 0o700)
        (backup/'runtime').write_bytes(old)
        os.chmod(backup/'runtime', 0o600)
        (backup/'metadata.json').write_text(json.dumps(dict(mode=stat.S_IMODE(info.st_mode), uid=info.st_uid, gid=info.st_gid, sha256=digest(old))))
        os.chmod(backup/'metadata.json', 0o600)
        stopping = False
        changed = False
        try:
            stopping = True
            service('stop', unit)
            agent.assert_no_calls()
            current = checked(runtime)
            if runtime.read_bytes() != old or (current.st_uid,current.st_gid,current.st_mode) != (info.st_uid,info.st_gid,info.st_mode): fail()
            changed = True
            atomic(runtime, new, info)
            service('start', unit)
            service('is-active', '--quiet', unit)
            service('is-active', '--quiet', 'asterisk')
        except BaseException:
            for sig in (signal.SIGTERM, signal.SIGINT): signal.signal(sig, signal.SIG_IGN)
            if stopping:
                try: service('stop', unit)
                except Exception: pass
            try:
                if changed:
                    current = checked(runtime)
                    if (current.st_uid,current.st_gid,current.st_mode) != (info.st_uid,info.st_gid,info.st_mode): fail()
                    current_bytes = runtime.read_bytes()
                    if current_bytes == new: atomic(runtime, old, info)
                    elif current_bytes != old: fail()
            finally:
                if stopping:
                    service('start', unit)
                    service('is-active', '--quiet', unit)
            fail()


def main():
    if os.geteuid() != 0 or str(uuid.UUID(PROFILE)) != PROFILE: fail()
    for sig in (signal.SIGTERM, signal.SIGINT): signal.signal(sig, cancelled)
    source = STAGE/'sip_trunk_runtime.py'
    installed_agent = TARGET/'agent.py'
    checked(source)
    checked(installed_agent)
    new = source.read_bytes()
    if digest(new) != RUNTIME_SHA or digest(installed_agent.read_bytes()) != AGENT_SHA: fail()
    # Import only the reviewed installed agent and its installed dependencies.
    sys.path.insert(0, str(TARGET))
    spec = importlib.util.spec_from_file_location('sip_capability_installed_agent', installed_agent)
    agent = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(agent)
    agent.select_profile(PROFILE)
    checked(agent.AGENT_CONFIG, True)
    if json.loads(agent.AGENT_CONFIG.read_text()).get('organization_id') != PROFILE: fail()
    activate(agent, PROFILE, TARGET/'sip_trunk_runtime.py', new)


if __name__ == '__main__':
    try: main()
    except BaseException:
        print('Atualizacao SIP nao concluida; verificar servico e backup privado.', file=sys.stderr)
        sys.exit(1)
PY
