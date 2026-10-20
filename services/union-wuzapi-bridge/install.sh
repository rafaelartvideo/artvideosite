#!/usr/bin/env bash
# Union World: install the isolated WuzAPI control bridge on loopback only.
# This DOES NOT touch the Zappro, existing Docker Compose, nginx or firewall.
set -Eeuo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Execute como root na VPS."; exit 1; fi
BASE=/opt/union-wuzapi-bridge
SOURCE_ENV=/opt/union-wuzapi/.env
UNIT=/etc/systemd/system/union-wuzapi-bridge.service
# Pinned to a reviewed source commit, not the mutable main branch.
COMMIT=355d2304925268514b08913d7543ff2405fe62bb
URL="https://raw.githubusercontent.com/rafaelartvideo/artvideosite/${COMMIT}/services/union-wuzapi-bridge/server.mjs"

if [ ! -r "$SOURCE_ENV" ]; then echo "Arquivo privado do WuzAPI não encontrado."; exit 1; fi
command -v curl >/dev/null
command -v python3 >/dev/null
command -v systemctl >/dev/null
command -v node >/dev/null
NODE_BIN="$(command -v node)"
NODE_REAL="$(readlink -f "$NODE_BIN")"
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 20 ] || [[ "$NODE_REAL" == /root/* ]]; then
  echo "É necessário Node.js 20+ instalado fora de /root, disponível para o serviço systemd."
  exit 1
fi

# Abort if WuzAPI is not reachable locally; do not start or restart it.
api_status="$(curl --connect-timeout 3 --max-time 5 -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18080/admin/users || true)"
if [ "$api_status" != "401" ]; then
  echo "WuzAPI local não respondeu com HTTP 401 (resposta: $api_status). Instalação cancelada."
  exit 1
fi

echo "Baixando código da ponte no commit fixo..."
TMP="$(mktemp --suffix=.mjs)"
trap 'rm -f "$TMP"' EXIT
curl --fail --location --silent --show-error --retry 2 "$URL" -o "$TMP"
node --check "$TMP" >/dev/null

if ! id -u unionbridge >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "$BASE" --shell /usr/sbin/nologin unionbridge
fi
install -d -o root -g root -m 0755 "$BASE"
install -d -o unionbridge -g unionbridge -m 0700 "$BASE/sessions"

install -o root -g root -m 0644 "$TMP" "$BASE/server.mjs"

# Parse the original WuzAPI env without sourcing/executing it. Secrets never
# appear on stdout, in the Github repo, or in the shell history.
BASE="$BASE" SOURCE_ENV="$SOURCE_ENV" python3 - <<'PY'
from pathlib import Path
import os, shlex, secrets
base=Path(os.environ["BASE"])
original=Path(os.environ["SOURCE_ENV"])
target=base/".env"
def read_simple_env(path):
    env={}
    if not path.exists(): return env
    for row in path.read_text().splitlines():
        row=row.strip()
        if not row or row.startswith("#") or "=" not in row: continue
        key,raw=row.split("=",1)
        parts=shlex.split(raw,comments=True)
        env[key.strip()]=parts[0] if parts else ""
    return env
existing=read_simple_env(target)
source=read_simple_env(original)
admin=source.get("WUZAPI_ADMIN_TOKEN","")
if len(admin)<16 or "\n" in admin or "\r" in admin:
    raise SystemExit("Token administrativo ausente ou inválido no WuzAPI original.")
secret=existing.get("UNION_WUZAPI_BRIDGE_SECRET") or secrets.token_hex(32)
lines=[
    "WUZAPI_ADMIN_TOKEN="+shlex.quote(admin),
    "UNION_WUZAPI_BRIDGE_SECRET="+shlex.quote(secret),
    "UNION_BRIDGE_PORT=19080",
    "UNION_WUZAPI_SESSIONS_DIR=/opt/union-wuzapi-bridge/sessions",
]
tmp=base/".env.installing"
with tmp.open("w") as handle:
    handle.write("\n".join(lines)+"\n")
os.chmod(tmp,0o600)
os.replace(tmp,target)
os.chown(target,0,0)
PY

# Service runs as an unprivileged user. Only local 19080, no public port.
cat > "$UNIT" <<EOF
[Unit]
Description=Union World WuzAPI signed control bridge
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=unionbridge
Group=unionbridge
WorkingDirectory=$BASE
EnvironmentFile=$BASE/.env
ExecStart=$NODE_REAL $BASE/server.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=$BASE/sessions
CapabilityBoundingSet=
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6

[Install]
WantedBy=multi-user.target
EOF
chmod 0644 "$UNIT"
systemctl daemon-reload
systemctl enable --now union-wuzapi-bridge.service >/dev/null
systemctl restart union-wuzapi-bridge.service
sleep 2

active="$(systemctl is-active union-wuzapi-bridge.service)"
http="$(curl --connect-timeout 3 --max-time 5 -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:19080/v1/channel-control || true)"
echo "===== TESTES DE SAUDE ====="
echo "Serviço: $active"
echo "Endpoint local sem assinatura: HTTP $http (esperado: 401)"
echo "Escuta TCP:"
ss -ltn '( sport = :19080 )' | tail -n +2
echo "Arquivo de credenciais: $BASE/.env (NÃO compartilhar)."
echo "Nenhum serviço ou número WhatsApp existente foi alterado."
if [ "$active" != "active" ] || [ "$http" != "401" ]; then
  echo "A ponte não passou nos testes; verifique: journalctl -u union-wuzapi-bridge -n 30 --no-pager"
  exit 1
fi
echo "Ponte instalada e respondendo apenas no localhost. Nginx HTTPS e segredos Supabase AINDA pendentes."
