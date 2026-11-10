#!/usr/bin/env python3
"""Union PABX signed outbound agent. Python stdlib + OpenSSL 3, no inbound port."""
import argparse
import base64
import grp
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import time
import urllib.request
import urllib.error
import uuid
from contextlib import contextmanager

URL = "https://wmjmtcjpunmzvonlkjcu.supabase.co/functions/v1/union-pbx-agent"
CONFIG_DIR = Path("/etc/union-pbx-agent")
STATE_DIR = Path("/var/lib/union-pbx-agent")
SIP_DIR = Path("/etc/asterisk/pjsip.d")
PJSIP_FILE = Path("/etc/asterisk/pjsip.conf")
MASTER_FILE = SIP_DIR / "union-managed.conf"
INCLUDE = '#include "pjsip.d/union-managed.conf"'
DIALPLAN_MAIN = Path("/etc/asterisk/extensions.conf")
DIALPLAN_BROWSER = Path("/etc/asterisk/extensions.d/union-browser.conf")
DIALPLAN_MANAGED = Path("/etc/asterisk/extensions.d/union-internal-managed.conf")
DIALPLAN_FILE_INCLUDE = '#include "extensions.d/union-internal-managed.conf"'
DIALPLAN_CONTEXT = "union-pbx-local-extensions"
DIALPLAN_CONTEXT_INCLUDE = "include => union-pbx-local-extensions"
QUEUE_MAIN = Path("/etc/asterisk/queues.conf")
QUEUE_DIR = Path("/etc/asterisk/queues.d")
QUEUE_FILE = QUEUE_DIR / "union-managed-queues.conf"
QUEUE_MAIN_INCLUDE = '#include "queues.d/union-managed-queues.conf"'
QUEUE_TEST_FILE = Path("/etc/asterisk/extensions.d/union-queue-tests.conf")
QUEUE_TEST_INCLUDE = '#include "extensions.d/union-queue-tests.conf"'
QUEUE_TEST_CONTEXT = "union-pbx-queue-tests"
QUEUE_TEST_CONTEXT_INCLUDE = "include => union-pbx-queue-tests"
QUEUE_STATE_DIR = STATE_DIR / "queues"
QUEUE_STRATEGIES = {"ringall", "rrmemory", "linear"}

PRIVATE_KEY = CONFIG_DIR / "private.pem"
PUBLIC_KEY = CONFIG_DIR / "public.key"
AGENT_CONFIG = CONFIG_DIR / "agent.json"
SEQUENCE_FILE = STATE_DIR / "sequence"
ENDPOINT_RE = re.compile(r"^uw-[a-f0-9]{32}$")
PASSWORD_RE = re.compile(r"^[A-Za-z0-9_-]{35,100}$")
REVISION_RE = re.compile(r"^\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)$")
PROFILE_ID = None
OPERATION_LOCK = Path('/var/lib/union-pbx-agent/asterisk-config.lock')
BACKUP_DIR = Path('/var/lib/union-pbx-agent/config-backups')

class AgentError(Exception):
    pass

class Busy(AgentError):
    pass


@contextmanager
def operation_lock():
    from process_lock import exclusive, LockBusy
    try:
        with exclusive(OPERATION_LOCK):
            yield
    except LockBusy as exc:
        raise Busy(str(exc)) from None


def guarded_reload(command_name):
    assert_no_calls()
    return asterisk(command_name)


def select_profile(profile_id):
    global PROFILE_ID,CONFIG_DIR,STATE_DIR,MASTER_FILE,INCLUDE,PRIVATE_KEY,PUBLIC_KEY,AGENT_CONFIG,SEQUENCE_FILE
    global DIALPLAN_MANAGED,DIALPLAN_FILE_INCLUDE,DIALPLAN_CONTEXT,DIALPLAN_CONTEXT_INCLUDE
    global QUEUE_FILE,QUEUE_MAIN_INCLUDE,QUEUE_TEST_FILE,QUEUE_TEST_INCLUDE,QUEUE_TEST_CONTEXT,QUEUE_TEST_CONTEXT_INCLUDE,QUEUE_STATE_DIR
    if PROFILE_ID is not None and profile_id!=PROFILE_ID:
        raise AgentError('Um processo nao pode trocar de perfil de organizacao.')
    try:
        from tenant_profile import profile_paths
        profile=profile_paths(profile_id)
    except (ValueError,ImportError):
        raise AgentError('Modulo ou identidade do perfil indisponivel.') from None
    PROFILE_ID=profile.organization_id
    CONFIG_DIR,STATE_DIR=profile.config_dir,profile.state_dir
    MASTER_FILE,INCLUDE=profile.master_file,profile.pjsip_include
    PRIVATE_KEY,PUBLIC_KEY=CONFIG_DIR/'private.pem',CONFIG_DIR/'public.key'
    AGENT_CONFIG,SEQUENCE_FILE=CONFIG_DIR/'agent.json',STATE_DIR/'sequence'
    DIALPLAN_MANAGED,DIALPLAN_FILE_INCLUDE=profile.dialplan_file,profile.dialplan_include
    DIALPLAN_CONTEXT=profile.context
    DIALPLAN_CONTEXT_INCLUDE='include => '+profile.context
    QUEUE_FILE,QUEUE_MAIN_INCLUDE=profile.queue_file,profile.queue_include
    QUEUE_TEST_FILE,QUEUE_TEST_INCLUDE=profile.queue_routes_file,profile.queue_routes_include
    QUEUE_TEST_CONTEXT=profile.queue_context
    QUEUE_TEST_CONTEXT_INCLUDE='include => '+profile.queue_context
    QUEUE_STATE_DIR=STATE_DIR/'queues'


def validate_profile_config(config):
    if not isinstance(config,dict) or (PROFILE_ID is not None and config.get('organization_id')!=PROFILE_ID):
        raise AgentError('A configuracao nao pertence ao perfil selecionado.')


def validate_local_owner(state):
    if PROFILE_ID is not None and state.get('organization_id')!=PROFILE_ID:
        raise AgentError('Estado local de outra organizacao bloqueado neste perfil.')

def require_root():
    if os.geteuid() != 0:
        raise AgentError("Execute o agente como root na VPS.")

def command(*args, input_data=None):
    result = subprocess.run(args, input=input_data, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, check=False, timeout=20)
    if result.returncode != 0:
        raise AgentError("Falha no comando permitido: " + str(args[0:2]))
    return result.stdout

def write_atomic(path, content, mode=0o600, gid=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name("." + path.name + "." + secrets.token_hex(6))
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
        with os.fdopen(fd, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        if gid is not None:
            os.chown(temporary, 0, gid)
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()

def json_bytes(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()

def init():
    require_root()
    CONFIG_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    STATE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    (STATE_DIR / "extensions").mkdir(parents=True, exist_ok=True, mode=0o700)
    for path in (CONFIG_DIR, STATE_DIR, STATE_DIR / "extensions"):
        os.chmod(path, 0o700)
    if not PJSIP_FILE.exists():
        raise AgentError("pjsip.conf não encontrado.")
    if not PRIVATE_KEY.exists():
        command("openssl", "genpkey", "-algorithm", "ED25519", "-out", str(PRIVATE_KEY))
        os.chmod(PRIVATE_KEY, 0o600)
    der = command("openssl", "pkey", "-in", str(PRIVATE_KEY), "-pubout", "-outform", "DER")
    if not der.startswith(bytes.fromhex("302a300506032b6570032100")) or len(der) != 44:
        raise AgentError("Formato de chave Ed25519 inesperado.")
    public = base64.b64encode(der[12:]).decode()
    write_atomic(PUBLIC_KEY, (public + "\n").encode())
    asterisk_group = grp.getgrnam("asterisk").gr_gid
    if not MASTER_FILE.exists():
        write_atomic(MASTER_FILE, b"; Union PABX managed endpoints - empty until provisioned.\n", 0o640, asterisk_group)
    existing = PJSIP_FILE.read_text()
    if INCLUDE not in existing.splitlines():
        backup = Path("/root") / ("pjsip.conf.antes-union-agent-" + time.strftime("%Y%m%d-%H%M%S")+'-'+secrets.token_hex(4))
        write_atomic(backup, existing.encode(), 0o600)
        with PJSIP_FILE.open("a") as stream:
            stream.write(("\n" if not existing.endswith("\n") else "") + "\n" + INCLUDE + "\n")
        print("Inclusão criada com backup. As configurações FVX e union-301 permaneceram intactas.")
    print("Agente inicializado. CHAVE PUBLICA (pode copiar para o CRM):")
    print(public)

def configure(agent_id, organization_id):
    require_root()
    validate_profile_config({'organization_id':organization_id})
    if not PRIVATE_KEY.exists():
        raise AgentError("Execute init antes de configurar.")
    for field in (agent_id, organization_id):
        if str(uuid.UUID(field)) != field:
            raise AgentError("IDs devem ser UUIDs válidos.")
    write_atomic(AGENT_CONFIG, json_bytes({
        "agent_id": agent_id, "organization_id": organization_id, "url": URL
    }))
    print("Agente vinculado. Use 'once --dry-run' para inspecionar pendências.")

def signed_request(body):
    require_root()
    if not AGENT_CONFIG.exists() or not PRIVATE_KEY.exists():
        raise AgentError("Agente não configurado. Use init e configure.")
    config = json.loads(AGENT_CONFIG.read_text())
    validate_profile_config(config)
    sequence = int(SEQUENCE_FILE.read_text()) if SEQUENCE_FILE.exists() else 0
    sequence += 1
    write_atomic(SEQUENCE_FILE, str(sequence).encode())
    encoded = json.dumps(body, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    time_header = str(int(time.time() * 1000))
    message = time_header.encode() + b"\n" + str(sequence).encode() + b"\n" + encoded
    message_file = STATE_DIR / (".sign-" + secrets.token_hex(12))
    try:
        write_atomic(message_file, message, 0o600)
        signature = base64.b64encode(command(
            "openssl", "pkeyutl", "-sign", "-inkey", str(PRIVATE_KEY),
            "-rawin", "-in", str(message_file)
        )).decode()
    finally:
        message_file.unlink(missing_ok=True)
    request = urllib.request.Request(config["url"], encoded, method="POST", headers={
        "Content-Type": "application/json",
        "X-Pbx-Agent": config["agent_id"],
        "X-Pbx-Time": time_header,
        "X-Pbx-Sequence": str(sequence),
        "X-Pbx-Signature": signature,
        "User-Agent": "union-pbx-agent/1.0",
    })
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        raise AgentError("Ponte HTTP " + str(exc.code) + ". Verifique ID, horário e autorização.") from exc
    except urllib.error.URLError as exc:
        raise AgentError("Ponte indisponível. Nenhuma configuração foi aplicada.") from exc

def sip_conf(endpoint, number, password):
    auth = endpoint + "-auth"
    context=DIALPLAN_CONTEXT if PROFILE_ID is not None else 'union-internal'
    transfer=('set_var=TRANSFER_CONTEXT='+context+'\n') if PROFILE_ID is not None else ''
    return (f"[{endpoint}]\n"
        "type=aor\nmax_contacts=1\nremove_existing=yes\nqualify_frequency=30\n\n"
        f"[{auth}]\ntype=auth\nauth_type=userpass\nusername={endpoint}\npassword={password}\n\n"
        f"[{endpoint}]\ntype=endpoint\ntransport=transport-ws\n"
        f"aors={endpoint}\nauth={auth}\ncontext={context}\n"+transfer+
        "disallow=all\nallow=alaw,ulaw\nwebrtc=yes\ndirect_media=no\n"
        "force_rport=yes\nrewrite_contact=yes\nrtp_symmetric=yes\n"
        f"callerid=Ramal {number} <{number}>\n\n")

def validate_job(job, org_id):
    validate_profile_config({'organization_id':org_id})
    job_id = str(uuid.UUID(str(job["id"])))
    if job_id != job["id"] or job.get("organization_id") != org_id:
        raise AgentError("Identidade de organização ou trabalho inválida.")
    endpoint = job.get("endpoint_name")
    if not isinstance(endpoint, str) or not ENDPOINT_RE.fullmatch(endpoint):
        raise AgentError("Endpoint inválido. Nada será aplicado.")
    number = job.get("number")
    if type(number) is not int or not (100 <= number <= 9999):
        raise AgentError("Numeração de ramal inválida.")
    if type(job.get("desired_enabled")) is not bool or not REVISION_RE.fullmatch(str(job.get("updated_at", ""))):
        raise AgentError("Estado ou revisão de ramal inválidos.")
    return job_id

def render_master(overrides=None):
    states = {}
    for path in (STATE_DIR / "extensions").glob("*.json"):
        if not re.fullmatch(r"[a-f0-9-]{36}\.json", path.name):
            raise AgentError("Nome de arquivo de estado inesperado.")
        state = json.loads(path.read_text())
        validate_local_owner(state)
        endpoint = state["endpoint"]
        if not ENDPOINT_RE.fullmatch(endpoint) or not PASSWORD_RE.fullmatch(state["password"]):
            raise AgentError("Estado local inválido, nenhuma configuração será recarregada.")
        if endpoint in states:
            raise AgentError("Endpoints duplicados no estado local.")
        states[endpoint] = state
    if overrides:
        for state in overrides:
            validate_local_owner(state)
            states[state["endpoint"]] = state
    parts = ["; Union-managed WebRTC endpoints. Never edit this file manually.\n"]
    for endpoint, state in sorted(states.items()):
        if state["enabled"]:
            parts.append(sip_conf(endpoint, state["number"], state["password"]))
    return "".join(parts).encode()

def render_internal_routes(overrides=None):
    """Generate an exact-number, internal-only dialplan. No public-number patterns."""
    states = {}
    for path in (STATE_DIR / "extensions").glob("*.json"):
        state = json.loads(path.read_text())
        validate_local_owner(state)
        extension_id = str(uuid.UUID(str(state["id"])))
        if path.stem != extension_id:
            raise AgentError("Arquivo de ramal sem identidade correspondente.")
        if not ENDPOINT_RE.fullmatch(str(state.get("endpoint", ""))):
            raise AgentError("Endpoint de ramal invalido.")
        if not PASSWORD_RE.fullmatch(str(state.get("password", ""))):
            raise AgentError("Segredo SIP local invalido.")
        states[state["endpoint"]] = state
    if overrides:
        for state in overrides:
            validate_local_owner(state)
            if not ENDPOINT_RE.fullmatch(str(state.get("endpoint", ""))):
                raise AgentError("Sobrescrita de endpoint invalida.")
            states[state["endpoint"]] = state
    routes = {} if PROFILE_ID is not None else {301: "union-301"}
    for endpoint, state in sorted(states.items()):
        if not state.get("enabled"):
            continue
        number = state.get("number")
        if type(number) is not int or number < 100 or number > 9999 or number==900 or (number==301 and PROFILE_ID is None):
            raise AgentError("Numero de ramal reservado ou invalido.")
        if number in routes:
            raise AgentError("Numero de ramal duplicado no dialplan.")
        routes[number] = endpoint
    lines = [
        "; Gerado pelo agente Union PABX. Apenas chamadas internas por numero exato.\n",
        f"[{DIALPLAN_CONTEXT}]\n",
    ]
    for number, endpoint in sorted(routes.items()):
        lines.append(f"exten => {number},1,Dial(PJSIP/{endpoint},25)\n")
        lines.append(" same => n,Hangup()\n")
    if PROFILE_ID is not None:
        lines.extend(['exten => 900,1,Answer()\n',' same => n,Echo()\n',' same => n,Hangup()\n'])
    # O roteamento de filas é opcional e nunca altera o contexto de entrada FVX.
    if QUEUE_TEST_FILE.is_file():
        lines.append(QUEUE_TEST_CONTEXT_INCLUDE + "\n")
        lines.append(QUEUE_TEST_INCLUDE + "\n")
    return "".join(lines).encode("utf-8"), sorted(routes)


def install_internal_routes():
    """One-time opt-in setup for internal routing; does not change the FVX inbound context."""
    if PROFILE_ID is not None:
        return install_profile_routes()
    require_root()
    if not all(path.is_file() for path in (DIALPLAN_MAIN,DIALPLAN_BROWSER,MASTER_FILE)):
        raise AgentError("Arquivos esperados do Asterisk nao foram encontrados.")
    assert_no_calls()
    previous_fvx = asterisk("pjsip show registrations")
    main_before = DIALPLAN_MAIN.read_bytes()
    browser_before = DIALPLAN_BROWSER.read_bytes()
    main_stat = DIALPLAN_MAIN.stat()
    browser_stat = DIALPLAN_BROWSER.stat()
    had_routes = DIALPLAN_MANAGED.exists()
    routes_before = DIALPLAN_MANAGED.read_bytes() if had_routes else None
    browser_text = browser_before.decode("utf-8")
    context_matches = list(re.finditer(r"(?m)^\[union-internal\]\s*$", browser_text))
    if len(context_matches) != 1:
        raise AgentError("Contexto union-internal deve existir uma unica vez.")
    start = context_matches[0].end()
    next_context = re.search(r"(?m)^\[[^\]]+\]", browser_text[start:])
    end = start + next_context.start() if next_context else len(browser_text)
    section = browser_text[start:end]
    if DIALPLAN_CONTEXT_INCLUDE not in section.splitlines():
        browser_text = browser_text[:start] + "\n" + DIALPLAN_CONTEXT_INCLUDE + browser_text[start:]
    main_text = main_before.decode("utf-8")
    if DIALPLAN_FILE_INCLUDE not in main_text.splitlines():
        main_text += ("" if main_text.endswith("\n") else "\n") + "\n" + DIALPLAN_FILE_INCLUDE + "\n"
    generated, numbers = render_internal_routes()
    group = grp.getgrnam("asterisk").gr_gid

    # Backups outside the Asterisk include directory are never parsed as live dialplans.
    stamp = time.strftime("%Y%m%d-%H%M%S")
    for path, old in ((DIALPLAN_MAIN,main_before),(DIALPLAN_BROWSER,browser_before)):
        write_atomic(Path("/root") / f"{path.name}.before-local-pbx-{stamp}",old)
    try:
        write_atomic(DIALPLAN_MANAGED,generated,0o640,group)
        if main_text.encode() != main_before:
            write_atomic(DIALPLAN_MAIN,main_text.encode(),main_stat.st_mode & 0o777,main_stat.st_gid)
        if browser_text.encode() != browser_before:
            write_atomic(DIALPLAN_BROWSER,browser_text.encode(),browser_stat.st_mode & 0o777,browser_stat.st_gid)
        result=guarded_reload("dialplan reload")
        if "reloaded" not in result.lower():
            raise AgentError("Asterisk nao confirmou a recarga do dialplan.")
        detail=asterisk("dialplan show " + DIALPLAN_CONTEXT)
        for number in numbers:
            if not re.search(r"(?m)^\s*'?" + str(number) + r"'?\s*=>",detail):
                raise AgentError("Rota interna nao foi confirmada no Asterisk.")
        echo=asterisk("dialplan show union-internal")
        if "900" not in echo:
            raise AgentError("O teste interno 900 deixou de estar disponivel.")
        assert_fvx(previous_fvx)
    except Exception:
        write_atomic(DIALPLAN_MAIN,main_before,main_stat.st_mode & 0o777,main_stat.st_gid)
        write_atomic(DIALPLAN_BROWSER,browser_before,browser_stat.st_mode & 0o777,browser_stat.st_gid)
        if had_routes:
            write_atomic(DIALPLAN_MANAGED,routes_before,0o640,group)
        else:
            DIALPLAN_MANAGED.unlink(missing_ok=True)
        try:
            guarded_reload("dialplan reload")
        except Exception:
            print("CRITICO: nao foi possivel validar rollback do dialplan.",file=sys.stderr)
        raise
    print("Rotas internas configuradas: " + ", ".join(str(n) for n in numbers))
    print("Linha FVX e suas rotas de entrada permanecem inalteradas.")


def queue_identity(queue_id):
    return "uwq-" + uuid.UUID(str(queue_id)).hex


def validate_queue_job(job, org_id):
    """Whitelist all values before touching any Asterisk configuration file."""
    if not isinstance(job, dict):
        raise AgentError("Trabalho de fila invalido.")
    if PROFILE_ID is not None and org_id!=PROFILE_ID:
        raise AgentError('Fila de outra organizacao bloqueada neste perfil.')
    queue_id = str(uuid.UUID(str(job["id"])))
    if queue_id != job["id"] or job.get("organization_id") != org_id:
        raise AgentError("Fila pertence a outra organizacao.")
    name = job.get("name")
    if not isinstance(name, str) or not 2 <= len(name.strip()) <= 80:
        raise AgentError("Nome de fila invalido.")
    test_number = job.get("test_extension")
    if type(test_number) is not int or not 850 <= test_number <= 899:
        raise AgentError("Numero de teste da fila fora do intervalo permitido.")
    if job.get("strategy") not in QUEUE_STRATEGIES:
        raise AgentError("Estrategia de fila invalida.")
    ring_seconds = job.get("ring_seconds")
    wait_seconds = job.get("max_wait_seconds")
    if type(ring_seconds) is not int or not 10 <= ring_seconds <= 40:
        raise AgentError("Tempo de toque invalido.")
    if type(wait_seconds) is not int or not 30 <= wait_seconds <= 300:
        raise AgentError("Tempo maximo de espera invalido.")
    if type(job.get("enabled")) is not bool:
        raise AgentError("Situacao da fila invalida.")
    if not REVISION_RE.fullmatch(str(job.get("updated_at", ""))):
        raise AgentError("Revisao de fila invalida.")
    members = job.get("members", [])
    if not isinstance(members, list) or len(members)>20 or (job["enabled"] and not members):
        raise AgentError("Quantidade de participantes da fila invalida.")
    numbers, endpoints, positions = set(), set(), set()
    for member in members:
        if not isinstance(member, dict):
            raise AgentError("Participante invalido.")
        if member.get("organization_id") != org_id:
            raise AgentError("Participante pertence a outra organizacao.")
        number = member.get("number")
        endpoint = member.get("endpoint_name")
        position = member.get("position")
        if PROFILE_ID is not None and endpoint=='union-301':
            raise AgentError('O ramal manual Union nao pertence a este perfil.')
        if type(number) is not int or not 100 <= number <= 9999 or number==900:
            raise AgentError("Numero de participante invalido.")
        if not (endpoint=="union-301" and number==301 or
                isinstance(endpoint,str) and ENDPOINT_RE.fullmatch(endpoint)):
            raise AgentError("Endpoint de participante nao permitido.")
        if type(position) is not int or position<1 or position>20:
            raise AgentError("Ordem de participante invalida.")
        if member.get("desired_enabled") is not True or (
            member.get("provisioning_status") not in ("manual","applied")
        ):
            raise AgentError("Fila inclui ramal nao provisionado ou desativado.")
        if number in numbers or endpoint in endpoints or position in positions:
            raise AgentError("Participante duplicado.")
        numbers.add(number)
        endpoints.add(endpoint)
        positions.add(position)
    return queue_id


def queue_states(overrides=None):
    data = {}
    if QUEUE_STATE_DIR.is_dir():
        for path in QUEUE_STATE_DIR.glob("*.json"):
            if not re.fullmatch(r"[a-f0-9-]{36}\.json",path.name):
                raise AgentError("Arquivo de estado de fila inesperado.")
            state=json.loads(path.read_text())
            validate_local_owner(state)
            queue_id=validate_queue_job(state,state.get("organization_id"))
            if path.stem != queue_id:
                raise AgentError("Estado de fila com identidade divergente.")
            data[queue_id]=state
    for state in overrides or []:
        validate_local_owner(state)
        queue_id=validate_queue_job(state,state.get("organization_id"))
        data[queue_id]=state
    return data


def render_queue_configs(overrides=None):
    states=queue_states(overrides)
    queue_lines=["; Filas internas gerenciadas pela Union. Nao modificar manualmente.\n"]
    dial_lines=[
        "; Testes internos das filas; a linha FVX nao e encaminhada aqui.\n",
        "["+QUEUE_TEST_CONTEXT+"]\n",
    ]
    used_numbers=set()
    active_names=[]
    for queue_id,state in sorted(states.items(),key=lambda item:item[1]["test_extension"]):
        if not state["enabled"]:
            continue
        test_number=state["test_extension"]
        if test_number in used_numbers:
            raise AgentError("Colisao de numeros de teste entre filas.")
        used_numbers.add(test_number)
        name=queue_identity(queue_id)
        active_names.append(name)
        queue_lines.extend([
            "\n["+name+"]\n",
            "strategy="+state["strategy"]+"\n",
            "timeout="+str(state["ring_seconds"])+"\n",
            "retry=5\n",
            "autofill=yes\n",
            "joinempty=yes\n",
            "leavewhenempty=no\n",
            "ringinuse=no\n",
            "wrapuptime=5\n",
            "autopause=no\n",
            "musicclass=default\n",
        ])
        for member in sorted(state["members"], key=lambda m:m["position"]):
            queue_lines.append("member => PJSIP/"+member["endpoint_name"]+
                               ",0,Ramal "+str(member["number"])+"\n")
        dial_lines.extend([
            "exten => "+str(test_number)+",1,Answer()\n",
            " same => n,Queue("+name+",,,,"
               +str(state["max_wait_seconds"])+")\n",
            " same => n,Hangup()\n",
        ])
    return "".join(queue_lines).encode(), "".join(dial_lines).encode(), active_names, used_numbers


def reload_queue_definitions(names):
    if PROFILE_ID is None:
        queue_result=guarded_reload('module reload app_queue.so')
        if 'reloaded successfully' not in queue_result.lower():
            raise AgentError('O Asterisk nao confirmou a recarga do modulo de filas.')
        return
    # CLI `all` also reloads global rules. Separate parameters/members commands
    # cannot safely substitute for a combined QueueReload action. Until a local
    # scoped AMI integration is installed and validated, fail closed for profiles.
    own_names=set(names)|{queue_identity(identity) for identity in queue_states()}
    if own_names:
        raise Busy('Filas de perfis aguardam integracao local de recarga isolada validada.')


def _check_queue_reload(names,numbers,old_fvx):
    assert_no_calls()
    reload_queue_definitions(names)
    dial_result=guarded_reload("dialplan reload")
    if "reloaded" not in dial_result.lower():
        raise AgentError("A recarga do dialplan de filas nao foi confirmada.")
    output=asterisk("dialplan show "+QUEUE_TEST_CONTEXT)
    for number in numbers:
        if not re.search(r"(?m)^\s*'?" + str(number) + r"'?\s*=>",output):
            raise AgentError("Numero de teste da fila nao apareceu no Asterisk.")
    for name in names:
        detail=asterisk("queue show "+name)
        if name not in detail or "has " not in detail:
            raise AgentError("Fila nao foi carregada pelo Asterisk.")
    # Confirm disabled queues were actually removed from the Asterisk registry.
    for queue_id,state in queue_states().items():
        if not state["enabled"]:
            old=asterisk("queue show "+queue_identity(queue_id))
            if queue_identity(queue_id) in old and "has " in old:
                raise AgentError("Fila desativada ainda presente no Asterisk.")
    assert_fvx(old_fvx)


def module_is_running(module_list, module_name):
    """Distinguish 'Running' from 'Not Running' in Asterisk module list."""
    for line in module_list.splitlines():
        fields=line.split()
        if fields and fields[0]==module_name:
            return bool(re.search(r"\s+\d+\s+Running(?:\s|$)",line))
    return False


def install_profile_routes():
    """Operator-only bootstrap. Never edits the legacy browser/inbound context."""
    require_root()
    if PROFILE_ID is None:
        raise AgentError('Selecione um perfil de organizacao.')
    if not all(path.is_file() for path in (MASTER_FILE,DIALPLAN_MAIN,QUEUE_MAIN)):
        raise AgentError('Execute init e confira os arquivos principais antes do bootstrap.')
    if not PJSIP_FILE.is_file() or INCLUDE not in PJSIP_FILE.read_text().splitlines():
        raise AgentError('A inclusao PJSIP exata do perfil nao foi preparada pelo init.')
    assert_no_calls()
    previous_fvx=asterisk('pjsip show registrations')
    queues,routes,names,numbers=render_queue_configs()
    if queue_states():
        raise Busy('Bootstrap de perfis com filas aguarda recarga isolada validada.')
    # Queue routes must already be included while rendering the internal context.
    internal,extension_numbers=render_internal_routes()
    if QUEUE_TEST_INCLUDE not in internal.decode().splitlines():
        internal+=(QUEUE_TEST_CONTEXT_INCLUDE+'\n'+QUEUE_TEST_INCLUDE+'\n').encode()
    snapshots={}
    paths=(DIALPLAN_MAIN,QUEUE_MAIN,DIALPLAN_MANAGED,QUEUE_FILE,QUEUE_TEST_FILE)
    backup=BACKUP_DIR/(PROFILE_ID+'-'+time.strftime('%Y%m%d-%H%M%S')+'-'+secrets.token_hex(4))
    BACKUP_DIR.mkdir(parents=True,exist_ok=True,mode=0o700)
    backup.mkdir(mode=0o700)
    group=grp.getgrnam('asterisk').gr_gid
    for index,path in enumerate(paths):
        if path.is_file():
            stat=path.stat()
            snapshots[path]=(path.read_bytes(),stat.st_mode & 0o777,stat.st_gid)
            write_atomic(backup/(str(index)+'-'+path.name),snapshots[path][0])
        else:
            snapshots[path]=None
    write_atomic(backup/'manifest.json',json_bytes({str(path):state is not None for path,state in snapshots.items()}))
    try:
        write_atomic(QUEUE_FILE,queues,0o640,group)
        write_atomic(QUEUE_TEST_FILE,routes,0o640,group)
        write_atomic(DIALPLAN_MANAGED,internal,0o640,group)
        for path,include in ((DIALPLAN_MAIN,DIALPLAN_FILE_INCLUDE),(QUEUE_MAIN,QUEUE_MAIN_INCLUDE)):
            old,mode,gid=snapshots[path]
            text=old.decode()
            if include not in text.splitlines():
                text+=('' if text.endswith('\n') else '\n')+'\n'+include+'\n'
                write_atomic(path,text.encode(),mode,gid)
        assert_no_calls()
        result=guarded_reload('module reload res_pjsip.so')
        if 'reloaded successfully' not in result.lower():
            raise AgentError('Recarga PJSIP do perfil nao confirmada.')
        _check_queue_reload(names,numbers,previous_fvx)
        detail=asterisk('dialplan show '+DIALPLAN_CONTEXT)
        for number in extension_numbers+[900]:
            if not re.search(r"(?m)^\s*'?"+str(number)+r"'?\s*=>",detail):
                raise AgentError('Rota isolada nao apareceu no contexto do perfil.')
    except Exception:
        for path,state in snapshots.items():
            if state is None:path.unlink(missing_ok=True)
            else:write_atomic(path,*state)
        try:
            assert_no_calls()
            guarded_reload('module reload res_pjsip.so')
            reload_queue_definitions(names)
            guarded_reload('dialplan reload')
        except Exception:
            print('CRITICO: arquivos restaurados; recarga de reversao nao confirmada. Revise apos liberar chamadas.',file=sys.stderr)
        raise
    print('Contexto interno e filas preparados para o perfil '+PROFILE_ID+'. Backup: '+str(backup))


def install_queues():
    """Optional one-time queue setup. Inbound FVX remains exactly as configured."""
    if PROFILE_ID is not None:
        return install_profile_routes()
    require_root()
    missing=[str(path) for path in (QUEUE_MAIN,DIALPLAN_MANAGED,MASTER_FILE)
             if not path.is_file()]
    if missing:
        raise AgentError("Arquivos obrigatorios do Asterisk ausentes: "+", ".join(missing))
    assert_no_calls()
    previous_fvx=asterisk("pjsip show registrations")
    module=asterisk("module show like app_queue")
    if not module_is_running(module, "app_queue.so"):
        raise AgentError("Modulo app_queue.so nao esta em execucao. Verifique queues.conf e a configuracao de modules.conf.")
    queue_main_before=QUEUE_MAIN.read_bytes()
    queue_main_stat=QUEUE_MAIN.stat()
    dialplan_before=DIALPLAN_MANAGED.read_bytes()
    dialplan_stat=DIALPLAN_MANAGED.stat()
    had_config=QUEUE_FILE.is_file()
    config_before=QUEUE_FILE.read_bytes() if had_config else None
    had_routes=QUEUE_TEST_FILE.is_file()
    routes_before=QUEUE_TEST_FILE.read_bytes() if had_routes else None
    QUEUE_DIR.mkdir(parents=True,exist_ok=True)
    QUEUE_STATE_DIR.mkdir(parents=True,exist_ok=True)
    group=grp.getgrnam("asterisk").gr_gid
    os.chown(QUEUE_DIR,0,group)
    os.chmod(QUEUE_DIR,0o750)
    os.chmod(QUEUE_STATE_DIR,0o700)
    include_text=queue_main_before.decode()
    if QUEUE_MAIN_INCLUDE not in include_text.splitlines():
        include_text+=("" if include_text.endswith("\n") else "\n")+"\n"+QUEUE_MAIN_INCLUDE+"\n"
    queues_content,test_content,names,numbers=render_queue_configs()
    stamp=time.strftime("%Y%m%d-%H%M%S")
    write_atomic(Path("/root")/("queues.conf.before-union-queues-"+stamp),queue_main_before)
    write_atomic(Path("/root")/("union-internal-managed.conf.before-queues-"+stamp),dialplan_before)
    try:
        write_atomic(QUEUE_FILE,queues_content,0o640,group)
        write_atomic(QUEUE_TEST_FILE,test_content,0o640,group)
        refreshed_dialplan,_=render_internal_routes()
        write_atomic(DIALPLAN_MANAGED,refreshed_dialplan,dialplan_stat.st_mode & 0o777,dialplan_stat.st_gid)
        if include_text.encode()!=queue_main_before:
            write_atomic(QUEUE_MAIN,include_text.encode(),
                queue_main_stat.st_mode & 0o777,queue_main_stat.st_gid)
        _check_queue_reload(names,numbers,previous_fvx)
        internal=asterisk("dialplan show union-internal")
        if "900" not in internal or "union-pbx-local-extensions" not in internal:
            raise AgentError("O roteamento interno existente nao foi preservado.")
    except Exception:
        write_atomic(QUEUE_MAIN,queue_main_before,
            queue_main_stat.st_mode & 0o777,queue_main_stat.st_gid)
        write_atomic(DIALPLAN_MANAGED,dialplan_before,
            dialplan_stat.st_mode & 0o777,dialplan_stat.st_gid)
        if had_config:
            write_atomic(QUEUE_FILE,config_before,0o640,group)
        else:
            QUEUE_FILE.unlink(missing_ok=True)
        if had_routes:
            write_atomic(QUEUE_TEST_FILE,routes_before,0o640,group)
        else:
            QUEUE_TEST_FILE.unlink(missing_ok=True)
        try:
            reload_queue_definitions(names)
            guarded_reload("dialplan reload")
        except Exception:
            print("CRITICO: confirme o rollback do modulo de filas.",file=sys.stderr)
        raise
    print("Motor de filas habilitado para testes internos. Linha FVX e ramais preservados.")


def apply_queue_job(job,org_id):
    queue_id=validate_queue_job(job,org_id)
    if PROFILE_ID is not None:
        raise Busy('Provisionamento de filas isoladas aguarda integracao local validada.')
    if not (QUEUE_FILE.is_file() and QUEUE_TEST_FILE.is_file()):
        raise Busy("Aguardando habilitacao das filas com o comando queues-init.")
    assert_no_calls()
    old_fvx=asterisk("pjsip show registrations")
    state_file=QUEUE_STATE_DIR/(queue_id+".json")
    old_state=state_file.read_bytes() if state_file.is_file() else None
    old_config=QUEUE_FILE.read_bytes()
    old_routes=QUEUE_TEST_FILE.read_bytes()
    old_dialplan=DIALPLAN_MANAGED.read_bytes()
    old_stat=DIALPLAN_MANAGED.stat()
    group=grp.getgrnam("asterisk").gr_gid
    # Prevent a stale or forged update from moving a configured queue to another tenant.
    if old_state:
        current=json.loads(old_state)
        if current.get("organization_id")!=org_id:
            raise AgentError("Organizacao da fila nao pode ser alterada.")
    proposed_queues,proposed_routes,names,numbers=render_queue_configs([job])
    try:
        write_atomic(state_file,json_bytes(job))
        write_atomic(QUEUE_FILE,proposed_queues,0o640,group)
        write_atomic(QUEUE_TEST_FILE,proposed_routes,0o640,group)
        # Existing 301/302 routes are regenerated unchanged, with a queue-test include.
        dialplan,_=render_internal_routes()
        write_atomic(DIALPLAN_MANAGED,dialplan,old_stat.st_mode & 0o777,old_stat.st_gid)
        _check_queue_reload(names,numbers,old_fvx)
    except Exception:
        if old_state is None:
            state_file.unlink(missing_ok=True)
        else:
            write_atomic(state_file,old_state)
        write_atomic(QUEUE_FILE,old_config,0o640,group)
        write_atomic(QUEUE_TEST_FILE,old_routes,0o640,group)
        write_atomic(DIALPLAN_MANAGED,old_dialplan,old_stat.st_mode & 0o777,old_stat.st_gid)
        try:
            assert_no_calls()
            reload_queue_definitions(names)
            guarded_reload("dialplan reload")
        except Exception:
            print("CRITICO: nao foi possivel confirmar rollback da fila.",file=sys.stderr)
        raise
    print("Fila de teste "+str(job["test_extension"])+": "+
      ("ativa" if job["enabled"] else "desativada")+".")


def asterisk(command_name):
    return command("asterisk", "-rx", command_name).decode(errors="replace")

def assert_no_calls():
    result = asterisk("core show channels count")
    found = re.search(r"(?m)^\s*(\d+)\s+active channels", result)
    if not found:
        raise AgentError("Não foi possível verificar chamadas ativas.")
    if int(found.group(1)) > 0:
        raise Busy("Há chamadas em andamento; provisionamento adiado sem interrompê-las.")

def assert_fvx(previous):
    # If the FVX trunk was registered before the reload, it must remain registered.
    old = [line for line in previous.splitlines() if "union-fvx-registration/" in line]
    if old and any("Registered" in line for line in old):
        current = asterisk("pjsip show registrations")
        new = [line for line in current.splitlines() if "union-fvx-registration/" in line]
        if not new or not any("Registered" in line for line in new):
            raise AgentError("Registro FVX não confirmado após o reload; revertendo.")

def apply_job(job, org_id):
    job_id = validate_job(job, org_id)
    endpoint, number = job["endpoint_name"], job["number"]
    state_path = STATE_DIR / "extensions" / (job_id + ".json")
    old_state = state_path.read_bytes() if state_path.exists() else None
    old_master = MASTER_FILE.read_bytes()
    old_dialplan = DIALPLAN_MANAGED.read_bytes() if DIALPLAN_MANAGED.exists() else None
    old_fvx = asterisk("pjsip show registrations")
    assert_no_calls()
    if old_state:
        state = json.loads(old_state)
        if state["endpoint"] != endpoint or state["organization_id"] != org_id:
            raise AgentError("Identidade do ramal mudou; operação bloqueada.")
    else:
        state = {
            "id": job_id, "endpoint": endpoint,
            "organization_id": org_id,
            "password": secrets.token_urlsafe(40),
        }
    state["number"] = number
    state["enabled"] = job["desired_enabled"]
    proposed = render_master([state])
    proposed_routes,route_numbers = render_internal_routes([state]) if old_dialplan is not None else (None,[])
    group = grp.getgrnam("asterisk").gr_gid
    try:
        write_atomic(state_path, json_bytes(state))
        write_atomic(MASTER_FILE, proposed, 0o640, group)
        if proposed_routes is not None:
            write_atomic(DIALPLAN_MANAGED,proposed_routes,0o640,group)
        result = guarded_reload("module reload res_pjsip.so")
        if "reloaded successfully" not in result.lower():
            raise AgentError("Asterisk não confirmou o reload.")
        detail = asterisk("pjsip show endpoint " + endpoint)
        present = bool(re.search(r"(?m)^\s*Endpoint:\s+" + re.escape(endpoint) + r"\b", detail))
        if present != state["enabled"]:
            raise AgentError("Estado do endpoint não corresponde ao solicitado.")
        if proposed_routes is not None:
            output=guarded_reload("dialplan reload")
            if "reloaded" not in output.lower():
                raise AgentError("Falha na recarga do dialplan interno.")
            detail=asterisk("dialplan show " + DIALPLAN_CONTEXT)
            for dial_number in route_numbers:
                if not re.search(r"(?m)^\s*'?" + str(dial_number) + r"'?\s*=>",detail):
                    raise AgentError("Numero interno ausente do Asterisk.")
        assert_fvx(old_fvx)
    except Exception:
        if old_state is None:
            state_path.unlink(missing_ok=True)
        else:
            write_atomic(state_path, old_state)
        write_atomic(MASTER_FILE, old_master, 0o640, group)
        if old_dialplan is not None:
            write_atomic(DIALPLAN_MANAGED,old_dialplan,0o640,group)
            try:
                guarded_reload("dialplan reload")
            except Exception:
                print("CRITICO: falha no rollback do dialplan.",file=sys.stderr)
        try:
            guarded_reload("module reload res_pjsip.so")
        except Exception:
            print("CRÍTICO: falha na recarga de rollback; revise Asterisk manualmente.", file=sys.stderr)
        raise
    print(f"Ramal {number}: configuração {'ativada' if state['enabled'] else 'desativada'} ({endpoint}).")

def encrypt_login_for_browser(request, org_id):
    """RSA-OAEP-SHA256: only the authorized browser's ephemeral key can decrypt."""
    login_id = str(uuid.UUID(str(request["id"])))
    extension_id = str(uuid.UUID(str(request["extension_id"])))
    if request.get("organization_id") != org_id:
        raise AgentError("Solicitação de login pertence a outra empresa.")
    public_key = request.get("public_key_base64")
    if not isinstance(public_key, str) or not (350 <= len(public_key) <= 700):
        raise AgentError("Chave pública de login inválida.")
    try:
        der = base64.b64decode(public_key, validate=True)
    except Exception as exc:
        raise AgentError("Chave pública Base64 inválida.") from exc
    if not 280 <= len(der) <= 510:
        raise AgentError("Chave RSA incompatível.")
    state_file = STATE_DIR / "extensions" / (extension_id + ".json")
    if not state_file.is_file():
        raise AgentError("O ramal vinculado ainda não foi provisionado.")
    state = json.loads(state_file.read_text())
    if state.get("id") != extension_id or state.get("organization_id") != org_id:
        raise AgentError("Vínculo do ramal não corresponde à organização.")
    if not state.get("enabled") or not ENDPOINT_RE.fullmatch(str(state.get("endpoint",""))):
        raise AgentError("Ramal desativado ou inválido.")
    password = state.get("password")
    if not isinstance(password,str) or not PASSWORD_RE.fullmatch(password):
        raise AgentError("Credencial SIP local indisponível.")

    # Temp files must never be logged, copied to /tmp or sent to Supabase in plaintext.
    tmpid = secrets.token_hex(12)
    pubfile = STATE_DIR / (".rsa-public-" + tmpid)
    secretfile = STATE_DIR / (".sip-secret-" + tmpid)
    try:
        write_atomic(pubfile, der, 0o600)
        write_atomic(secretfile, password.encode(), 0o600)
        ciphertext = command("openssl", "pkeyutl", "-encrypt",
            "-pubin", "-keyform", "DER", "-inkey", str(pubfile),
            "-pkeyopt", "rsa_padding_mode:oaep",
            "-pkeyopt", "rsa_oaep_md:sha256",
            "-pkeyopt", "rsa_mgf1_md:sha256",
            "-in", str(secretfile))
        if len(ciphertext) != 256:
            raise AgentError("O navegador exige uma chave RSA de 2048 bits.")
        return login_id, base64.b64encode(ciphertext).decode()
    finally:
        pubfile.unlink(missing_ok=True)
        secretfile.unlink(missing_ok=True)


def strip_ansi(value):
    """Asterisk CLI may emit ANSI colors inside (Not in use) and (Unavailable)."""
    return re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", value)


def _queue_member_state(line):
    """Parse Asterisk queue show state; never treat unknown as available."""
    line = strip_ansi(line)
    if re.search(r"\(paused(?:[:)]|\s)", line, re.IGNORECASE):
        return "paused"
    match = re.search(
        r"\((Not in use|In use|Unavailable|Busy|Ringing|Unknown|On Hold)\)",
        line, re.IGNORECASE,
    )
    if not match:
        return "unknown"
    value = match.group(1).lower()
    return {
        "not in use": "available",
        "in use": "busy",
        "unavailable": "unavailable",
        "busy": "busy",
        "ringing": "ringing",
        "unknown": "unknown",
        "on hold": "busy",
    }[value]


def gather_queue_telemetry():
    """Read-only snapshot. One Asterisk CLI command per agent cycle."""
    states = queue_states()
    active = [(queue_id, state) for queue_id, state in states.items()
              if state["enabled"]]
    if not active:
        return []
    raw = strip_ansi(asterisk("queue show"))
    observed = {}
    current = None
    for line in raw.splitlines():
        header = re.match(r"^(\S+) has (\d+) calls?\b", line)
        if header:
            current = header.group(1)
            observed[current] = {"waiting": min(int(header.group(2)), 500),
                                 "lines": []}
        elif current is not None:
            observed[current]["lines"].append(line)
    result = []
    for queue_id,state in active[:10]:
        name = queue_identity(queue_id)
        snapshot = observed.get(name)
        members = []
        for member in sorted(state["members"], key=lambda m: m["position"]):
            endpoint = member["endpoint_name"]
            status = "unknown"
            if snapshot:
                for line in snapshot["lines"]:
                    if re.search(r"\(PJSIP/"+re.escape(endpoint)+r"\)",line):
                        status = _queue_member_state(line)
                        break
            members.append({"number": member["number"], "state": status})
        result.append({
            "queue_id":queue_id,
            "queue_state":"active" if snapshot else "missing",
            "waiting_count":snapshot["waiting"] if snapshot else 0,
            "members":members,
        })
    return result


def availability_capability():
    try:
        from queue_availability import process_jobs
        return 2, process_jobs
    except Exception:
        # Partial installation must not advertise commands it cannot execute.
        return 1, None


def cycle(dry_run=False):
    config = json.loads(AGENT_CONFIG.read_text())
    validate_profile_config(config)
    try:
        telemetry = [] if dry_run else gather_queue_telemetry()
    except Exception as exc:
        # Failed telemetry must never block provisioning or browser login.
        print("Telemetria indisponivel: "+type(exc).__name__, file=sys.stderr)
        telemetry = []
    protocol, availability_processor = availability_capability()
    payload = signed_request({"action":"poll", "telemetry": telemetry, "protocol_version":protocol})
    jobs = payload.get("jobs", [])
    if not isinstance(jobs, list) or len(jobs) > 10:
        raise AgentError("Resposta de jobs inválida.")
    queue_jobs = payload.get("queue_jobs", [])
    if not isinstance(queue_jobs,list) or len(queue_jobs)>10:
        raise AgentError("Resposta de filas invalida.")
    logins = payload.get("login_requests", [])
    if not isinstance(logins, list) or len(logins) > 10:
        raise AgentError("Resposta de solicitações de acesso inválida.")
    if not jobs and not logins and not queue_jobs and dry_run:
        print("Sem ramais, filas ou solicitações de acesso pendentes.")
    for job in jobs:
        try:
            validate_job(job, config["organization_id"])
            if dry_run:
                print(f"Prévia: ramal {job['number']}, ativar={job['desired_enabled']}, endpoint={job['endpoint_name']}")
                continue
            with operation_lock():
                apply_job(job, config["organization_id"])
            status, error = "applied", None
        except Busy as exc:
            print(str(exc))
            continue
        except Exception as exc:
            status, error = "failed", str(exc)[:220]
            print("Falha no provisionamento: " + error, file=sys.stderr)
        if not dry_run:
            reply = signed_request({"action":"report", "id":job["id"], "version":job["updated_at"],
                                    "status":status, "error":error})
            if reply.get("stale"):
                print("Cadastro modificado durante a aplicação; versão nova será processada.")
            elif not reply.get("accepted"):
                raise AgentError("Ponte não confirmou a versão do ramal.")

    for queue in queue_jobs:
        try:
            validate_queue_job(queue,config["organization_id"])
            if dry_run:
                print("Previa: fila interna "+
                  str(queue["test_extension"])+" com "+str(len(queue["members"]))+" ramais.")
                continue
            with operation_lock():
                apply_queue_job(queue,config["organization_id"])
            status,error="applied",None
        except Busy as exc:
            print(str(exc))
            continue  # Mantem a fila pendente; nao interrompe chamadas existentes.
        except Exception as exc:
            status,error="failed",str(exc)[:220]
            print("Falha no provisionamento da fila: "+type(exc).__name__,file=sys.stderr)
        if not dry_run:
            result=signed_request({"action":"report_queue",
              "id":queue["id"],"version":queue["updated_at"],
              "status":status,"error":error})
            if result.get("stale"):
                print("Fila alterada durante o provisionamento; uma nova versao sera aplicada.")
            elif not result.get("accepted"):
                raise AgentError("A ponte nao confirmou a fila.")

    for login in logins:
        try:
            if dry_run:
                print("Prévia: entrega segura de credencial pendente (sem mostrar senha).")
                continue
            login_id, ciphertext = encrypt_login_for_browser(login, config["organization_id"])
            result = signed_request({
                "action": "report_login",
                "id": login_id,
                "ciphertext": ciphertext,
            })
            if not result.get("accepted"):
                print("Solicitação expirada ou invalidada; nenhuma senha foi entregue.")
        except Exception as exc:
            # Do not include any credentials in diagnostic logs.
            print("Entrega criptografada adiada: " + type(exc).__name__, file=sys.stderr)

    # Availability is opt-in and runs after provisioning and secure logins. No
    # global queue commands and no reload are needed to pause one exact member.
    if not dry_run:
        try:
            availability_jobs = payload.get("availability_jobs", [])
            if availability_jobs and availability_processor is not None:
                with operation_lock():
                    results = availability_processor(availability_jobs, config["organization_id"], queue_states())
                if results:
                    signed_request({"action":"report_availability", "results":results})
        except Exception as exc:
            print("Disponibilidade adiada: " + type(exc).__name__, file=sys.stderr)

    # Optional metadata delivery runs after all phone operations. No CDR backend
    # means no work, and a failure does not block provisioning or secure logins.
    if not dry_run:
        try:
            endpoints = payload.get("history_endpoints")
            if (isinstance(endpoints, list) and 0 < len(endpoints) <= 1200 and
                    all(isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,80}", value)
                        for value in endpoints)):
                from call_history import sync_history
                sync_history(Path("/var/log/asterisk/cdr-custom/union-calls.csv"),
                             STATE_DIR / "call-history-cursor.json", set(endpoints),
                             lambda records: signed_request({"action": "report_calls", "records": records}))
        except Exception as exc:
            print("Historico adiado: " + type(exc).__name__, file=sys.stderr)

def main():
    parser=argparse.ArgumentParser(description="Agente assinado Union PABX (sem porta pública)")
    parser.add_argument('--profile',help='UUID da organizacao; omitir somente para o perfil legado Union')
    actions=parser.add_subparsers(dest="action",required=True)
    actions.add_parser("init")
    actions.add_parser("public-key")
    actions.add_parser("internal-routes")
    actions.add_parser("queues-init")
    configure_action=actions.add_parser("configure")
    configure_action.add_argument("agent_id")
    configure_action.add_argument("organization_id")
    once=actions.add_parser("once")
    once.add_argument("--dry-run",action="store_true")
    actions.add_parser("run")
    args=parser.parse_args()
    try:
        if args.profile is not None:
            select_profile(args.profile)
        if args.action=="public-key":
            print(PUBLIC_KEY.read_text().strip())
        else:
            require_root()
            from process_lock import exclusive
            with exclusive(STATE_DIR/'instance.lock'):
                if args.action in ('init','internal-routes','queues-init'):
                    with operation_lock():
                        {'init':init,'internal-routes':install_internal_routes,'queues-init':install_queues}[args.action]()
                elif args.action=="configure":
                    configure(args.agent_id,args.organization_id)
                elif args.action=="once":
                    cycle(args.dry_run)
                elif args.action=="run":
                    while True:
                        try:
                            cycle()
                        except Exception as exc:
                            print("Agente: " + str(exc),file=sys.stderr,flush=True)
                        time.sleep(30)
    except Exception as exc:
        print("Erro: " + str(exc),file=sys.stderr)
        return 1
    return 0

if __name__=="__main__":
    raise SystemExit(main())
