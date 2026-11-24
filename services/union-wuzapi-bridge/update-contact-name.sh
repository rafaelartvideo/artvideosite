#!/usr/bin/env bash
# Patch only verified-alias contact-name lookup; preserve all other live code.
set -Eeuo pipefail
[[ "$(id -u)" == 0 ]] || { echo "Execute como root."; exit 1; }
BASE=/opt/union-wuzapi-bridge
TARGET="$BASE/server.mjs"
SERVICE=union-wuzapi-bridge.service
NODE="$BASE/runtime/node-v24.22.0/bin/node"
for cmd in python3 systemctl curl cp mv mktemp flock; do
  command -v "$cmd" >/dev/null || { echo "Comando indisponível: $cmd"; exit 1; }
done
[[ -x "$NODE" && -f "$TARGET" ]] || { echo "Instalação inesperada; nada alterado."; exit 1; }
exec 9>"$BASE/.contact-name-release.lock"
flock -n 9 || { echo "Outra atualização em andamento."; exit 1; }
systemctl is-active --quiet "$SERVICE" || { echo "Ponte inativa; nada alterado."; exit 1; }
health() {
  systemctl is-active --quiet "$SERVICE" &&
    [[ "$(curl -s --connect-timeout 2 --max-time 4 -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:19080/v1/channel-control || true)" == 401 ]]
}
health || { echo "Verificação inicial falhou; nada alterado."; exit 1; }
TMP="$(mktemp "$BASE/.contact-name.XXXXXX.mjs")"
trap 'rm -f "$TMP"' EXIT
cp -a "$TARGET" "$TMP"
python3 - "$TMP" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
source=p.read_text()
old="    const entry=contacts[jid];\n    if(!entry || entry.Found===false) return {ok:true,name:null,source:null};\n    // An address-book name belongs to the exact recipient JID. WuzAPI\n    // message PushName from outgoing events belongs to our account instead.\n    // Cached fields are already normalized. Trimming a sliced name again\n    // would drop a space at the 160-character boundary on cache hits.\n    const nameField=field=>cached ? entry[field] : String(entry[field]||\"\").trim().slice(0,160);\n    const full=nameField(\"FullName\");\n    const first=nameField(\"FirstName\");\n    const business=nameField(\"BusinessName\");\n    const push=nameField(\"PushName\");\n    // BusinessName is a public business profile, not proof of a phonebook\n    // save. Only FullName / FirstName are authoritative saved names.\n    const saved=full||first;\n    const name=saved||push||business;\n    return {ok:true,name:name||null,source:saved?\"saved\":\"push\"};"
new="    // The signed backend can supply phone aliases already confirmed by the\n    // same provider JID. Never derive aliases from an opaque LID.\n    const readName=entry=>{\n      if(!entry || entry.Found===false)return null;\n      const nameField=field=>cached ? entry[field] : String(entry[field]||\"\").trim().slice(0,160);\n      const full=nameField(\"FullName\");\n      const first=nameField(\"FirstName\");\n      const business=nameField(\"BusinessName\");\n      const push=nameField(\"PushName\");\n      const saved=full||first;\n      const name=saved||push||business;\n      return name ? {name,source:saved?\"saved\":\"push\"} : null;\n    };\n    const exact=readName(contacts[jid]);\n    if(exact)return {ok:true,...exact};\n    let aliases=[];\n    try{\n      const supplied=JSON.parse(String(bodyText||\"[]\"));\n      if(Array.isArray(supplied))aliases=[...new Set(supplied.filter(value=>\n        typeof value===\"string\" && /^55[1-9][0-9][0-9]{8,9}@s\\.whatsapp\\.net$/.test(value)))].slice(0,4);\n    }catch{/* Older callers send an empty string. */}\n    // Read the SAME directory snapshot, without an additional provider call.\n    const candidates=aliases.filter(alias=>alias!==jid).map(alias=>readName(contacts[alias])).filter(Boolean);\n    const names=new Set(candidates.map(candidate=>candidate.name));\n    if(names.size===1){\n      const match=candidates.find(candidate=>candidate.source===\"saved\")||candidates[0];\n      return {ok:true,...match};\n    }\n    return {ok:true,name:null,source:null};"
if source.count(new)==1:
    print("Correção já presente.")
elif source.count(old)==1 and source.count(new)==0:
    p.write_text(source.replace(old,new,1))
else:
    raise SystemExit("Código instalado diverge da versão esperada. Abortado sem alterações.")
PY
"$NODE" --check "$TMP"
if cmp -s "$TARGET" "$TMP"; then echo "Ponte já atualizada."; exit 0; fi
BACKUP="$TARGET.before-contact-name-$(date +%Y%m%d-%H%M%S)"
cp -a "$TARGET" "$BACKUP"
rollback() {
  echo "Falha na atualização. Restaurando backup."
  cp -a "$BACKUP" "$TARGET"
  systemctl restart "$SERVICE" || true
  health || echo "ATENÇÃO: confirme o estado da ponte."
  exit 1
}
mv -f "$TMP" "$TARGET"
systemctl restart "$SERVICE" || rollback
ok=0
for attempt in 1 2 3 4 5; do
  sleep 2
  if health; then ok=1; break; fi
done
[[ "$ok" == 1 ]] || rollback
echo "OK: ponte ativa, correção de nome publicada. Motor WuzAPI, banco e PABX não reiniciados."
echo "Backup: $BACKUP"
