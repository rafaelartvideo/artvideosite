#!/usr/bin/env bash
# One-time migration of the audited Union VPS. Run only after owner approval.
# Install from a reviewed staging folder containing agent.py, call_history.py,
# cdr.conf and cdr_custom.conf. Never invokes dialplan/PJSIP reload or voice capture.
set -euo pipefail
umask 027
[[ "${1:-}" == '--acknowledge-history-activation' ]] || { echo 'Aprovacao explicita necessaria.' >&2; exit 2; }
[[ "$(id -u)" == 0 ]] || exit 2
stage="$(cd -- "$(dirname -- "$0")" && pwd)"
agent=/opt/union-pbx-agent/agent.py
helper=/opt/union-pbx-agent/call_history.py
cdr=/etc/asterisk/cdr.conf
custom=/etc/asterisk/cdr_custom.conf
expected=ff23b111e35a46c7089e35578790cd0786efb1bd77cf1abceb74a70b022d08e6
[[ "$(sha256sum "$agent" | cut -d' ' -f1)" == "$expected" ]] || { echo 'Agente mudou; reconciliar antes de aplicar.' >&2; exit 2; }
[[ ! -e "$cdr" && ! -e "$custom" && ! -e "$helper" ]] || { echo 'Configuracao CDR existente; reconciliar antes de aplicar.' >&2; exit 2; }
[[ ! -e /var/log/asterisk/cdr-custom/union-calls.csv ]] || { echo 'Arquivo de historico existente; preservar e revisar.' >&2; exit 2; }
for file in agent.py call_history.py cdr.conf cdr_custom.conf; do [[ -f "$stage/$file" && ! -L "$stage/$file" ]] || exit 2; done
python3 -m py_compile "$stage/agent.py" "$stage/call_history.py"
systemctl is-active --quiet asterisk
systemctl is-active --quiet union-pbx-agent
idle() {
  asterisk -rx 'core show channels count' | grep -q '^0 active channels$' || { echo 'Ha chamada ativa; operacao bloqueada.' >&2; return 1; }
}
idle
backup="$(mktemp -d /root/union-pbx-history-backup-XXXXXXXX)"
cp -a "$agent" "$backup/agent.py"
stopped=0
changed=0
rollback() {
  code=$?
  trap - ERR
  echo "Falha na ativacao. Restaurando configuracao; backup em $backup" >&2
  if [[ "$changed" == 1 ]]; then
    systemctl stop union-pbx-agent || true
    stopped=1
    asterisk -rx 'module unload cdr_custom.so' >/dev/null 2>&1 || true
    cp -a "$backup/agent.py" "$agent"
    rm -f -- "$helper" "$cdr" "$custom"
    asterisk -rx 'module reload cdr' >/dev/null 2>&1 || true
  fi
  if [[ "$stopped" == 1 ]]; then systemctl start union-pbx-agent || true; fi
  # Preserve all newly collected metadata, even on rollback.
  exit "$code"
}
trap rollback ERR
idle
systemctl stop union-pbx-agent
stopped=1
changed=1
install -o root -g root -m 0755 "$stage/agent.py" "$agent"
install -o root -g root -m 0644 "$stage/call_history.py" "$helper"
install -o root -g asterisk -m 0640 "$stage/cdr.conf" "$cdr"
install -o root -g asterisk -m 0640 "$stage/cdr_custom.conf" "$custom"
install -d -o asterisk -g asterisk -m 0750 /var/log/asterisk/cdr-custom
install -o asterisk -g asterisk -m 0640 /dev/null /var/log/asterisk/cdr-custom/union-calls.csv
idle
asterisk -rx 'module reload cdr'
asterisk -rx 'module load cdr_custom.so'
asterisk -rx 'cdr show status' | grep -qi 'custom'
asterisk -rx 'cdr show status' | grep -Eq 'Log unanswered calls: +Yes'
systemctl start union-pbx-agent
stopped=0
systemctl is-active --quiet union-pbx-agent
systemctl is-active --quiet asterisk
trap - ERR
printf 'Historico de metadados ativado. Backup: %s\n' "$backup"
echo 'Validar novas chamadas e ingestao assinada. Nenhuma gravacao de voz foi ativada.'
