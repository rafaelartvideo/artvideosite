#!/usr/bin/env python3
"""Upgrade ONLY the Union PBX agent code; no Asterisk restart or dialplan changes.

Preflight first. A guarded apply requires no active calls, a reviewed predecessor
hash, an exact signed-release agent hash, and explicit operator acknowledgement.
Existing local profiles, private keys, SIP files and Asterisk stay unchanged.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

TARGET = Path("/opt/union-pbx-agent/agent.py")
LOCK = Path("/var/lib/union-pbx-agent/asterisk-config.lock")
BACKUPS = Path("/root/union-pbx-efficiency-backups")
TENANTS = Path("/etc/union-pbx-agent/tenants")
NEW_SHA256 = "ffbedd77bf4a7d7cb740c4795c91fa3578116b3f21ac03303f732ed0f9cb2912"
# Earlier reviewed installer stages, not arbitrary runtime files.
REVIEWED_OLD = {
    "f79c14d7db658da300f46a1c0b233ac170962827abca69fa4101112158350827",
    "0c51c5d15d20ae3977f2e00d75763c30a87de9a766d2792af7c7407515bc5a26",
    "356d59d1b27c77682b4ab1bd5d9fbc6f99b1ffe91253666d3b0df0bd8ae60acb",
    "d119546868b5581f24c31d2fe365f01e5547aa7b2cd1cd2fe525b504f41aa884",
    "d4b1bcf28ffc31cc768bd0b7a72f11efad91a48036c6a2b2099636304c769a42",
    "643e10620fc77a65103e4956b6fba47422f4fed1c8df5c52113f397975a60acd",
    "f79c14d7db658da300f46a1c0b233ac170962827abca69fa4101112158350827",
}
SERVICE = "union-pbx-agent.service"


class UpgradeError(RuntimeError):
    pass


def check_path(path):
    """Reject any symlink in the path, not just a symlink final component."""
    for item in (path, *path.parents):
        if item.is_symlink():
            raise UpgradeError("Symlink em caminho de manutencao: " + str(item))
    if not path.is_file():
        raise UpgradeError("Arquivo obrigatorio ausente: " + str(path))


def digest(content):
    return hashlib.sha256(content).hexdigest()


def run(*args, timeout=20, check=True):
    result = subprocess.run(args, text=True, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=timeout, check=False)
    if check and result.returncode != 0:
        raise UpgradeError("Falha no comando: " + str(args[:2]))
    return result


def active_channels():
    output = run("asterisk", "-rx", "core show channels count").stdout
    match = re.search(r"(?m)^\s*(\d+)\s+active channels", output)
    if not match:
        raise UpgradeError("Nao foi possivel confirmar canais ativos do Asterisk.")
    return int(match.group(1))


def active_services():
    units = [SERVICE]
    if TENANTS.is_dir():
        for profile in sorted(TENANTS.glob("*/agent.json")):
            profile_id = profile.parent.name
            if not re.fullmatch(r"[a-f0-9-]{36}", profile_id):
                raise UpgradeError("Perfil inesperado; revisar antes do restart.")
            check_path(profile)
            units.append("union-pbx-agent@" + profile_id + ".service")
    active = [unit for unit in units
              if run("systemctl", "is-active", "--quiet", unit, check=False).returncode == 0]
    if not active:
        raise UpgradeError("Nenhum agente ativo identificado; nao iniciar servico novo.")
    return active


def stage_and_preflight(staged):
    if os.geteuid() != 0:
        raise UpgradeError("Execute como root no servidor da Union.")
    check_path(staged)
    check_path(TARGET)
    incoming = staged.read_bytes()
    current = TARGET.read_bytes()
    if digest(incoming) != NEW_SHA256:
        raise UpgradeError("SHA256 do agente de destino nao corresponde ao pacote auditado.")
    compile(incoming, str(staged), "exec")
    previous = digest(current)
    if previous != NEW_SHA256 and previous not in REVIEWED_OLD:
        raise UpgradeError("Versao instalada diferente das versoes auditadas: " + previous)
    run("systemctl", "is-active", "--quiet", "asterisk.service")
    units = active_services()
    channels = active_channels()
    return previous, channels, units, incoming


def atomic_write(dest, data, before_stat):
    fd, tmp = tempfile.mkstemp(prefix="." + dest.name + ".", dir=dest.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
            os.fchown(handle.fileno(), before_stat.st_uid, before_stat.st_gid)
            os.fchmod(handle.fileno(), stat.S_IMODE(before_stat.st_mode))
        os.replace(tmp, dest)
        fd_dir = os.open(dest.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd_dir)
        finally:
            os.close(fd_dir)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def upgrade(staged):
    old_sha, calls, running, incoming = stage_and_preflight(staged)
    if old_sha == NEW_SHA256:
        print(json.dumps({"status": "already_current", "sha256": old_sha}))
        return
    if calls:
        raise UpgradeError("Ha chamadas ativas; agente preservado sem reinicio.")
    LOCK.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(LOCK, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise UpgradeError("PABX ocupado com outra operacao; nenhum arquivo modificado.") from None
        # Recheck under the same lock used by the agent provisioning workers.
        check_path(TARGET)
        old = TARGET.read_bytes()
        if digest(old) != old_sha or active_channels():
            raise UpgradeError("Versao mudou ou chamada foi iniciada; nenhum arquivo modificado.")
        running = active_services()
        before_stat = TARGET.stat()
        BACKUPS.mkdir(mode=0o700, parents=True, exist_ok=True)
        if stat.S_IMODE(BACKUPS.stat().st_mode) & 0o077:
            raise UpgradeError("Diretorio de backup nao e privado.")
        name = datetime.now(timezone.utc).strftime("agent-%Y%m%d-%H%M%S-") + old_sha[:12] + ".py"
        backup = BACKUPS / name
        bfd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            with os.fdopen(bfd, "wb") as handle:
                handle.write(old)
                handle.flush()
                os.fsync(handle.fileno())
        except BaseException:
            backup.unlink(missing_ok=True)
            raise
        if digest(backup.read_bytes()) != old_sha:
            raise UpgradeError("Falha de integridade do backup; operacao cancelada.")
        stopped = []
        replacement_attempted = False
        try:
            for unit in running:
                stopped.append(unit)
                run("systemctl", "stop", unit, timeout=35)
            if active_channels():
                raise UpgradeError("Chamadas detectadas apos parada; restaurando agentes.")
            replacement_attempted = True
            atomic_write(TARGET, incoming, before_stat)
            if digest(TARGET.read_bytes()) != NEW_SHA256:
                raise UpgradeError("Verificacao apos substituicao falhou.")
            for unit in running:
                run("systemctl", "start", unit, timeout=35)
                run("systemctl", "is-active", "--quiet", unit)
            run("systemctl", "is-active", "--quiet", "asterisk.service")
            print(json.dumps({"status": "upgraded", "from": old_sha,
                              "to": NEW_SHA256, "backed_up": str(backup),
                              "services_restarted": running,
                              "asterisk_restarted": False}))
        except BaseException as original_failure:
            errors = []
            for unit in running:
                try:
                    run("systemctl", "stop", unit, timeout=35)
                except Exception as exc:
                    errors.append("stop " + unit + ": " + str(exc))
            if replacement_attempted:
                try:
                    atomic_write(TARGET, old, before_stat)
                except Exception as exc:
                    errors.append("restore agent: " + str(exc))
            for unit in stopped:
                try:
                    run("systemctl", "start", unit, timeout=35)
                    run("systemctl", "is-active", "--quiet", unit)
                except Exception as exc:
                    errors.append("start " + unit + ": " + str(exc))
            print("Falha de atualizacao; backup: " + str(backup), file=sys.stderr)
            if errors:
                print("ALERTA: rollback requer verificacao: " + "; ".join(errors), file=sys.stderr)
            raise original_failure
    finally:
        os.close(fd)


def main():
    parser = argparse.ArgumentParser(description="Atualizacao controlada somente do agente PBX")
    parser.add_argument("staged_agent", type=Path,
                        help="Arquivo agent.py revisado e baixado previamente")
    sub = parser.add_subparsers(dest="action", required=True)
    sub.add_parser("inspect")
    applier = sub.add_parser("apply")
    applier.add_argument("--acknowledge-agent-restart", action="store_true")
    args = parser.parse_args()
    try:
        previous, calls, units, _ = stage_and_preflight(args.staged_agent)
        if args.action == "inspect":
            print(json.dumps({"current_sha256": previous, "desired_sha256": NEW_SHA256,
                              "active_channels": calls, "active_agent_units": units,
                              "upgrade_needed": previous != NEW_SHA256,
                              "can_apply_now": calls == 0}))
        else:
            if not args.acknowledge_agent_restart:
                raise UpgradeError("Exija --acknowledge-agent-restart; sem alteracoes.")
            upgrade(args.staged_agent)
    except (UpgradeError, OSError, subprocess.TimeoutExpired) as exc:
        print("BLOQUEADO: " + str(exc), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
