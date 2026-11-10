#!/usr/bin/env bash
# Reviewed update from the profile foundation. No Asterisk reload or queue action.
set -euo pipefail
umask 077
[[ "${1:-}" == '--acknowledge-isolated-queue-update' ]] || { echo 'Aprovacao explicita necessaria.' >&2; exit 2; }
[[ "$(id -u)" == 0 ]] || exit 2
stage="$(cd -- "$(dirname -- "$0")" && pwd)"
target=/opt/union-pbx-agent
[[ "$(sha256sum "$target/agent.py" | cut -d' ' -f1)" == b807dec29556be122a2c45f9d08e38501611a798f3cb2e85a8513be64d4b93ba ]] || { echo 'Agente instalado mudou; reconciliar antes de aplicar.' >&2; exit 2; }
[[ ! -e "$target/local_queue_reload.py" && ! -L "$target/local_queue_reload.py" ]] || { echo 'Modulo local ja existe; revisar antes de aplicar.' >&2; exit 2; }
[[ -f /etc/union-pbx-agent/local-manager.json && ! -L /etc/union-pbx-agent/local-manager.json ]] || { echo 'Interface local deve estar preparada antes desta atualizacao.' >&2; exit 2; }
for file in agent.py local_queue_reload.py; do [[ -f "$stage/$file" && ! -L "$stage/$file" ]] || exit 2; done
(cd "$stage" && sha256sum --check --status <<'HASHES'
9ae0ea96744c674c10be7a35f38fe8923fd6d1c1b4c317a0775260c53241a422  agent.py
b3328e53e94f1f2c469edae4b76b92c4eab5af5a6c9a826e9b0cf2d37b820b4e  local_queue_reload.py
HASHES
)
(cd "$target" && sha256sum --check --status <<'HASHES'
8017044b330ec1cd8329f93920eea973cef44f50d55e594ecb9f891f4df00769  process_lock.py
1cb88a19a2ee29e0de0d3908c40b9c4af3de2092e8a5ddab49e311f7a3201335  tenant_profile.py
HASHES
)
python3 - "$stage" "$target" <<'PY'
import importlib.util,inspect,sys
from pathlib import Path
sys.path.insert(0,sys.argv[1])
for name in ('queue_availability','call_history'):
    path=Path(sys.argv[2])/(name+'.py')
    assert path.is_file() and not path.is_symlink()
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);sys.modules[name]=module;spec.loader.exec_module(module)
import agent,local_queue_reload
assert agent.PROFILE_ID is None and agent.availability_capability()[0]==2
assert 'before_reload' in inspect.signature(local_queue_reload.reload_queue).parameters
PY
systemctl is-active --quiet asterisk
systemctl is-active --quiet union-pbx-agent
idle() { asterisk -rx 'core show channels count' | grep -q '^0 active channels$' || { echo 'Ha chamada ativa; aplicacao bloqueada.' >&2; return 1; }; }
idle
backup="$(mktemp -d /root/union-pbx-isolated-queues-backup-XXXXXXXX)"
cp -a "$target/agent.py" "$backup/agent.py"
stopped=0
rollback(){
 code=$?;trap - ERR
 if [[ "$stopped" == 1 ]]; then
  systemctl stop union-pbx-agent || true
  cp -a "$backup/agent.py" "$target/agent.py"
  rm -f -- "$target/local_queue_reload.py"
  systemctl start union-pbx-agent || true
 fi
 echo "Atualizacao revertida; backup em $backup" >&2
 exit "$code"
}
trap rollback ERR
idle
stopped=1
systemctl stop union-pbx-agent
idle
install -o root -g root -m 0644 "$stage/local_queue_reload.py" "$target/local_queue_reload.py"
install -o root -g root -m 0755 "$stage/agent.py" "$target/agent.py"
systemctl start union-pbx-agent
systemctl is-active --quiet union-pbx-agent
systemctl is-active --quiet asterisk
trap - ERR
printf 'Agente atualizado para controle isolado. Backup: %s\n' "$backup"
echo 'Conferir heartbeat e autenticacao. Nenhuma fila foi modificada por este instalador.'
