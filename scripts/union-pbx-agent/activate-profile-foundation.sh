#!/usr/bin/env bash
# One reviewed update of the legacy worker. No Asterisk reload or tenant activation.
set -euo pipefail
umask 077
[[ "${1:-}" == '--acknowledge-profile-foundation-update' ]] || { echo 'Aprovacao explicita necessaria.' >&2; exit 2; }
[[ "$(id -u)" == 0 ]] || exit 2
stage="$(cd -- "$(dirname -- "$0")" && pwd)"
target=/opt/union-pbx-agent
[[ "$(sha256sum "$target/agent.py" | cut -d' ' -f1)" == dadc633172990625c8e87e7076bf74bd0d8502ab55aafab51bf7bee755869fc1 ]] || { echo 'Agente instalado mudou; reconciliar antes de aplicar.' >&2; exit 2; }
for file in process_lock.py tenant_profile.py; do [[ ! -e "$target/$file" && ! -L "$target/$file" ]] || { echo 'Modulo ja existe; revisar antes de aplicar.' >&2; exit 2; }; done
for file in agent.py process_lock.py tenant_profile.py; do [[ -f "$stage/$file" && ! -L "$stage/$file" ]] || exit 2; done
(cd "$stage" && sha256sum --check --status <<'HASHES'
b807dec29556be122a2c45f9d08e38501611a798f3cb2e85a8513be64d4b93ba  agent.py
8017044b330ec1cd8329f93920eea973cef44f50d55e594ecb9f891f4df00769  process_lock.py
1cb88a19a2ee29e0de0d3908c40b9c4af3de2092e8a5ddab49e311f7a3201335  tenant_profile.py
HASHES
)
python3 - "$stage" "$target" <<'PY'
import importlib.util,sys
from pathlib import Path
sys.path.insert(0,sys.argv[1])
for name in ('queue_availability','call_history'):
    path=Path(sys.argv[2])/(name+'.py')
    assert path.is_file() and not path.is_symlink()
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec)
    sys.modules[name]=module
    spec.loader.exec_module(module)
import agent,process_lock,tenant_profile
assert agent.PROFILE_ID is None
assert agent.availability_capability()[0]==2
assert tenant_profile.profile_paths('00000000-0000-4000-8000-000000000001').context=='uwi-00000000000040008000000000000001'
PY
systemctl is-active --quiet asterisk
systemctl is-active --quiet union-pbx-agent
idle() { asterisk -rx 'core show channels count' | grep -q '^0 active channels$' || { echo 'Ha chamada ativa; aplicacao bloqueada.' >&2; return 1; }; }
idle
backup="$(mktemp -d /root/union-pbx-profile-foundation-backup-XXXXXXXX)"
cp -a "$target/agent.py" "$backup/agent.py"
stopped=0
rollback(){
 code=$?;trap - ERR
 if [[ "$stopped" == 1 ]]; then
  systemctl stop union-pbx-agent || true
  cp -a "$backup/agent.py" "$target/agent.py"
  rm -f -- "$target/process_lock.py" "$target/tenant_profile.py"
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
install -o root -g root -m 0644 "$stage/process_lock.py" "$target/process_lock.py"
install -o root -g root -m 0644 "$stage/tenant_profile.py" "$target/tenant_profile.py"
install -o root -g root -m 0755 "$stage/agent.py" "$target/agent.py"
systemctl start union-pbx-agent
systemctl is-active --quiet union-pbx-agent
systemctl is-active --quiet asterisk
trap - ERR
printf 'Agente legado atualizado. Backup: %s\n' "$backup"
echo 'Verificar heartbeat/protocolo2. Nenhum perfil foi habilitado; nao houve recarga do Asterisk ou alteracao de rotas.'
