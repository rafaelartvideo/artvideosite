#!/usr/bin/env python3
"""FVX inbound routing staging: opt-in only, never called by the agent's run loop.

Stays on the existing union-301 until a root operator explicitly enables another
destination. Do not change credentials, registration, trunk or public SIP ports.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sys
import time

import agent as pbx

FVX = Path("/etc/asterisk/extensions.d/union-fvx.conf")
TARGET = Path("/etc/asterisk/extensions.d/union-fvx-managed.conf")
STATE = Path("/var/lib/union-pbx-agent/inbound-fvx-router.json")
BACKUPS = Path("/root/union-pbx-inbound-backups")
CONTEXT = "union-fvx-managed"
INCLUDE = '#include "extensions.d/union-fvx-managed.conf"'
DIRECT = " same => n,Dial(PJSIP/union-301,25)"
GOSUB = " same => n,Gosub(union-fvx-managed,s,1)"
EXPECTED = """[union-entrada]

exten => s,1,NoOp(Chamada recebida Union World)
 same => n,Dial(PJSIP/union-301,25)
 same => n,NoOp(Resultado: ${DIALSTATUS})
 same => n,Hangup()

exten => _X.,1,Goto(s,1)

exten => h,1,NoOp(Chamada Union World encerrada)
"""


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def is_original(raw):
    try:
        return raw.decode("utf8").strip() == EXPECTED.strip()
    except UnicodeError:
        return False


def staged_source(raw):
    if not is_original(raw) or raw.decode().count(DIRECT) != 1:
        raise pbx.AgentError("FVX diferente do dialplan auditado: nenhuma alteracao permitida.")
    result = raw.decode().replace(DIRECT, GOSUB, 1).rstrip("\n")
    return (result + "\n\n" + INCLUDE + "\n").encode()


def direct_route():
    return (
        "; Union FVX: encaminhamento original para ramal 301.\n"
        "[union-fvx-managed]\n"
        "exten => s,1,Dial(PJSIP/union-301,25)\n"
        " same => n,Return()\n"
    ).encode()


def queue_route(queue):
    uid = str(pbx.uuid.UUID(queue["id"]))
    if uid != queue["id"] or queue["enabled"] is not True:
        raise pbx.AgentError("Fila de destino invalida.")
    name = pbx.queue_identity(uid)
    limit = queue["max_wait_seconds"]
    if type(limit) is not int or not 30 <= limit <= 300:
        raise pbx.AgentError("Tempo de espera fora dos limites.")
    return (
        "; Union FVX: fila com fallback no ramal 301.\n"
        "[union-fvx-managed]\n"
        "exten => s,1,NoOp(Encaminhamento FVX para fila Union)\n"
        " same => n,GotoIf($[${QUEUE_MEMBER(" + name + ",count)} > 0]?fila:reserva)\n"
        # Keep the inbound SIP call in ringing state until an agent answers.
        # Queue() does not answer itself; r provides ringback instead of MOH.
        " same => n(fila),Ringing()\n"
        " same => n,Queue(" + name + ",r,,," + str(limit) + ")\n"
        " same => n,NoOp(Resultado fila: ${QUEUESTATUS})\n"
        " same => n(reserva),Dial(PJSIP/union-301,25)\n"
        " same => n,Return()\n"
    ).encode()


def read_state():
    if not STATE.exists():
        return None
    state = json.loads(STATE.read_text())
    if state.get("version") != 1:
        raise pbx.AgentError("Estado de roteamento FVX desconhecido.")
    return state


def registered():
    status = pbx.asterisk("pjsip show registrations")
    if not re.search(r"union-fvx-registration/\S+\s+\S+\s+Registered\b",status):
        raise pbx.AgentError("A linha FVX nao esta Registered; alteracao bloqueada.")
    return status


def baseline():
    if FVX.is_symlink() or not FVX.is_file() or not is_original(FVX.read_bytes()):
        raise pbx.AgentError("union-fvx.conf diverge do arquivo original auditado.")
    if TARGET.exists() or STATE.exists():
        raise pbx.AgentError("O roteador FVX ja existe ou o arquivo de destino esta em uso.")
    if not pbx.DIALPLAN_MAIN.is_file() or (
      pbx.DIALPLAN_MAIN.read_text().count('#include "extensions.d/union-fvx.conf"') != 1
    ):
        raise pbx.AgentError("Include principal da FVX ausente ou duplicado.")


def verify_control(state):
    if not TARGET.is_file() or not FVX.is_file() or FVX.is_symlink() or TARGET.is_symlink():
        raise pbx.AgentError("Arquivos do roteamento FVX ausentes ou links inesperados.")
    if digest(FVX.read_bytes()) != state["source_sha"] or \
       digest(TARGET.read_bytes()) != state["route_sha"]:
        raise pbx.AgentError("Arquivos FVX modificados fora do roteador; operacao bloqueada.")


def verify_dialplan(mode, queue_name=None):
    inbound=pbx.asterisk("dialplan show union-entrada")
    delegated=pbx.asterisk("dialplan show "+CONTEXT)
    if not all(x in inbound for x in (
        "Gosub(union-fvx-managed,s,1)", "Goto(s,1)", "Chamada Union World encerrada"
    )):
        raise pbx.AgentError("O dialplan nao preservou as rotas originais FVX.")
    if "[ Context 'union-fvx-managed'" not in delegated or \
       "Dial(PJSIP/union-301,25)" not in delegated:
        raise pbx.AgentError("A rota de emergencia para 301 nao foi carregada.")
    if mode=="queue" and (not queue_name or "Queue("+queue_name+"," not in delegated):
        raise pbx.AgentError("O Asterisk nao confirmou a fila selecionada.")


def write(path,data,stat=None,gid=None):
    pbx.write_atomic(path,data,(stat.st_mode & 0o777) if stat else 0o640,
                     stat.st_gid if stat else gid)


def select_queue(number):
    if type(number) is not int or number < 850 or number > 899:
        raise pbx.AgentError("Numero de fila permitido: 850 a 899.")
    found=[item for item in pbx.queue_states().values()
           if item["enabled"] and item["test_extension"]==number]
    if len(found)!=1:
        raise pbx.AgentError("Fila nao ativa ou inexistente no agente.")
    queue=found[0]
    name=pbx.queue_identity(queue["id"])
    # Use the same full status report that operators see with "queue show".
    # Depending on Asterisk CLI formatting, queue show <name> can differ.
    # Inspect ONLY the selected queue's Members section and exact configured
    # PJSIP endpoints; never accept an available member of a different queue.
    live=pbx.strip_ansi(pbx.asterisk("queue show"))
    found=False
    inside=False
    reading_members=False
    available=False
    endpoints={member["endpoint_name"] for member in queue["members"]}
    for line in live.splitlines():
        heading=re.match(r"^\s*(\S+) has \d+ calls?\b",line)
        if heading:
            inside=heading.group(1)==name
            found=found or inside
            reading_members=False
            continue
        if not inside:
            continue
        stripped=line.strip()
        if stripped=="Members:":
            reading_members=True
            continue
        if stripped.startswith(("Callers:","No Callers","No Members")):
            reading_members=False
            continue
        if not reading_members or "(Not in use)" not in line:
            continue
        if re.search(r"\bpaused\b",line,re.IGNORECASE):
            continue
        for endpoint in endpoints:
            if re.search(r"\(PJSIP/"+re.escape(endpoint)+r"\)(?:\s|$)",line):
                available=True
                break
    if not found:
        raise pbx.AgentError("Fila nao encontrada no Asterisk.")
    if not available:
        raise pbx.AgentError(
            "Nenhum ramal disponivel na fila selecionada (confira queue show)."
        )
    return queue,name


def show_status():
    state=read_state()
    if not state:
        print("FVX original presente:",is_original(FVX.read_bytes()))
        print("Roteamento gerenciado: NAO PREPARADO. Nenhuma alteracao.")
    else:
        verify_control(state)
        print("Roteamento preparado; destino:",state["mode"],
              "fila:",state.get("number"))


def preview(number):
    if read_state() is None:
        baseline()
    else:
        verify_control(read_state())
    registered()
    if number is not None:
        queue,name=select_queue(number)
        print("Fila de teste confirmada:",number,name,
              "limite",queue["max_wait_seconds"],"segundos")
    print("PREVIEW: consulta somente leitura; nenhuma chamada ou rota alterada.")


def prepare():
    """Explicit first switch to a DIRECT_301 subroutine; no queue activation."""
    baseline()
    pbx.assert_no_calls()
    before_fvx=registered()
    original=FVX.read_bytes()
    stat=FVX.stat()
    backup_name=time.strftime("%Y%m%d-%H%M%S")+"-"+secrets.token_hex(4)+".conf"
    BACKUPS.mkdir(parents=True,exist_ok=True,mode=0o700)
    os.chmod(BACKUPS,0o700)
    backup=BACKUPS/backup_name
    pbx.write_atomic(backup,original,0o600)
    staged=staged_source(original)
    route=direct_route()
    group=pbx.grp.getgrnam("asterisk").gr_gid
    state={
      "version":1,"backup":str(backup),"original_sha":digest(original),
      "source_sha":digest(staged),"route_sha":digest(route),
      "mode":"direct_301","number":None,
    }
    try:
        write(TARGET,route,gid=group)
        write(FVX,staged,stat=stat)
        if "reloaded" not in pbx.asterisk("dialplan reload").lower():
            raise pbx.AgentError("Falha ao recarregar o dialplan FVX.")
        verify_dialplan("direct_301")
        pbx.assert_fvx(before_fvx)
        pbx.write_atomic(STATE,pbx.json_bytes(state),0o600)
    except Exception:
        write(FVX,original,stat=stat)
        TARGET.unlink(missing_ok=True)
        STATE.unlink(missing_ok=True)
        try:
            pbx.asterisk("dialplan reload")
        except Exception:
            print("CRITICO: confirme manualmente a volta do 301.",file=sys.stderr)
        raise
    print("FVX preparada com fallback original: ramal 301 (fila NAO ativada).")


def change(mode,number=None):
    state=read_state()
    if not state:
        raise pbx.AgentError("A preparacao manual da FVX ainda nao foi executada.")
    verify_control(state)
    pbx.assert_no_calls()
    before_fvx=registered()
    queue,name=select_queue(number) if mode=="queue" else (None,None)
    generated=queue_route(queue) if queue else direct_route()
    old=TARGET.read_bytes()
    stat=TARGET.stat()
    try:
        write(TARGET,generated,stat=stat)
        if "reloaded" not in pbx.asterisk("dialplan reload").lower():
            raise pbx.AgentError("Asterisk nao confirmou a recarga do dialplan.")
        verify_dialplan(mode,name)
        pbx.assert_fvx(before_fvx)
        next_state={**state,"route_sha":digest(generated),"mode":mode,
                    "number":number if queue else None}
        pbx.write_atomic(STATE,pbx.json_bytes(next_state),0o600)
    except Exception:
        write(TARGET,old,stat=stat)
        try:
            pbx.asterisk("dialplan reload")
        except Exception:
            print("CRITICO: revise a volta do destino anterior.",file=sys.stderr)
        raise
    print("Rota FVX ativa:",("ramal 301" if mode=="direct_301" else "fila "+str(number)))


def restore_original():
    state=read_state()
    if not state:
        raise pbx.AgentError("Preparacao FVX nao encontrada.")
    verify_control(state)
    pbx.assert_no_calls()
    before_fvx=registered()
    backup=Path(state["backup"])
    if backup.parent!=BACKUPS or backup.is_symlink() or not backup.is_file():
        raise pbx.AgentError("Backup original fora do local permitido ou ausente.")
    original=backup.read_bytes()
    if digest(original)!=state["original_sha"] or not is_original(original):
        raise pbx.AgentError("Backup original nao corresponde a FVX auditada.")
    old_source=FVX.read_bytes()
    old_route=TARGET.read_bytes()
    stat=FVX.stat()
    try:
        write(FVX,original,stat=stat)
        TARGET.unlink()
        if "reloaded" not in pbx.asterisk("dialplan reload").lower():
            raise pbx.AgentError("Falha ao restaurar o dialplan.")
        result=pbx.asterisk("dialplan show union-entrada")
        if "Dial(PJSIP/union-301,25)" not in result or \
           "Gosub(union-fvx-managed,s,1)" in result:
            raise pbx.AgentError("Restauração original do ramal 301 nao confirmada.")
        pbx.assert_fvx(before_fvx)
        STATE.unlink()
    except Exception:
        write(FVX,old_source,stat=stat)
        write(TARGET,old_route,gid=pbx.grp.getgrnam("asterisk").gr_gid)
        try:
            pbx.asterisk("dialplan reload")
        except Exception:
            print("CRITICO: confira o estado da linha FVX.",file=sys.stderr)
        raise
    print("FVX RESTAURADA: Dial(PJSIP/union-301,25) original.")


def main():
    parser=argparse.ArgumentParser(description="Union FVX: mudança de rota manual e reversível")
    sub=parser.add_subparsers(dest="action",required=True)
    sub.add_parser("status")
    check=sub.add_parser("preview")
    check.add_argument("--queue",type=int)
    for action in ("prepare","activate-queue","restore-301","restore-original"):
        subparser=sub.add_parser(action)
        subparser.add_argument("--acknowledge-live-change",action="store_true")
        if action=="activate-queue":
            subparser.add_argument("--queue",type=int,required=True)
    args=parser.parse_args()
    try:
        if args.action=="status":
            show_status()
        elif args.action=="preview":
            preview(args.queue)
        else:
            if not args.acknowledge_live_change:
                raise pbx.AgentError(
                    "Mudanca bloqueada: informe --acknowledge-live-change explicitamente."
                )
            pbx.require_root()
            if args.action=="prepare":
                prepare()
            elif args.action=="activate-queue":
                change("queue",args.queue)
            elif args.action=="restore-301":
                change("direct_301")
            elif args.action=="restore-original":
                restore_original()
    except Exception as exc:
        print("Erro: "+str(exc),file=sys.stderr)
        return 1
    return 0


if __name__=="__main__":
    raise SystemExit(main())
