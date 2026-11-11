#!/usr/bin/env bash
# Only updates the Union WuzAPI Node bridge, not WhatsApp sessions or WuzAPI.
set -Eeuo pipefail

BASE="/opt/union-wuzapi-bridge"
TARGET="$BASE/server.mjs"
SERVICE="union-wuzapi-bridge"
COMMIT="6f07525cfef4cdd33eb2987a821ab142eaaa92bd"
URL="https://raw.githubusercontent.com/rafaelartvideo/artvideosite/$COMMIT/services/union-wuzapi-bridge/server.mjs"
NODE="$BASE/runtime/node-v24.22.0/bin/node"
[[ -x "$NODE" ]] || NODE="$(command -v node)"
FFMPEG="${UNION_FFMPEG_PATH:-$(command -v ffmpeg || true)}"

[[ -f "$TARGET" ]] || { echo "Bridge não encontrado."; exit 1; }
systemctl is-active --quiet "$SERVICE" || { echo "Bridge está inativo; nada alterado."; exit 1; }
[[ -n "$FFMPEG" && -x "$FFMPEG" ]] || { echo "FFmpeg não instalado/executável."; exit 1; }

# Avoid grep -q on a pipe with pipefail, which falsely failed in an earlier update.
ENCODERS="$("$FFMPEG" -hide_banner -encoders 2>/dev/null)"
grep -Eq '[[:space:]]libmp3lame[[:space:]]' <<< "$ENCODERS" ||
  { echo "FFmpeg sem libmp3lame. Instale uma versão com codificação MP3."; exit 1; }

TMPDIR="$(mktemp -d "$BASE/.audio-release.XXXXXXXX")"
trap 'rm -rf "$TMPDIR"' EXIT

# Test actual encoding (not just the encoder listing).
"$FFMPEG" -hide_banner -loglevel error -y -f lavfi   -i 'sine=frequency=440:duration=0.7' -ac 1 -ar 44100   -c:a libmp3lame -b:a 96k -id3v2_version 0 -write_xing 0   "$TMPDIR/check.mp3"
[[ -s "$TMPDIR/check.mp3" ]] ||
  { echo "Teste real de MP3 falhou. Nada alterado."; exit 1; }

curl -fLsS --retry 3 --max-time 45 "$URL" -o "$TMPDIR/server.mjs"
"$NODE" --check "$TMPDIR/server.mjs"
grep -Fq 'const toPlayableAudio = async input =>' "$TMPDIR/server.mjs"
grep -Fq 'MimeType:"audio/mpeg",PTT:false' "$TMPDIR/server.mjs"
grep -Fq 'sticker:"/chat/downloadsticker"' "$TMPDIR/server.mjs"
grep -Fq 'Document:dataUrl,FileName:name,MimeType:mime,Caption:caption' "$TMPDIR/server.mjs"

BACKUP="${TARGET}.backup-regular-audio-$(date +%Y%m%d-%H%M%S)"
cp -a "$TARGET" "$BACKUP"
cp "$TMPDIR/server.mjs" "$TARGET"

if ! systemctl restart "$SERVICE"; then
  cp -a "$BACKUP" "$TARGET"
  systemctl restart "$SERVICE" || true
  echo "Falha no restart. Backup restaurado: $BACKUP"
  exit 1
fi
sleep 3
if ! systemctl is-active --quiet "$SERVICE"; then
  cp -a "$BACKUP" "$TARGET"
  systemctl restart "$SERVICE" || true
  echo "Serviço instável. Backup restaurado: $BACKUP"
  exit 1
fi

echo "OK: bridge ativo e configurado para MP3 normal (PTT=false)."
echo "Backup: $BACKUP"
