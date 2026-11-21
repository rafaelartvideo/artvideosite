#!/usr/bin/env bash
set -Eeuo pipefail
BASE=/opt/union-whatsapp-webhook-queue
NODE_DIR=/opt/union-wuzapi-bridge/runtime/node-v24.22.0
SOURCE="$(cd "$(dirname "$0")" && pwd)"
REDIS_IMAGE=sha256:8a1efc5f479551822b47424ccae982026b633f28818eab0387348120a61e10e2
[ "$(id -u)" = 0 ]
[ -x "$NODE_DIR/bin/node" ]
[ -r /opt/union-wuzapi-bridge/.env ]
[ ! -e "$BASE/app/server.mjs" ] || { echo 'Instalação existente: preserve release e fila antes de atualizar.'; exit 1; }
docker image inspect "$REDIS_IMAGE" >/dev/null
UID_BRIDGE="$(id -u unionbridge)"; GID_BRIDGE="$(id -g unionbridge)"
install -d -o root -g root -m 0755 "$BASE" "$BASE/app"
install -d -o unionbridge -g unionbridge -m 0700 "$BASE/data"
for file in core.mjs server.mjs probe.mjs retry-failed.mjs configure-channel.mjs integration-check.mjs package.json package-lock.json; do install -m 0644 "$SOURCE/$file" "$BASE/app/$file"; done
(cd "$BASE/app"; PATH="$NODE_DIR/bin:$PATH" "$NODE_DIR/bin/node" "$NODE_DIR/lib/node_modules/npm/bin/npm-cli.js" ci --omit=dev --ignore-scripts)
"$NODE_DIR/bin/node" --check "$BASE/app/server.mjs"
# Redis dedicado sem rede TCP e sem política de expulsão de trabalhos.
docker create --name union-whatsapp-webhook-redis --restart unless-stopped --network none \
 --memory 512m --cpus 0.5 --user "$UID_BRIDGE:$GID_BRIDGE" \
 -v "$BASE/data:/data" "$REDIS_IMAGE" redis-server --port 0 \
 --unixsocket /data/redis.sock --unixsocketperm 700 --dir /data \
 --appendonly yes --appendfsync always --save '' --maxmemory 128mb --maxmemory-policy noeviction >/dev/null
docker start union-whatsapp-webhook-redis >/dev/null
cat > /etc/systemd/system/union-whatsapp-webhook-queue.service <<'UNIT'
[Unit]
Description=Union WhatsApp durable encrypted webhook queue
After=network-online.target docker.service
Wants=network-online.target
[Service]
Type=simple
User=unionbridge
Group=unionbridge
WorkingDirectory=/opt/union-whatsapp-webhook-queue/app
EnvironmentFile=/opt/union-wuzapi-bridge/.env
ExecStart=/opt/union-wuzapi-bridge/runtime/node-v24.22.0/bin/node /opt/union-whatsapp-webhook-queue/app/server.mjs
Restart=on-failure
RestartSec=5
TimeoutStopSec=45
MemoryMax=192M
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
CapabilityBoundingSet=
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now union-whatsapp-webhook-queue.service >/dev/null
ready=0
for attempt in $(seq 1 10); do
 if curl --fail --silent --max-time 2 http://127.0.0.1:19081/health >/dev/null; then ready=1; break; fi
 sleep 1
done
[ "$ready" = 1 ] || { echo 'Fila não passou na verificação local; callbacks não foram alterados.'; exit 1; }
# Não altera callbacks, ponte, Redis anterior, containers existentes ou nginx.
echo 'Fila instalada; teste a saúde, persistência e proxy antes de mudar callbacks.'
