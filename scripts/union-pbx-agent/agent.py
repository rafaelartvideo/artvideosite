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

URL = "https://wmjmtcjpunmzvonlkjcu.supabase.co/functions/v1/union-pbx-agent"
CONFIG_DIR = Path("/etc/union-pbx-agent")
STATE_DIR = Path("/var/lib/union-pbx-agent")
SIP_DIR = Path("/etc/asterisk/pjsip.d")
PJSIP_FILE = Path("/etc/asterisk/pjsip.conf")
MASTER_FILE = SIP_DIR / "union-managed.conf"
INCLUDE = '#include "pjsip.d/union-managed.conf"'
PRIVATE_KEY = CONFIG_DIR / "private.pem"
PUBLIC_KEY = CONFIG_DIR / "public.key"
AGENT_CONFIG = CONFIG_DIR / "agent.json"
SEQUENCE_FILE = STATE_DIR / "sequence"
ENDPOINT_RE = re.compile(r"^uw-[a-f0-9]{32}$")
PASSWORD_RE = re.compile(r"^[A-Za-z0-9_-]{35,100}$")
REVISION_RE = re.compile(r"^\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)$")

class AgentError(Exception):
    pass

class Busy(AgentError):
    pass

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
        backup = Path("/root") / ("pjsip.conf.antes-union-agent-" + time.strftime("%Y%m%d-%H%M%S"))
        write_atomic(backup, existing.encode(), 0o600)
        with PJSIP_FILE.open("a") as stream:
            stream.write(("\n" if not existing.endswith("\n") else "") + "\n" + INCLUDE + "\n")
        print("Inclusão criada com backup. As configurações FVX e union-301 permaneceram intactas.")
    print("Agente inicializado. CHAVE PUBLICA (pode copiar para o CRM):")
    print(public)

def configure(agent_id, organization_id):
    require_root()
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
    return (f"[{endpoint}]\n"
        "type=aor\nmax_contacts=1\nremove_existing=yes\nqualify_frequency=30\n\n"
        f"[{auth}]\ntype=auth\nauth_type=userpass\nusername={endpoint}\npassword={password}\n\n"
        f"[{endpoint}]\ntype=endpoint\ntransport=transport-ws\n"
        f"aors={endpoint}\nauth={auth}\ncontext=union-internal\n"
        "disallow=all\nallow=alaw,ulaw\nwebrtc=yes\ndirect_media=no\n"
        "force_rport=yes\nrewrite_contact=yes\nrtp_symmetric=yes\n"
        f"callerid=Ramal {number} <{number}>\n\n")

def validate_job(job, org_id):
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
        endpoint = state["endpoint"]
        if not ENDPOINT_RE.fullmatch(endpoint) or not PASSWORD_RE.fullmatch(state["password"]):
            raise AgentError("Estado local inválido, nenhuma configuração será recarregada.")
        if endpoint in states:
            raise AgentError("Endpoints duplicados no estado local.")
        states[endpoint] = state
    if overrides:
        for state in overrides:
            states[state["endpoint"]] = state
    parts = ["; Union-managed WebRTC endpoints. Never edit this file manually.\n"]
    for endpoint, state in sorted(states.items()):
        if state["enabled"]:
            parts.append(sip_conf(endpoint, state["number"], state["password"]))
    return "".join(parts).encode()

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
    group = grp.getgrnam("asterisk").gr_gid
    try:
        write_atomic(state_path, json_bytes(state))
        write_atomic(MASTER_FILE, proposed, 0o640, group)
        result = asterisk("module reload res_pjsip.so")
        if "reloaded successfully" not in result.lower():
            raise AgentError("Asterisk não confirmou o reload.")
        detail = asterisk("pjsip show endpoint " + endpoint)
        present = bool(re.search(r"(?m)^\s*Endpoint:\s+" + re.escape(endpoint) + r"\b", detail))
        if present != state["enabled"]:
            raise AgentError("Estado do endpoint não corresponde ao solicitado.")
        assert_fvx(old_fvx)
    except Exception:
        if old_state is None:
            state_path.unlink(missing_ok=True)
        else:
            write_atomic(state_path, old_state)
        write_atomic(MASTER_FILE, old_master, 0o640, group)
        try:
            asterisk("module reload res_pjsip.so")
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


def cycle(dry_run=False):
    config = json.loads(AGENT_CONFIG.read_text())
    payload = signed_request({"action":"poll"})
    jobs = payload.get("jobs", [])
    if not isinstance(jobs, list) or len(jobs) > 10:
        raise AgentError("Resposta de jobs inválida.")
    logins = payload.get("login_requests", [])
    if not isinstance(logins, list) or len(logins) > 10:
        raise AgentError("Resposta de solicitações de acesso inválida.")
    if not jobs and not logins and dry_run:
        print("Sem ramais ou solicitações de acesso pendentes.")
    for job in jobs:
        try:
            validate_job(job, config["organization_id"])
            if dry_run:
                print(f"Prévia: ramal {job['number']}, ativar={job['desired_enabled']}, endpoint={job['endpoint_name']}")
                continue
            apply_job(job, config["organization_id"])
            status, error = "applied", None
        except Busy as exc:
            print(str(exc))
            return
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

def main():
    parser=argparse.ArgumentParser(description="Agente assinado Union PABX (sem porta pública)")
    actions=parser.add_subparsers(dest="action",required=True)
    actions.add_parser("init")
    actions.add_parser("public-key")
    configure_action=actions.add_parser("configure")
    configure_action.add_argument("agent_id")
    configure_action.add_argument("organization_id")
    once=actions.add_parser("once")
    once.add_argument("--dry-run",action="store_true")
    actions.add_parser("run")
    args=parser.parse_args()
    try:
        if args.action=="init":
            init()
        elif args.action=="public-key":
            print(PUBLIC_KEY.read_text().strip())
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
