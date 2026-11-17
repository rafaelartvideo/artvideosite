#!/usr/bin/env bash
# Atualiza apenas o servidor da ponte Union WuzAPI para incluir consulta
# de grupos. Não altera tokens, sessões, Docker, firewall ou outros serviços.
set -Eeuo pipefail
if [ "$(id -u)" -ne 0 ]; then echo "Execute como root na VPS."; exit 1; fi

BASE=/opt/union-wuzapi-bridge
NODE="$BASE/runtime/node-v24.22.0/bin/node"
TARGET="$BASE/server.mjs"
SERVICE=union-wuzapi-bridge.service
COMMIT=215eca8305ed95aacfcba94e282c1e0affe06a65
URL="https://raw.githubusercontent.com/rafaelartvideo/artvideosite/$COMMIT/services/union-wuzapi-bridge/server.mjs"

for command in curl systemctl grep cp install mktemp; do
  command -v "$command" >/dev/null || { echo "Comando indisponível: $command"; exit 1; }
done
test -x "$NODE" || { echo "Runtime isolado da ponte não encontrado."; exit 1; }
test -f "$TARGET" || { echo "Servidor atual da ponte não encontrado."; exit 1; }
systemctl is-active --quiet "$SERVICE" || { echo "Ponte já está inativa; atualização cancelada."; exit 1; }

TMP="$(mktemp "$BASE/.server-groups.XXXXXX.mjs")"
BACKUP=""
cleanup(){ rm -f "$TMP"; }
trap cleanup EXIT
curl --fail --location --silent --show-error --retry 2 "$URL" -o "$TMP"
grep -Fq 'if(action==="groups_list")' "$TMP" || { echo "O código baixado não contém o recurso de grupos."; exit 1; }
"$NODE" --check "$TMP"

BACKUP="$BASE/server.mjs.before-groups-$(date +%Y%m%d-%H%M%S)"
cp -p "$TARGET" "$BACKUP"
install -o root -g root -m 0644 "$TMP" "$TARGET"
systemctl restart "$SERVICE"
sleep 2
if ! systemctl is-active --quiet "$SERVICE"; then
  echo "Ponte não iniciou. Restaurando versão anterior."
  install -o root -g root -m 0644 "$BACKUP" "$TARGET"
  systemctl restart "$SERVICE"
  exit 1
fi
echo "Ponte Union atualizada. Grupos disponíveis para consulta."
echo "Cópia da versão anterior: $BACKUP"
