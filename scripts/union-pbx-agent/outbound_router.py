#!/usr/bin/env python3
"""Opt-in national FVX dialing for the two existing Union browser extensions."""
import argparse
import json
import os
from pathlib import Path
import re
import sys
import tempfile

CONTEXT='union-fvx-crm-outbound'
INCLUDE='#include "extensions.d/union-fvx-crm-outbound.conf"'
DDDS='11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split()
NUMBER_PATTERN='55('+'|'.join(DDDS)+')([2-5][0-9]{7}|9[0-9]{8})'
ENDPOINTS=('union-301','uw-c7983c3e56cb424fbc8c7bb8ff9ec952')


def route_config():
    allowed=' | '.join('"${CHANNEL(endpoint)}" = "'+name+'"' for name in ENDPOINTS)
    return ('; Union national outbound. No inbound or partner routing.\n['+CONTEXT+']\n'
        'exten => _55.,1,GotoIf($[${REGEX("^'+NUMBER_PATTERN+'$" ${EXTEN})} = 0]?denied)\n'
        ' same => n,GotoIf($['+allowed+']?allowed:denied)\n'
        ' same => n(allowed),Dial(PJSIP/${EXTEN}@union-fvx-out-test,30)\n'
        ' same => n,Hangup()\n'
        ' same => n(denied),Hangup(21)\n').encode()


def browser_config(raw):
    text=raw.decode();sections=list(re.finditer(r'(?m)^\[([^]\r\n]+)\][ \t]*\r?$',text))
    matches=[(index,section) for index,section in enumerate(sections) if section.group(1)=='union-internal']
    if len(matches)!=1:raise ValueError('Contexto Union deve existir exatamente uma vez.')
    index,section=matches[0];end=sections[index+1].start() if index+1<len(sections) else len(text)
    body=text[section.end():end];line='include => '+CONTEXT
    if line in body.splitlines():return raw
    return (text[:end]+('' if text[:end].endswith('\n') else '\n')+line+'\n'+text[end:]).encode()


def write_existing(pbx,path,raw,info):
    pbx.write_atomic(path,raw,info.st_mode&0o777,info.st_gid)
    os.chown(path,info.st_uid,info.st_gid)


def write_files(pbx,snapshots,proposed,target,group):
    pbx.write_atomic(target,proposed[target],0o640,group)
    for path,(_,info) in snapshots.items():write_existing(pbx,path,proposed[path],info)


def restore_files(pbx,snapshots,proposed,target):
    for path,raw in proposed.items():
        allowed=[raw]+([snapshots[path][0]] if path in snapshots else [])
        if path.is_symlink() or (path.exists() and path.read_bytes() not in allowed):
            raise ValueError('Mudanca externa detectada; preservar backup e revisar.')
        if path in snapshots and not path.exists():raise ValueError('Arquivo principal removido fora da operacao.')
    for path,(raw,info) in snapshots.items():write_existing(pbx,path,raw,info)
    target.unlink(missing_ok=True)


def activate():
    sys.path.insert(0,'/opt/union-pbx-agent')
    import agent as pbx
    pbx.require_root()
    root=Path('/etc/asterisk');main=root/'extensions.conf';browser=root/'extensions.d/union-browser.conf'
    target=root/'extensions.d/union-fvx-crm-outbound.conf'
    with pbx.operation_lock():
        pbx.assert_no_calls()
        if target.exists() or target.is_symlink():raise ValueError('Rota ja existe; reconciliar antes de aplicar.')
        for path in (main,browser):
            if not path.is_file() or path.is_symlink():raise ValueError('Arquivo principal inesperado.')
        old_fvx=pbx.asterisk('pjsip show registrations')
        if not any('union-fvx-registration/' in line and 'Registered' in line for line in old_fvx.splitlines()):
            raise ValueError('A linha FVX precisa estar registrada.')
        for endpoint in ENDPOINTS:
            detail=pbx.strip_ansi(pbx.asterisk('pjsip show endpoint '+endpoint))
            if not re.search(r'(?m)^\s*context\s*:\s*union-internal\s*$',detail):
                raise ValueError('Contexto do ramal Union nao confirmado.')
        if 'union-fvx-out-test' not in pbx.asterisk('pjsip show endpoint union-fvx-out-test'):
            raise ValueError('Tronco de saida existente nao encontrado.')
        if 'endpoint' not in pbx.asterisk('core show function CHANNEL'):
            raise ValueError('Identidade autenticada de canal indisponivel.')
        baseline={route:pbx.strip_ansi(pbx.asterisk('dialplan show '+route)) for route in
                  ('301@union-internal','302@union-internal','850@union-internal')}
        snapshots={path:(path.read_bytes(),path.stat()) for path in (main,browser)}
        main_raw=snapshots[main][0]
        if INCLUDE in main_raw.decode().splitlines():raise ValueError('Include de saida ja existe sem arquivo.')
        proposed={main:main_raw+(b'' if main_raw.endswith(b'\n') else b'\n')+b'\n'+INCLUDE.encode()+b'\n',
                  browser:browser_config(snapshots[browser][0]),target:route_config()}
        backup=Path(tempfile.mkdtemp(prefix='union-pbx-crm-outbound-',dir='/root'))
        os.chmod(backup,0o700)
        manifest={}
        for index,(path,(raw,info)) in enumerate(snapshots.items()):
            filename=str(index)+'-'+path.name;pbx.write_atomic(backup/filename,raw)
            manifest[str(path)]={'file':filename,'mode':info.st_mode&0o777,'uid':info.st_uid,'gid':info.st_gid}
        pbx.write_atomic(backup/'manifest.json',pbx.json_bytes(manifest))
        try:
            pbx.assert_no_calls()
            write_files(pbx,snapshots,proposed,target,pbx.grp.getgrnam('asterisk').gr_gid)
            if 'reloaded' not in pbx.guarded_reload('dialplan reload').lower():raise ValueError('Recarga nao confirmada.')
            detail=pbx.asterisk('dialplan show 5579988037605@union-internal')
            if 'Dial(PJSIP/${EXTEN}@union-fvx-out-test,30)' not in detail or 'CHANNEL(endpoint)' not in detail:
                raise ValueError('Rota protegida de saida nao confirmada.')
            for route,before in baseline.items():
                if pbx.strip_ansi(pbx.asterisk('dialplan show '+route))!=before:raise ValueError('Rota interna mudou.')
            pbx.assert_fvx(old_fvx)
        except Exception:
            restore_files(pbx,snapshots,proposed,target)
            pbx.guarded_reload('dialplan reload')
            raise
        print(json.dumps({'outbound':'national fixed/mobile','extensions':[301,302],
                          'calls_originated':0,'backup':str(backup)}))


def main(argv=None):
    parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true')
    parser.add_argument('--acknowledge-national-fvx-outbound',action='store_true');args=parser.parse_args(argv)
    try:
        if not args.apply:print(json.dumps({'preview':True,'extensions':[301,302],'national_only':True,'calls_originated':0}))
        elif not args.acknowledge_national_fvx_outbound:raise ValueError('Aprovacao da saida nacional obrigatoria.')
        else:activate()
    except Exception as exc:
        print('Saida nao ativada: '+(str(exc) if isinstance(exc,ValueError) else type(exc).__name__),file=sys.stderr)
        return 1
    return 0


if __name__=='__main__':raise SystemExit(main())
