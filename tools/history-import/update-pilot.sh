#!/usr/bin/env bash
# Update an already installed pilot; preserve credentials, SQLite, nginx and units.
set -Eeuo pipefail
umask 077
cd "$(dirname "$0")"
NODE=/opt/union-history/runtime/node/bin/node
APP=/opt/union-history/app
STATE=/var/lib/union-history
G=union-history-gateway.service
W=union-history-worker.service
test "$(id -u)" = 0
test -x "$NODE" && test -f "$APP/run-service.sh" && test -f "$STATE/index.sqlite"
test -f /etc/union-history/gateway.secret && test -f /etc/union-history/rclone.conf
exec 8>/root/union-history-upgrade.lock
flock -n 8
"$NODE" --test archive-store.test.mjs history-page.test.mjs archive-media.test.mjs
# Only upgrade the unstarted pilot. No live index is overwritten or migrated blindly.
python3 - <<'PY'
import sqlite3
with sqlite3.connect('file:/var/lib/union-history/index.sqlite?mode=ro',uri=True) as c:
    if c.execute("select count(*) from jobs").fetchone()[0]:
        raise SystemExit("FALHA SEGURA: existem importacoes; requer migracao supervisionada.")
PY
BACKUP=$(mktemp -d /root/union-history-app-backup.XXXXXXXX)
cp -a "$APP/." "$BACKUP/"
rollback(){
  trap - ERR
  systemctl stop "$W" "$G" || true
  cp -a "$BACKUP/." "$APP/"
  rm -f "$APP/archive-media.mjs" # absent in the original pilot; handled below if previously present
  if test -f "$BACKUP/archive-media.mjs"; then cp -a "$BACKUP/archive-media.mjs" "$APP/"; fi
  systemctl start "$G" "$W"
  echo "FALHA SEGURA: aplicativo anterior restaurado; indice e credenciais preservados."
  exit 1
}
trap rollback ERR
systemctl stop "$W" "$G"
for f in archive-contract.mjs archive-store.mjs archive-gateway.mjs history-page.mjs preflight.mjs archive-media.mjs; do
  install -o root -g root -m 644 "$f" "$APP/$f"
done
systemctl start "$G" "$W"
python3 - <<'PY'
import hashlib,hmac,json,time,uuid,urllib.request,urllib.error
secret=open('/etc/union-history/gateway.secret').read().strip().encode()
base='https://wa.unionworld.com.br/history-import'
org='00000000-0000-4000-8000-000000000001'
def signed(body):
    raw=json.dumps(body,separators=(',',':')).encode()
    ts=str(int(time.time()*1000)); nonce=str(uuid.uuid4())
    sig=hmac.new(secret,ts.encode()+b'.'+nonce.encode()+b'.'+raw,hashlib.sha256).hexdigest()
    req=urllib.request.Request(base,data=raw,headers={'Content-Type':'application/json','X-Union-Timestamp':ts,'X-Union-Nonce':nonce,'X-Union-Signature':sig})
    with urllib.request.urlopen(req,timeout=8) as res:return json.load(res)
for attempt in range(12):
    try:
        assert signed({'action':'list','organizationId':org})['success']
        page=signed({'action':'history_page','organizationId':org,'accountPhone':'550000000000','contactPhone':'550000000001','contactId':org,'conversationId':org})
        assert page['success'] and page['result']['items']==[]
        break
    except Exception:
        if attempt==11:raise SystemExit('FALHA: rota HTTPS nao confirmou nova versao')
        time.sleep(2)
try:
    urllib.request.urlopen(urllib.request.Request(base,data=b'{}',headers={'Content-Type':'application/json'}),timeout=8)
    raise SystemExit('FALHA: requisicao sem assinatura aceita')
except urllib.error.HTTPError as e:
    if e.code!=401:raise
try:
    urllib.request.urlopen(base+'?media='+'0'*64,timeout=8)
    raise SystemExit('FALHA: token invalido aceito')
except urllib.error.HTTPError as e:
    if e.code!=404:raise
print('HTTPS: autenticacao, leitura paginada e bloqueio de midia invalida VALIDADOS')
PY
systemctl is-active --quiet "$G" "$W"
trap - ERR
echo "===== ATUALIZACAO PILOTO CONCLUIDA ====="
echo "Gateway e worker ativos; configuracao HTTPS, chave e R2 preservados."
echo "Nenhum contato importado. Backup do aplicativo: $BACKUP"
