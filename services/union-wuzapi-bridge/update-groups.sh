#!/usr/bin/env bash
# Atualiza a ponte Union WuzAPI com gestão de grupos (criar, participantes,
# editar, enviar e sair). Não altera tokens, sessões, Docker ou firewall.
set -Eeuo pipefail
if [ "$(id -u)" -ne 0 ]; then echo "Execute como root na VPS."; exit 1; fi

BASE=/opt/union-wuzapi-bridge
NODE="$BASE/runtime/node-v24.22.0/bin/node"
TARGET="$BASE/server.mjs"
SERVICE=union-wuzapi-bridge.service
COMMIT=f88b789d84f6771a856a5d87930bb1e0f6d6d95b
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
grep -Fq 'if(action==="groups_list")' "$TMP" || { echo "Código sem consulta de grupos."; exit 1; }
grep -Fq 'if(action==="groups_manage")' "$TMP" || { echo "Código sem administração de grupos."; exit 1; }
grep -Fq 'if(command==="history")' "$TMP" || { echo "Código sem histórico paginado."; exit 1; }
grep -Fq 'if(command==="send_image")' "$TMP" || { echo "Código sem envio de imagens."; exit 1; }
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
echo "Ponte Union atualizada. Consulta e gerenciamento de grupos habilitados."
echo "Cópia da versão anterior: $BACKUP"
