#!/usr/bin/env bash
# Union World: somente leitura da imagem Docker em execução.
# NÃO reinicia WuzAPI, não lê mensagens e não requer tokens no painel.
set -Eeuo pipefail
if [[ $(id -u) != 0 ]]; then echo "Execute como root na VPS."; exit 1; fi
command -v docker >/dev/null
command -v python3 >/dev/null
container="${UNION_WUZAPI_CONTAINER:-wuzapi-api}"
if [[ ! "$container" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$ ]]; then
  echo "Nome de contêiner inválido"; exit 1
fi
state="$(docker inspect --format '{{.State.Running}}' "$container")"
if [[ "$state" != true ]]; then echo "Contêiner WuzAPI não está ativo."; exit 1; fi
image="$(docker inspect --format '{{.Config.Image}}' "$container")"
image_id="$(docker inspect --format '{{.Image}}' "$container")"
if [[ ! "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  echo "Identificador de imagem não confiável"; exit 1
fi
BASE=/opt/union-wuzapi-bridge
install -d -o root -g root -m 0755 "$BASE"
tmp="$(mktemp "$BASE/.engine-release.XXXXXX")"
trap 'rm -f "$tmp"' EXIT
IMAGE="$image" IMAGE_ID="$image_id" python3 - <<'PY' > "$tmp"
import json, os, re, datetime
image=os.environ["IMAGE"]
version=None
tag=image.rsplit(":",1)[-1] if ":" in image else ""
if re.fullmatch(r"v?\d+\.\d+\.\d+",tag): version=tag
print(json.dumps({
    "version":version,
    "image":image[:180],
    "image_id":os.environ["IMAGE_ID"],
    "observed_at":datetime.datetime.now(datetime.timezone.utc).isoformat()
},separators=(",",":")))
PY
chmod 0644 "$tmp"
chown root:root "$tmp"
mv -f "$tmp" "$BASE/engine-release.json"
echo "Estado da imagem WuzAPI registrado (sem alterar contêiner)."
