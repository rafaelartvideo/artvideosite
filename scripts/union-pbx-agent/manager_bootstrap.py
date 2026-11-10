#!/usr/bin/env python3
"""Explicit operator activation of a new, private loopback AMI account only."""
import argparse
import grp
import json
from pathlib import Path
import re
import secrets
import sys
import time

import agent as pbx
import local_queue_reload

MANAGER_FILE=Path('/etc/asterisk/manager.conf')
PRIVATE_CONFIG=local_queue_reload.CONFIG_FILE
BACKUP_DIR=Path('/var/lib/union-pbx-agent/manager-backups')
USERNAME='union-local-queues'


class SetupError(RuntimeError):
    pass


def render_manager(secret):
    if not isinstance(secret,str) or not re.fullmatch(r'[A-Za-z0-9_-]{43,128}',secret):
        raise SetupError('Segredo local fora do formato permitido.')
    return ('; Union: local queue management only. No public/HTTP interface.\n'
            '[general]\nenabled=yes\nwebenabled=no\nport=5038\nbindaddr=127.0.0.1\n'
            'tlsenable=no\ndisplayconnects=no\nallowmultiplelogin=yes\nauthtimeout=5\nauthlimit=5\n'
            '\n['+USERNAME+']\nsecret='+secret+'\ndeny=0.0.0.0/0.0.0.0\n'
            'permit=127.0.0.1/255.255.255.255\nread=none\nwrite=none\nwritetimeout=2000\n')


def verify_settings(enabled):
    settings=pbx.strip_ansi(pbx.asterisk('manager show settings'))
    expected=(('Manager \\(AMI\\)', 'Yes' if enabled else 'No'),
              ('Web Manager \\(AMI/HTTP\\)','No'),('TLS Enable','No'),
              ('TCP Bindaddress',re.escape('127.0.0.1:5038') if enabled else 'Disabled'))
    for label,value in expected:
        if not re.search(r'(?m)^\s*'+label+r':\s*'+value+r'\s*$',settings):
            raise SetupError('A central nao confirmou o estado restrito da interface local.')
    listeners=pbx.command('ss','-Hltn','sport = :5038').decode().splitlines()
    addresses=[]
    for line in listeners:
        fields=line.split()
        if len(fields)<5:raise SetupError('Nao foi possivel validar a porta local.')
        addresses.append(fields[3])
    if addresses!=(['127.0.0.1:5038'] if enabled else []):
        raise SetupError('A porta local nao corresponde ao endereco restrito esperado.')


def activate():
    pbx.require_root()
    with pbx.operation_lock():
        # This installer is deliberately for the audited, absent configuration.
        # It never enables existing accounts or replaces existing credentials.
        for path in (MANAGER_FILE,PRIVATE_CONFIG):
            if path.exists() or path.is_symlink():
                raise SetupError('Configuracao local ja existe; preservar e revisar antes de aplicar.')
        pbx.assert_no_calls()
        verify_settings(False)
        BACKUP_DIR.mkdir(parents=True,exist_ok=True,mode=0o700)
        backup=BACKUP_DIR/(time.strftime('%Y%m%d-%H%M%S')+'-'+secrets.token_hex(6))
        backup.mkdir(mode=0o700)
        pbx.write_atomic(backup/'before.json',pbx.json_bytes({'manager_existed':False,'private_config_existed':False}))
        group=grp.getgrnam('asterisk').gr_gid
        secret=secrets.token_urlsafe(48)
        attempted=False
        try:
            pbx.write_atomic(PRIVATE_CONFIG,pbx.json_bytes({'username':USERNAME,'secret':secret}))
            pbx.write_atomic(MANAGER_FILE,render_manager(secret).encode(),0o640,group)
            pbx.assert_no_calls()
            attempted=True
            pbx.asterisk('manager reload')
            verify_settings(True)
            local_queue_reload.check_ready()
        except Exception:
            if attempted:
                try:
                    # Explicitly disable first: a missing file alone may not reset
                    # the running manager. This only reloads the new AMI interface,
                    # never SIP/dialplan/queues or the Asterisk service.
                    pbx.write_atomic(MANAGER_FILE,b'[general]\nenabled=no\nwebenabled=no\ntlsenable=no\n',0o640,group)
                    pbx.asterisk('manager reload')
                    verify_settings(False)
                except Exception:
                    raise SetupError('CRITICO: reversao da interface local nao confirmada; arquivos privados preservados para recuperacao.') from None
            MANAGER_FILE.unlink(missing_ok=True)
            PRIVATE_CONFIG.unlink(missing_ok=True)
            raise
        print('Interface local autenticada em 127.0.0.1:5038. Backup: '+str(backup))
        print('Asterisk e agente nao reiniciados; filas, rotas, troncos e empresas nao alterados.')


def main(argv=None):
    parser=argparse.ArgumentParser(description='Preparacao controlada da interface local de filas')
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--acknowledge-local-manager-activation',action='store_true')
    args=parser.parse_args(argv)
    try:
        if not args.apply:
            print(json.dumps({'preview':True,'bind':'127.0.0.1:5038','http':False,'read':'none','write':'none',
                              'requires':'explicit approval, absent configuration, no active calls',
                              'changes':'new private credentials and manager configuration only'}))
        elif not args.acknowledge_local_manager_activation:
            raise SetupError('Ativacao bloqueada: aprovacao explicita obrigatoria.')
        else:activate()
    except (SetupError,pbx.AgentError,local_queue_reload.ManagerError) as exc:
        print(str(exc),file=sys.stderr);return 1
    except Exception as exc:
        print('Ativacao local falhou: '+type(exc).__name__,file=sys.stderr);return 1
    return 0


if __name__=='__main__':raise SystemExit(main())
