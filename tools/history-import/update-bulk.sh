#!/usr/bin/env bash
# Upgrade the existing importer, preserving the SQLite index and R2 credentials.
# Requires local root, the existing service installation, and public.jwt in this package.
set -Eeuo pipefail
umask 077
cd "$(dirname "$0")"
NODE=/opt/union-history/runtime/node/bin/node
APP=/opt/union-history/app
STATE=/var/lib/union-history
G=union-history-gateway.service
W=union-history-worker.service
ETC=/etc/union-history
DROP_G=/etc/systemd/system/$G.d/90-bulk.conf
DROP_W=/etc/systemd/system/$W.d/90-bulk.conf
URL=https://wmjmtcjpunmzvonlkjcu.supabase.co/functions/v1/union-history-import
test "$(id -u)" = 0
test -x "$NODE" && test -f "$APP/run-service.sh" && test -f "$STATE/index.sqlite"
test -f "$ETC/gateway.secret" && test -f "$ETC/rclone.conf" && test -f public.jwt
systemctl is-active --quiet "$G" "$W"
exec 8>/root/union-history-upgrade.lock
flock -n 8
# Accept only a public anon JWT for this exact project, never a service-role key.
python3 - <<'PY'
import base64,json,pathlib,re
jwt=pathlib.Path('public.jwt').read_text().strip()
assert re.fullmatch(r'eyJ[\w-]+\.[\w-]+\.[\w-]+',jwt)
p=jwt.split('.')[1]
claims=json.loads(base64.urlsafe_b64decode(p+'='*(-len(p)%4)))
assert claims.get('role')=='anon' and claims.get('ref')=='wmjmtcjpunmzvonlkjcu'
PY
for f in "$DROP_G" "$DROP_W" "$ETC/bulk-public.jwt" "$APP/run-bulk-worker.sh"; do
  if test -e "$f" || test -L "$f"; then echo "FALHA SEGURA: configuracao bulk existente; nenhuma substituicao."; exit 1; fi
done
"$NODE" --test archive-store.test.mjs history-page.test.mjs archive-media.test.mjs
python3 - "$URL" <<'PY'
# No writes: invalid signature must fail at the new Edge Function, signed
# fictitious scope must be rejected by the gateway. Never print credentials.
import json,pathlib,urllib.request,urllib.error,sys,time,uuid,hmac,hashlib
jwt=pathlib.Path('public.jwt').read_text().strip()
url=sys.argv[1]
org='00000000-0000-4000-8000-000000000001'
raw=json.dumps({'action':'worker_reconcile','organization_id':org,'id':org,'after':None},separators=(',',':')).encode()
def request(headers):
    req=urllib.request.Request(url,data=raw,headers={'Authorization':'Bearer '+jwt,'apikey':jwt,'Content-Type':'application/json',**headers})
    try:
        with urllib.request.urlopen(req,timeout=15) as res:return res.status,json.load(res)
    except urllib.error.HTTPError as e:return e.code,json.load(e)
status,body=request({})
assert status==401 and body.get('error')=='Worker não autorizado.', 'Edge Function ainda nao esta sincronizada'
print('Edge Function: assinatura obrigatoria confirmada.')
PY
# Avoid interrupting an active validation; never reset live checkpoints.
python3 - <<'PY'
import sqlite3
with sqlite3.connect('file:/var/lib/union-history/index.sqlite?mode=ro',uri=True) as c:
    assert c.execute("PRAGMA quick_check").fetchone()[0]=='ok'
    assert c.execute("select count(*) from jobs where state in ('queued','running','pausing','cancelling')").fetchone()[0]==0, 'Pause o processamento antes da atualizacao'
PY
BACKUP=$(mktemp -d /root/union-history-bulk-backup.XXXXXXXX)
mkdir "$BACKUP/app"
cp -a "$APP/." "$BACKUP/app/"
rollback(){
  trap - ERR
  systemctl stop "$W" "$G" || true
  cp -a "$BACKUP/app/." "$APP/"
  rm -f "$APP/run-bulk-worker.sh" "$APP/build-bulk-manifest.mjs" "$DROP_G" "$DROP_W" "$ETC/bulk-public.jwt"
  systemctl daemon-reload
  systemctl start "$G" "$W"
  echo "FALHA SEGURA: codigo anterior restaurado; indice preservado. Backup local: $BACKUP"
  exit 1
}
trap rollback ERR
systemctl stop "$W" "$G"
python3 - "$BACKUP" <<'PY'
import sqlite3,sys,os,json
def counts(c):
    return {t:c.execute('select count(*) from '+t).fetchone()[0] for t in ('jobs','entries','bindings','history_messages','history_protocols','history_assets','history_index_ready')}
with sqlite3.connect('file:/var/lib/union-history/index.sqlite?mode=ro',uri=True) as src, sqlite3.connect(os.path.join(sys.argv[1],'index.sqlite')) as dst:
    src.backup(dst)
    assert dst.execute("PRAGMA quick_check").fetchone()[0]=='ok'
    open(os.path.join(sys.argv[1],'counts.json'),'w').write(json.dumps(counts(src)))
PY
for f in archive-contract.mjs archive-store.mjs archive-gateway.mjs history-page.mjs preflight.mjs archive-media.mjs build-bulk-manifest.mjs; do
  install -o root -g root -m 644 "$f" "$APP/$f"
done
install -o root -g root -m 600 public.jwt "$ETC/bulk-public.jwt"
install -d -m 755 "$(dirname "$DROP_G")" "$(dirname "$DROP_W")"
cat > "$APP/run-bulk-worker.sh" <<'SH'
#!/bin/sh
set -eu
export UNION_HISTORY_GATEWAY_SECRET="$(cat "$CREDENTIALS_DIRECTORY/gateway.secret")"
export UNION_HISTORY_PUBLIC_JWT="$(cat "$CREDENTIALS_DIRECTORY/bulk-public.jwt")"
exec /opt/union-history/app/run-service.sh worker
SH
chmod 755 "$APP/run-bulk-worker.sh"
cat > "$DROP_G" <<'UNIT'
[Service]
Environment=UNION_HISTORY_BULK_ENABLED=1
UNIT
cat > "$DROP_W" <<UNIT
[Service]
Environment=UNION_HISTORY_BULK_ENABLED=1
Environment=UNION_HISTORY_EDGE_URL=$URL
LoadCredential=gateway.secret:$ETC/gateway.secret
LoadCredential=bulk-public.jwt:$ETC/bulk-public.jwt
ExecStart=
ExecStart=$APP/run-bulk-worker.sh
UNIT
chmod 644 "$DROP_G" "$DROP_W"
systemd-analyze verify "/etc/systemd/system/$G" "/etc/systemd/system/$W"
systemctl daemon-reload
systemctl start "$G" "$W"
python3 - "$BACKUP" <<'PY'
import hashlib,hmac,json,time,uuid,urllib.request,urllib.error,sqlite3,sys,os
secret=open('/etc/union-history/gateway.secret').read().strip().encode()
url='https://wa.unionworld.com.br/history-import'
org='00000000-0000-4000-8000-000000000001'
def signed(body):
    raw=json.dumps(body,separators=(',',':')).encode()
    ts=str(int(time.time()*1000));nonce=str(uuid.uuid4())
    sig=hmac.new(secret,ts.encode()+b'.'+nonce.encode()+b'.'+raw,hashlib.sha256).hexdigest()
    req=urllib.request.Request(url,data=raw,headers={'Content-Type':'application/json','X-Union-Timestamp':ts,'X-Union-Nonce':nonce,'X-Union-Signature':sig})
    with urllib.request.urlopen(req,timeout=8) as res:return json.load(res)
for i in range(12):
    try:
        assert signed({'action':'list','organizationId':org})['result']['bulk_enabled'] is True
        assert signed({'action':'history_page','organizationId':org,'accountPhone':'550000000000','contactPhone':'550000000001','contactId':org,'conversationId':org})['result']['items']==[]
        break
    except Exception:
        if i==11:raise
        time.sleep(2)
try:
    urllib.request.urlopen(urllib.request.Request(url,data=b'{}',headers={'Content-Type':'application/json'}),timeout=8)
    raise RuntimeError('Assinatura nao exigida')
except urllib.error.HTTPError as e: assert e.code==401
with sqlite3.connect('file:/var/lib/union-history/index.sqlite?mode=ro',uri=True) as c:
    assert c.execute('PRAGMA quick_check').fetchone()[0]=='ok'
    before=json.load(open(os.path.join(sys.argv[1],'counts.json')))
    assert all(c.execute('select count(*) from '+t).fetchone()[0]==n for t,n in before.items())
    assert c.execute('select count(*) from bulk_runs').fetchone()[0]==0
print('Gateway HTTPS, indice e contagens anteriores: OK. Nenhuma nova importacao iniciada.')
PY
systemctl is-active --quiet "$G" "$W"
trap - ERR
echo "===== MOTOR DE IMPORTACAO EM MASSA INSTALADO ====="
echo "Gateway e worker ativos. Backup protegido: $BACKUP"
echo "Nenhum contato novo foi criado. Homologue o lote piloto pelo CRM."
