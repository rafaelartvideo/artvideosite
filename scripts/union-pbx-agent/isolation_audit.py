#!/usr/bin/env python3
"""Opt-in two-profile routing audit. No database writes or originated calls."""
import argparse
import base64
from contextlib import redirect_stdout
from datetime import datetime,timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import shlex
import sys
import traceback
import uuid

from tenant_profile import profile_paths

AUDIT_ROOT=Path('/var/lib/union-pbx-agent/isolation-audits')
ASTERISK_ROOT=Path('/etc/asterisk')
INSTALLED_ROOT=Path('/opt/union-pbx-agent')
AGENT_SHA='643e10620fc77a65103e4956b6fba47422f4fed1c8df5c52113f397975a60acd'
MAIN_NAMES=('pjsip.conf','extensions.conf','queues.conf')


class AuditError(RuntimeError):pass


def make_plan():
    return [{**{key:str(uuid.uuid4()) for key in ('organization_id','extension_id','endpoint_id','queue_id')},'label':label}
            for label in ('A','B')]


def validate_plan(plan):
    if not isinstance(plan,list) or len(plan)!=2:raise AuditError('O ensaio exige exatamente dois perfis temporarios.')
    identities=[]
    labels=[]
    for item in plan:
        if not isinstance(item,dict) or set(item)!={'organization_id','extension_id','endpoint_id','queue_id','label'}:
            raise AuditError('Plano de auditoria invalido.')
        labels.append(item['label'])
        for key in ('organization_id','extension_id','endpoint_id','queue_id'):
            value=item[key]
            try:
                if not isinstance(value,str) or str(uuid.UUID(value))!=value:raise ValueError()
            except (ValueError,AttributeError):raise AuditError('Identidade de auditoria invalida.') from None
            identities.append(value)
    if set(labels)!={'A','B'} or len(set(identities))!=8:raise AuditError('Identidades de auditoria repetidas.')


def _agent():
    path=INSTALLED_ROOT/'agent.py'
    if hashlib.sha256(path.read_bytes()).hexdigest()!=AGENT_SHA:
        raise AuditError('A versao instalada mudou; revisar o ensaio antes de executar.')
    sys.path.insert(0,str(INSTALLED_ROOT))
    spec=importlib.util.spec_from_file_location('audited_worker_'+uuid.uuid4().hex,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


def _worker(item):
    worker=_agent();worker.select_profile(item['organization_id'])
    return worker


def _jobs(item):
    now=datetime.now(timezone.utc).isoformat()
    endpoint='uw-'+uuid.UUID(item['endpoint_id']).hex
    extension={'id':item['extension_id'],'organization_id':item['organization_id'],'endpoint_name':endpoint,
               'number':301,'desired_enabled':True,'updated_at':now}
    queue={'id':item['queue_id'],'organization_id':item['organization_id'],'name':'Auditoria '+item['label'],
           'test_extension':850,'strategy':'ringall','ring_seconds':20,'max_wait_seconds':30,'enabled':True,
           'updated_at':now,'members':[{'organization_id':item['organization_id'],'number':301,
           'endpoint_name':endpoint,'position':1,'desired_enabled':True,'provisioning_status':'applied'}]}
    return extension,queue


def _paths(item):
    p=profile_paths(item['organization_id'])
    return p,(p.master_file,p.dialplan_file,p.queue_file,p.queue_routes_file)


def _pause_job(item):
    extension,queue=_jobs(item)
    return {'organization_id':item['organization_id'],'queue_id':queue['id'],'extension_id':extension['id'],
            'revision':str(uuid.uuid4()),'endpoint_name':extension['endpoint_name'],'number':301,'desired_paused':True}


def _save(pbx,directory,state):
    pbx.write_atomic(directory/'state.json',pbx.json_bytes(state))


def _journal_include(pbx,directory,state,name,include):
    """Durably authorize both sides of an atomic write before it happens."""
    raw=(ASTERISK_ROOT/name).read_bytes()
    entry=state['main'][name]
    if hashlib.sha256(raw).hexdigest() not in entry['allowed_sha']:
        raise AuditError('Configuracao alterada fora do ensaio; nao substituir.')
    after=raw if include in raw.decode().splitlines() else raw+(b'' if raw.endswith(b'\n') else b'\n')+b'\n'+include.encode()+b'\n'
    digest=hashlib.sha256(after).hexdigest()
    if digest not in entry['allowed_sha']:entry['allowed_sha'].append(digest)
    _save(pbx,directory,state)
    return after


def _verify_production(pbx,state):
    from queue_availability import paused_state
    for identity,job in state.get('baseline_queues',{}).items():
        name=pbx.queue_identity(identity);detail=pbx.asterisk('queue show '+name)
        pbx.verify_queue_members(job,detail)
        if job['enabled']:
            for member in job['members']:
                expected=state['baseline_pauses'][identity][member['endpoint_name']]
                if paused_state(detail,name,member['endpoint_name'])!=expected:
                    raise AuditError('A pausa de um participante da producao foi alterada.')
    for route,before in state.get('baseline_routes',{}).items():
        if pbx.strip_ansi(pbx.asterisk('dialplan show '+route))!=before:
            raise AuditError('Uma rota interna da producao mudou durante o ensaio.')
    pbx.assert_fvx('union-fvx-registration/check Registered' if state.get('baseline_fvx_registered') else '')


def _assert_owned_state(item):
    p,files=_paths(item)
    if p.config_dir.exists() or p.config_dir.is_symlink():raise AuditError('Um perfil configurado impede a limpeza automatica.')
    for path in (p.state_dir,*files):
        if path.is_symlink():raise AuditError('Symlink inesperado no ensaio; preservar para revisao.')
    for folder,identity in ((p.state_dir/'extensions',item['extension_id']),(p.state_dir/'queues',item['queue_id'])):
        if folder.is_symlink():raise AuditError('Diretorio de estado inesperado.')
        if folder.exists() and any(path.name!=identity+'.json' or path.is_symlink() for path in folder.iterdir()):
            raise AuditError('Estado adicional encontrado; nao apagar dados desconhecidos.')


def _cleanup_locked(pbx,directory,state):
    validate_plan(state['plan'])
    if state.get('cleaned'):return
    if not state.get('started'):
        state['cleaned']=True;_save(pbx,directory,state);return
    pbx.assert_no_calls()
    if set(state['main'])!=set(MAIN_NAMES):raise AuditError('Backup de recuperacao incompleto.')
    for name,snapshot in state['main'].items():
        if name not in MAIN_NAMES:raise AuditError('Arquivo principal fora do escopo.')
        current=(ASTERISK_ROOT/name).read_bytes()
        before=base64.b64decode(snapshot['before'],validate=True)
        if hashlib.sha256(current).hexdigest() not in snapshot['allowed_sha']:
            raise AuditError('Configuracao principal mudou fora do ensaio; recuperacao manual necessaria.')
    for item in reversed(state['plan']):
        _assert_owned_state(item)
        worker=_worker(item);p,files=_paths(item);extension,queue=_jobs(item)
        if p.queue_file.is_file() and p.queue_routes_file.is_file():
            worker.apply_queue_job({**queue,'enabled':False,'members':[]},item['organization_id'])
        if p.master_file.is_file():
            worker.apply_job({**extension,'desired_enabled':False},item['organization_id'])
    for name,snapshot in state['main'].items():
        target=ASTERISK_ROOT/name
        pbx.write_atomic(target,base64.b64decode(snapshot['before'],validate=True),snapshot['mode'],snapshot['gid'])
        os.chown(target,snapshot['uid'],snapshot['gid'])
    for item in state['plan']:
        p,files=_paths(item)
        for path in files:path.unlink(missing_ok=True)
        for folder,identity in ((p.state_dir/'extensions',item['extension_id']),(p.state_dir/'queues',item['queue_id'])):
            (folder/(identity+'.json')).unlink(missing_ok=True)
            if folder.exists():folder.rmdir()
        if p.state_dir.exists():p.state_dir.rmdir()
    if 'reloaded successfully' not in pbx.guarded_reload('module reload res_pjsip.so').lower():
        raise AuditError('Recarga final PJSIP nao confirmada.')
    if 'reloaded' not in pbx.guarded_reload('dialplan reload').lower():
        raise AuditError('Recarga final do dialplan nao confirmada.')
    for name,snapshot in state['main'].items():
        if (ASTERISK_ROOT/name).read_bytes()!=base64.b64decode(snapshot['before'],validate=True):
            raise AuditError('Restauracao de arquivo principal nao confirmada.')
    for item in state['plan']:
        worker=_worker(item);extension,queue=_jobs(item)
        worker.verify_queue_members({**queue,'enabled':False},worker.asterisk('queue show '+worker.queue_identity(queue['id'])))
        detail=worker.asterisk('pjsip show endpoint '+extension['endpoint_name'])
        if re.search(r'(?m)^\s*Endpoint:\s+'+re.escape(extension['endpoint_name'])+r'\b',detail):
            raise AuditError('Endpoint temporario ainda carregado.')
        for context in (worker.DIALPLAN_CONTEXT,worker.QUEUE_TEST_CONTEXT):
            detail=worker.asterisk('dialplan show '+context)
            if context not in detail or 'no existence' not in detail.lower():
                raise AuditError('Ausencia do contexto temporario nao confirmada.')
    _verify_production(pbx,state)
    state['cleaned']=True;_save(pbx,directory,state)


def run():
    pbx=_agent();pbx.require_root()
    with pbx.operation_lock():
        pbx.assert_no_calls()
        plan=make_plan();validate_plan(plan)
        for item in plan:
            p,files=_paths(item)
            if any(path.exists() or path.is_symlink() for path in (p.config_dir,p.state_dir,*files)):
                raise AuditError('Um destino ja existe; nenhuma configuracao sera substituida.')
        AUDIT_ROOT.mkdir(parents=True,exist_ok=True,mode=0o700)
        directory=AUDIT_ROOT/uuid.uuid4().hex;directory.mkdir(mode=0o700)
        state={'version':2,'plan':plan,'main':{},'passed':False,'cleaned':False,'started':False}
        for name in MAIN_NAMES:
            path=ASTERISK_ROOT/name;raw=path.read_bytes();info=path.stat()
            if any('*' in line for line in raw.decode().splitlines() if line.strip().startswith('#include')):
                raise AuditError('Includes globais exigem um plano especifico antes do ensaio.')
            state['main'][name]={'before':base64.b64encode(raw).decode(),'allowed_sha':[hashlib.sha256(raw).hexdigest()],
                                 'mode':info.st_mode&0o777,'gid':info.st_gid,'uid':info.st_uid}
        _save(pbx,directory,state)
        before_fvx=pbx.asterisk('pjsip show registrations')
        baseline=pbx.queue_states()
        from queue_availability import paused_state
        state['baseline_queues']=baseline;state['baseline_pauses']={}
        for identity,job in baseline.items():
            name=pbx.queue_identity(identity);detail=pbx.asterisk('queue show '+name);pbx.verify_queue_members(job,detail)
            state['baseline_pauses'][identity]={m['endpoint_name']:paused_state(detail,name,m['endpoint_name']) for m in job['members']} if job['enabled'] else {}
        state['baseline_routes']={route:pbx.strip_ansi(pbx.asterisk('dialplan show '+route)) for route in
                                  ('301@union-internal','302@union-internal','850@union-internal','5579988037605@union-internal')}
        if not all('Dial(PJSIP/' in state['baseline_routes'][route] for route in ('301@union-internal','302@union-internal')) or 'Queue(' not in state['baseline_routes']['850@union-internal']:
            raise AuditError('Rotas de producao esperadas nao confirmadas antes do ensaio.')
        state['baseline_fvx_registered']=any('union-fvx-registration/' in line and 'Registered' in line for line in before_fvx.splitlines())
        if not state['baseline_fvx_registered']:raise AuditError('A linha FVX deve estar registrada antes do ensaio.')
        state['started']=True;_save(pbx,directory,state)
        pbx.write_atomic(directory/'operations.log',b'')
        try:
            with (directory/'operations.log').open('w') as log,redirect_stdout(log):
                workers=[]
                for item in plan:
                    worker=_worker(item);worker.BACKUP_DIR=directory/'bootstrap-backups'
                    p,_=_paths(item)
                    (p.state_dir/'extensions').mkdir(parents=True,mode=0o700)
                    os.chmod(p.state_dir,0o700)
                    group=worker.grp.getgrnam('asterisk').gr_gid
                    worker.write_atomic(p.master_file,b'; Temporary isolated audit endpoint.\n',0o640,group)
                    path=worker.PJSIP_FILE;raw=path.read_bytes();info=path.stat()
                    after=_journal_include(pbx,directory,state,'pjsip.conf',worker.INCLUDE)
                    worker.write_atomic(path,after,info.st_mode&0o777,info.st_gid)
                    _journal_include(pbx,directory,state,'extensions.conf',worker.DIALPLAN_FILE_INCLUDE)
                    _journal_include(pbx,directory,state,'queues.conf',worker.QUEUE_MAIN_INCLUDE)
                    worker.install_profile_routes()
                    extension,queue=_jobs(item)
                    worker.apply_job(extension,item['organization_id']);worker.apply_queue_job(queue,item['organization_id'])
                    detail=worker.asterisk('pjsip show endpoint '+extension['endpoint_name'])
                    print('\n'.join(line for line in worker.strip_ansi(detail).splitlines()
                                    if re.match(r'^\s*(?:context|set_var|TRANSFER_CONTEXT)\s*:',line)))
                    worker._verify_profile_runtime_locked()
                    if not re.search(r'(?mi)^\s*context\s*:\s*'+re.escape(p.context)+r'\s*$',detail):
                        raise AuditError('Contexto SIP do perfil nao corresponde a empresa temporaria.')
                    if not worker.endpoint_matches_profile(detail):raise AuditError('Contexto de transferencia nao confirmado.')
                    workers.append((worker,item,extension,queue))
                for worker,item,extension,queue in workers:
                    other=next(value for value in workers if value[1]['label']!=item['label'])
                    for number,expected,foreign in ((301,extension['endpoint_name'],other[2]['endpoint_name']),
                                                     (850,worker.queue_identity(queue['id']),worker.queue_identity(other[3]['id']))):
                        detail=worker.asterisk('dialplan show '+str(number)+'@'+worker.DIALPLAN_CONTEXT)
                        if expected not in detail or foreign in detail:raise AuditError('O destino nao permaneceu isolado.')
                a,b=workers
                from queue_availability import apply_job,paused_state
                pause=_pause_job(b[1])
                pbx.assert_no_calls();apply_job(pause,b[1]['organization_id'],b[0].queue_states(),cli=b[0].asterisk)
                a[0].apply_queue_job({**a[3],'strategy':'linear'},a[1]['organization_id'])
                a[0]._verify_profile_runtime_locked();b[0]._verify_profile_runtime_locked()
                if not paused_state(b[0].asterisk('queue show '+b[0].queue_identity(b[3]['id'])),b[0].queue_identity(b[3]['id']),b[2]['endpoint_name']):
                    raise AuditError('A alteracao de uma fila interferiu na pausa da outra.')
                _verify_production(pbx,state);state['passed']=True;_save(pbx,directory,state)
        finally:
            try:
                pbx.write_atomic(directory/'cleanup.log',b'')
                with (directory/'cleanup.log').open('w') as log,redirect_stdout(log):_cleanup_locked(pbx,directory,state)
            except Exception:
                print('CRITICO: limpeza pendente; preservar '+str(directory)+' e executar --apply --acknowledge-isolation-audit --runtime-directory '+shlex.quote(str(INSTALLED_ROOT))+' --cleanup '+directory.name+' apos liberar chamadas.',file=sys.stderr)
                raise
        print(json.dumps({'passed':state['passed'],'cleaned':state['cleaned'],'profiles':2,'extension':301,'queue':850,
                          'calls_originated':0,'audit_id':directory.name}))


def cleanup(run_id):
    if not re.fullmatch(r'[a-f0-9]{32}',run_id):raise AuditError('Identificador de recuperacao invalido.')
    directory=AUDIT_ROOT/run_id
    if directory.is_symlink() or (directory/'state.json').is_symlink():raise AuditError('Recuperacao por symlink bloqueada.')
    pbx=_agent();pbx.require_root()
    with pbx.operation_lock():
        state=json.loads((directory/'state.json').read_text())
        if state.get('version')!=2:raise AuditError('Versao de recuperacao desconhecida.')
        _cleanup_locked(pbx,directory,state)
    print('Limpeza do ensaio confirmada: '+run_id)


def main(argv=None):
    global INSTALLED_ROOT
    parser=argparse.ArgumentParser(description='Ensaio temporario de isolamento de dois perfis, sem chamadas')
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--cleanup')
    parser.add_argument('--acknowledge-isolation-audit',action='store_true')
    parser.add_argument('--runtime-directory',type=Path,help='Pacote revisado para ensaiar antes de instalar o agente')
    args=parser.parse_args(argv)
    try:
        if not args.apply:
            print(json.dumps({'preview':True,'profiles':2,'extension':301,'queue':850,'calls_originated':0,
                              'changes':'temporary namespace configuration and reload, then cleanup; no database writes'}))
        elif not args.acknowledge_isolation_audit:
            raise AuditError('Ensaio bloqueado: aprovacao explicita da janela obrigatoria.')
        else:
            if args.runtime_directory is not None:
                directory=args.runtime_directory
                if not directory.is_absolute() or directory.resolve()!=directory or not directory.is_dir():
                    raise AuditError('Diretorio de runtime absoluto e sem symlinks obrigatorio.')
                info=directory.stat()
                if info.st_uid!=0 or info.st_mode&0o022:raise AuditError('Runtime deve ser privado do operador root.')
                INSTALLED_ROOT=directory
            if args.cleanup:cleanup(args.cleanup)
            else:run()
    except Exception as exc:
        # Function/line locate a failure without printing frames, variables or SIP secrets.
        frame=traceback.extract_tb(exc.__traceback__)[-1]
        detail=str(exc) if isinstance(exc,AuditError) else type(exc).__name__+' em '+frame.name+':'+str(frame.lineno)
        print('Ensaio nao concluido: '+detail,file=sys.stderr);return 1
    return 0


if __name__=='__main__':raise SystemExit(main())
