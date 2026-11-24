#!/usr/bin/env bash
# Isolated installation. No CRM changes, no external listener, no package grants.
set -Eeuo pipefail
umask 077
cd "$(dirname "$0")"
NODE=/opt/union-history/runtime/node/bin/node
RCLONE=/opt/union-history/runtime/rclone
CONFIG=/etc/union-history/rclone.conf
SECRET=/etc/union-history/gateway.secret
APP=/opt/union-history/app
STATE=/var/lib/union-history
PID=01b189c70ffdc201ef0f
GATEWAY=union-history-gateway.service
WORKER=union-history-worker.service
[ "$(id -u)" = 0 ] || { echo "FALHA SEGURA: execute como root"; exit 1; }
for f in "$NODE" "$RCLONE"; do test -x "$f"; done
test -f "$CONFIG" && test ! -L "$CONFIG"
[ "$(stat -c '%u:%a' "$CONFIG")" = "0:600" ] || { echo "FALHA SEGURA: permissao da configuracao"; exit 1; }
for f in "$APP" "$STATE/index.sqlite" "$SECRET" "/etc/systemd/system/$GATEWAY" "/etc/systemd/system/$WORKER"; do
  if [ -e "$f" ] || [ -L "$f" ]; then echo "FALHA SEGURA: instalacao anterior encontrada; nenhuma substituicao"; exit 1; fi
done
if ss -H -ltn 'sport = :19091' | grep -q .; then echo "FALHA SEGURA: porta local ocupada"; exit 1; fi
echo "===== TESTES DO IMPORTADOR ====="
"$NODE" --test archive-store.test.mjs history-page.test.mjs archive-media.test.mjs
echo "===== VALIDACAO PRIVADA DO PACOTE ====="
UNION_HISTORY_RCLONE_CONFIG="$CONFIG" UNION_HISTORY_RCLONE="$RCLONE" "$NODE" preflight.mjs "$PID"
# Installation only after real package and unit tests pass.
if ! getent passwd union-history >/dev/null; then
  useradd --system --user-group --home-dir "$STATE" --shell /usr/sbin/nologin union-history
else
  echo "FALHA SEGURA: usuario de servico preexistente; revise antes de continuar"; exit 1
fi
install -d -o root -g root -m 755 "$APP"
install -d -o union-history -g union-history -m 700 "$STATE"
for f in archive-contract.mjs archive-store.mjs archive-gateway.mjs history-page.mjs preflight.mjs archive-media.mjs; do
  install -o root -g root -m 644 "$f" "$APP/$f"
done
python3 -c 'import secrets; print(secrets.token_hex(48))' > "$SECRET"
chmod 600 "$SECRET"
cat > "$APP/run-service.sh" <<'SH'
#!/bin/sh
set -eu
export UNION_HISTORY_RCLONE_CONFIG="$CREDENTIALS_DIRECTORY/rclone.conf"
export UNION_HISTORY_RCLONE=/opt/union-history/runtime/rclone
export UNION_HISTORY_DB=/var/lib/union-history/index.sqlite
export UNION_HISTORY_PORT=19091
export XDG_CACHE_HOME=/var/lib/union-history/cache
if [ "$1" = gateway ]; then
  UNION_HISTORY_GATEWAY_SECRET=$(cat "$CREDENTIALS_DIRECTORY/gateway.secret")
  export UNION_HISTORY_GATEWAY_SECRET
  exec /opt/union-history/runtime/node/bin/node /opt/union-history/app/archive-gateway.mjs gateway
fi
exec /usr/bin/flock -n /var/lib/union-history/worker.lock /opt/union-history/runtime/node/bin/node /opt/union-history/app/archive-gateway.mjs worker
SH
chmod 755 "$APP/run-service.sh"
for kind in gateway worker; do
  unit="/etc/systemd/system/union-history-$kind.service"
  {
    printf '[Unit]\nDescription=Union World private history %s\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\n' "$kind"
    cat <<'UNIT'
Type=simple
User=union-history
Group=union-history
UMask=0077
WorkingDirectory=/opt/union-history/app
LoadCredential=rclone.conf:/etc/union-history/rclone.conf
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
ReadWritePaths=/var/lib/union-history
RestrictSUIDSGID=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
MemoryMax=384M
CPUQuota=35%
TasksMax=64
Restart=on-failure
RestartSec=5
TimeoutStopSec=100
UNIT
    if [ "$kind" = gateway ]; then printf 'LoadCredential=gateway.secret:/etc/union-history/gateway.secret\n'; fi
    printf 'ExecStart=/opt/union-history/app/run-service.sh %s\n\n[Install]\nWantedBy=multi-user.target\n' "$kind"
  } > "$unit"
  chmod 644 "$unit"
done
cleanup_failure(){
  systemctl stop "$WORKER" "$GATEWAY" >/dev/null 2>&1 || true
  echo "FALHA SEGURA: servicos novos interrompidos; arquivos preservados para diagnostico. Nenhum dado importado."
}
trap cleanup_failure ERR
systemd-analyze verify "/etc/systemd/system/$GATEWAY" "/etc/systemd/system/$WORKER"
systemctl daemon-reload
systemctl start "$GATEWAY" "$WORKER"
# Validate authenticated management response, not just service presence.
python3 - <<'PY'
import hashlib,hmac,json,time,uuid,urllib.request,urllib.error
with open('/etc/union-history/gateway.secret') as f: secret=f.read().strip().encode()
url='http://127.0.0.1:19091/history-import'
raw=json.dumps({'action':'list','organizationId':'00000000-0000-4000-8000-000000000001'},separators=(',',':')).encode()
for attempt in range(15):
    try:
        ts=str(int(time.time()*1000)); nonce=str(uuid.uuid4())
        sig=hmac.new(secret,ts.encode()+b'.'+nonce.encode()+b'.'+raw,hashlib.sha256).hexdigest()
        req=urllib.request.Request(url,data=raw,headers={'Content-Type':'application/json','X-Union-Timestamp':ts,'X-Union-Nonce':nonce,'X-Union-Signature':sig})
        with urllib.request.urlopen(req,timeout=4) as res: data=json.load(res)
        assert data['success'] and data['result']['packages']==[] and data['result']['jobs']==[]
        break
    except Exception:
        if attempt==14: raise SystemExit('FALHA: gateway nao confirmado')
        time.sleep(1)
try:
    urllib.request.urlopen(urllib.request.Request(url,data=raw,headers={'Content-Type':'application/json'}),timeout=5)
    raise SystemExit('FALHA: gateway aceitou requisicao nao autenticada')
except urllib.error.HTTPError as e:
    if e.code!=401: raise
print('Gateway local autenticado: OK; sem assinatura: BLOQUEADO')
PY
systemctl is-active --quiet "$GATEWAY"
systemctl is-active --quiet "$WORKER"
if ss -H -ltn 'sport = :19091' | awk '{print $4}' | grep -vx '127.0.0.1:19091'; then
  echo "FALHA SEGURA: listener inesperado"; false
fi
systemctl enable "$GATEWAY" "$WORKER" >/dev/null
trap - ERR
echo "===== SERVICO PILOTO INSTALADO ====="
echo "Gateway: $(systemctl is-active "$GATEWAY") (127.0.0.1:19091)"
echo "Worker: $(systemctl is-active "$WORKER")"
echo "Node original: $(node -v)"
echo "Configuracao original R2: preservada"
echo "Pacote validado; nenhuma empresa autorizada, nenhum contato importado."
echo "Nenhuma porta publica aberta; falta configurar a integracao HTTPS/Edge Function."
