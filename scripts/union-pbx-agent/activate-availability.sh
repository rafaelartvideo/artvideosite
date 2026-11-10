#!/usr/bin/env bash
# Approved one-time update for the audited Union agent. No Asterisk reload.
set -euo pipefail
[[ "${1:-}" == '--acknowledge-availability-activation' ]] || { echo 'Aprovacao explicita necessaria.' >&2; exit 2; }
[[ "$(id -u)" == 0 ]] || exit 2
stage="$(cd -- "$(dirname -- "$0")" && pwd)"
agent=/opt/union-pbx-agent/agent.py
helper=/opt/union-pbx-agent/queue_availability.py
expected=1298c565168393fa8049636598585b842b85747cdb1b3c06e01109799d12c450
[[ "$(sha256sum "$agent" | cut -d' ' -f1)" == "$expected" ]] || { echo 'Agente mudou; reconciliar antes de aplicar.' >&2; exit 2; }
[[ ! -e "$helper" ]] || { echo 'Modulo de disponibilidade ja existe; revisar antes de aplicar.' >&2; exit 2; }
for file in agent.py queue_availability.py; do [[ -f "$stage/$file" && ! -L "$stage/$file" ]] || exit 2; done
[[ "$(sha256sum "$stage/agent.py" | cut -d' ' -f1)" == dadc633172990625c8e87e7076bf74bd0d8502ab55aafab51bf7bee755869fc1 ]] || { echo 'Instalador historico: use os artefatos revisados de a7799180d.' >&2; exit 2; }
python3 -m py_compile "$stage/agent.py" "$stage/queue_availability.py"
python3 - "$stage" <<'PY'
import importlib.util,sys
from pathlib import Path
sys.path.insert(0,sys.argv[1])
spec=importlib.util.spec_from_file_location('staged_agent',Path(sys.argv[1])/'agent.py')
agent=importlib.util.module_from_spec(spec);spec.loader.exec_module(agent)
protocol,processor=agent.availability_capability()
assert protocol==2 and callable(processor)
PY
systemctl is-active --quiet asterisk
systemctl is-active --quiet union-pbx-agent
idle() { asterisk -rx 'core show channels count' | grep -q '^0 active channels$' || { echo 'Ha chamada ativa; aplicacao bloqueada.' >&2; return 1; }; }
idle
backup="$(mktemp -d /root/union-pbx-availability-backup-XXXXXXXX)"
cp -a "$agent" "$backup/agent.py"
changed=0
rollback(){
 code=$?;trap - ERR
 if [[ "$changed" == 1 ]]; then
  systemctl stop union-pbx-agent || true
  cp -a "$backup/agent.py" "$agent"
  rm -f -- "$helper"
  systemctl start union-pbx-agent || true
 fi
 echo "Atualizacao revertida; backup em $backup" >&2
 exit "$code"
}
trap rollback ERR
idle
systemctl stop union-pbx-agent
changed=1
install -o root -g root -m 0644 "$stage/queue_availability.py" "$helper"
install -o root -g root -m 0755 "$stage/agent.py" "$agent"
systemctl start union-pbx-agent
systemctl is-active --quiet union-pbx-agent
systemctl is-active --quiet asterisk
trap - ERR
printf 'Agente com disponibilidade preparado. Backup: %s\n' "$backup"
echo 'Verificar heartbeat/protocolo2 e validar pausa/retomada. Nenhuma pausa foi solicitada por este script.'
