#!/usr/bin/env python3
"""Opt-in, recoverable Asterisk SIP audit. No cloud, calls or external provider.

Pin REVIEWED_BUNDLE_SHA after reviewing the final runtime. Bundle hash: sorted
names, each UTF-8 name + NUL + file bytes + NUL. Preview never imports runtime.
Only a synthetic UUID profile and loopback UDP registration are installed.
"""
import argparse
import base64
from contextlib import redirect_stdout, redirect_stderr
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import secrets
import socket
import stat
import sys
import traceback
import types
import uuid

AUDIT_ROOT = Path('/var/lib/union-pbx-agent/sip-audits')
ASTERISK_ROOT = Path('/etc/asterisk')
MAIN_NAMES = ('pjsip.conf', 'extensions.conf', 'queues.conf')
BUNDLE_NAMES = ('agent.py', 'tenant_profile.py', 'process_lock.py', 'queue_availability.py',
                'local_queue_reload.py', 'call_flows.py', 'flow_runtime.py',
                'sip_trunks.py', 'sip_trunk_runtime.py', 'call_history.py',
                'recordings.py', 'recording_agi.py', 'recording_upload.py', 'recording_runtime.py',
                'inbound_router.py', 'outbound_router.py')
REVIEWED_BUNDLE_SHA = 'e2606166bebe96e4559e5bae0d06ddd4732ae0c79a18dcfd589eae290b0bd1f7'


class AuditError(RuntimeError): pass


def canonical_uuid(value):
    try:
        if not isinstance(value, str) or str(uuid.UUID(value)) != value or uuid.UUID(value).int == 0:
            raise ValueError()
    except (ValueError, AttributeError): raise AuditError('Identidade sintetica invalida.') from None
    return value


def make_plan():
    return {key: str(uuid.uuid4()) for key in ('organization_id', 'agent_id', 'extension_id', 'endpoint_id', 'trunk_id')}


def validate_plan(plan):
    if not isinstance(plan, dict) or set(plan) != {'organization_id', 'agent_id', 'extension_id', 'endpoint_id', 'trunk_id'}:
        raise AuditError('Plano sintetico invalido.')
    for value in plan.values(): canonical_uuid(value)
    if len(set(plan.values())) != 5: raise AuditError('Identidades repetidas.')


def safe_path(path):
    if not path.is_absolute() or any(parent.is_symlink() for parent in (path, *path.parents)):
        raise AuditError('Caminho com symlink ou relativo bloqueado.')


def private_directory(path):
    safe_path(path)
    if path.resolve() != path: raise AuditError('Diretorio canonico exato obrigatorio.')
    info = path.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o700:
        raise AuditError('Diretorio deve ser root 0700.')


def bundle_sources(directory):
    private_directory(directory)
    sources = {}; digest = hashlib.sha256()
    for name in sorted(BUNDLE_NAMES):
        path = directory / name; safe_path(path); info = path.stat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_nlink != 1:
            raise AuditError('Runtime sem propriedade privada verificavel.')
        data = path.read_bytes(); sources[name] = data
        digest.update(name.encode() + b'\0' + data + b'\0')
    if not re.fullmatch(r'[a-f0-9]{64}', REVIEWED_BUNDLE_SHA) or digest.hexdigest() != REVIEWED_BUNDLE_SHA:
        raise AuditError('Bundle nao corresponde ao hash fixo revisado.')
    return sources


def load_runtime(directory):
    # Execute precisely the verified source bytes; no .pyc or added import path.
    sources = bundle_sources(directory)
    order = ('tenant_profile', 'process_lock', 'queue_availability', 'local_queue_reload', 'call_history',
             'call_flows', 'flow_runtime', 'sip_trunks', 'recordings', 'recording_agi',
             'recording_upload', 'recording_runtime', 'sip_trunk_runtime', 'agent', 'inbound_router', 'outbound_router')
    modules = {}
    for name in order:
        module_name = '_sip_audit_agent_' + uuid.uuid4().hex if name == 'agent' else name
        module = types.ModuleType(module_name); module.__file__ = str(directory / (name + '.py'))
        sys.modules[module_name] = module
        source=sources[name + '.py']
        if name=='inbound_router':
            # Its pure route generators must bind to this verified worker,
            # never import an unrelated installed/cached agent module.
            source=source.replace(b'import agent as pbx',b'# verified pbx supplied by loader')
            module.__dict__['pbx']=modules['agent']
        exec(compile(source, module.__file__, 'exec'), module.__dict__)
        modules[name] = module
    worker = modules['agent']; worker.require_root()
    # Fail closed if a future audited implementation accidentally reaches cloud.
    def no_cloud(*args, **kwargs): raise AuditError('Acesso cloud proibido no ensaio.')
    worker.signed_request = no_cloud
    return worker, modules['sip_trunk_runtime'], modules['sip_trunks'], modules['queue_availability']


def save(worker, directory, state):
    worker.write_atomic(directory / 'state.json', worker.json_bytes(state), 0o600)
    # write_atomic fsyncs content; persist its rename and directory entry too.
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)


def loopback_port_unused():
    # No packet is transmitted. Refuse an already listening local SIP service.
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.bind(('127.0.0.1', 59999))
    except OSError: raise AuditError('Porta sintetica loopback ocupada.') from None


def include_after(raw, include, blank=True):
    if include in raw.decode().splitlines(): raise AuditError('Inclusao sintetica ja existente.')
    return raw + (b'' if raw.endswith(b'\n') else b'\n') + (b'\n' if blank else b'') + include.encode() + b'\n'


def authorize_main(worker, directory, state, name, after):
    entry = state['main'][name]; current = (ASTERISK_ROOT / name).read_bytes()
    if hashlib.sha256(current).hexdigest() not in entry['allowed_sha']:
        raise AuditError('Arquivo global mudou fora do ensaio.')
    digest = hashlib.sha256(after).hexdigest()
    if digest not in entry['allowed_sha']: entry['allowed_sha'].append(digest)
    save(worker, directory, state)


def extension_job(plan, enabled=True):
    return dict(id=plan['extension_id'], organization_id=plan['organization_id'], number=301,
                endpoint_name='uw-' + uuid.UUID(plan['endpoint_id']).hex, desired_enabled=enabled,
                updated_at=datetime.now(timezone.utc).isoformat())


def trunk_row(plan, enabled=True, revision=1):
    return dict(id=plan['trunk_id'], organization_id=plan['organization_id'], revision=revision,
                status='pending', enabled=enabled, inbound_enabled=False, host='127.0.0.1', port=59999,
                transport='transport-udp-local', username='audit_' + secrets.token_hex(12),
                password=secrets.token_urlsafe(32), realm='*', allowed_extension_ids=[plan['extension_id']])


def owned_paths(worker, runtime):
    files = [worker.MASTER_FILE, worker.DIALPLAN_MANAGED, worker.QUEUE_FILE, worker.QUEUE_TEST_FILE,
             *runtime.paths(worker)[:3], worker.PRIVATE_KEY, worker.PUBLIC_KEY, worker.AGENT_CONFIG,
             worker.STATE_DIR / 'extensions' / (worker._audit_plan['extension_id'] + '.json')]
    directories = [worker.CONFIG_DIR, worker.STATE_DIR / 'extensions', worker.STATE_DIR]
    return files, directories


def check_owned(worker, runtime):
    files, directories = owned_paths(worker, runtime)
    for path in (*files, *directories): safe_path(path)
    allowed = set(files + directories)
    for directory in directories:
        if directory.exists() and any(path not in allowed for path in directory.iterdir()):
            raise AuditError('Perfil contem arquivos fora do catalogo sintetico; preservar.')


def baseline(worker, availability):
    routes = {route: worker.strip_ansi(worker.asterisk('dialplan show ' + route)) for route in
              ('301@union-internal', '302@union-internal', '850@union-internal', '5579988037605@union-internal')}
    if any('Dial(PJSIP/' not in routes[route] for route in ('301@union-internal', '302@union-internal')) or 'Queue(' not in routes['850@union-internal']:
        raise AuditError('Baseline Union 301/302/850 nao confirmada.')
    registration = worker.asterisk('pjsip show registrations')
    if not any('union-fvx-registration/' in line and re.search(r'\bRegistered\b', line) for line in registration.splitlines()):
        raise AuditError('FVX deve estar registrado antes do ensaio.')
    queues = worker.queue_states(); pauses = {}
    for identity, job in queues.items():
        name = worker.queue_identity(identity); detail = worker.asterisk('queue show ' + name)
        worker.verify_queue_members(job, detail)
        pauses[identity] = {m['endpoint_name']: availability.paused_state(detail, name, m['endpoint_name']) for m in job['members']} if job['enabled'] else {}
    return dict(routes=routes, queues=queues, pauses=pauses)


def verify_baseline(worker, availability, state):
    # Queue validation uses the worker's organization config. The synthetic
    # worker cannot validate Union and its config may already be removed during
    # recovery. Load a separate verified legacy worker without selecting a tenant.
    if getattr(worker, 'PROFILE_ID', None) is not None:
        worker, _, _, availability = load_runtime(Path(worker.__file__).parent)
    for route, expected in state['baseline']['routes'].items():
        if worker.strip_ansi(worker.asterisk('dialplan show ' + route)) != expected:
            raise AuditError('Rota de producao alterada.')
    for identity, job in state['baseline']['queues'].items():
        name = worker.queue_identity(identity); detail = worker.asterisk('queue show ' + name)
        worker.verify_queue_members(job, detail)
        for endpoint, expected in state['baseline']['pauses'][identity].items():
            if availability.paused_state(detail, name, endpoint) != expected:
                raise AuditError('Pausa de producao alterada.')
    worker.assert_fvx('union-fvx-registration/check Registered')


def registration_unregistered(worker, compiler, plan):
    names = compiler.trunk_names(plan['organization_id'], plan['trunk_id'])
    output = worker.strip_ansi(worker.asterisk('pjsip show registrations'))
    rows = [line for line in output.splitlines() if names['registration'] + '/' in line]
    if len(rows) != 1 or re.search(r'\bRegistered\b', rows[0]):
        raise AuditError('Registro sintetico ausente ou inesperadamente registrado.')
    return names


def expire_own_lease(worker, plan):
    # Set the synthetic organization's exact lease to an expired value. Never
    # enumerate/read global variables belonging to production organizations.
    name = 'UW_SIP_LEASE_' + uuid.UUID(canonical_uuid(plan['organization_id'])).hex
    worker.assert_no_calls()
    output = worker.asterisk('dialplan set global ' + name + ' 0')
    if name not in output or not re.search(r"(?:'0'|\"0\"|\b0\b)", output):
        raise AuditError('Expiracao da lease sintetica nao confirmada.')


def verify_live(worker, runtime, compiler, plan):
    state = runtime.verify(worker, plan['organization_id'])
    if len(state['rows']) != 1 or not state['rows'][0]['enabled']:
        raise AuditError('Snapshot habilitado nao confirmado.')
    names = registration_unregistered(worker, compiler, plan)
    route = runtime.paths(worker)[1].read_text()
    endpoint = extension_job(plan)['endpoint_name']
    if route.count('"${CHANNEL(endpoint)}" = "' + endpoint + '"') != 1 or 'union-301' in route:
        raise AuditError('Whitelist nao corresponde ao ramal sintetico.')
    detail = worker.strip_ansi(worker.asterisk('pjsip show endpoint ' + endpoint))
    if not worker.endpoint_matches_profile(detail): raise AuditError('Ramal sintetico fora do perfil.')
    # verify() checks source files, loaded contexts, inbound rejection and binding.
    worker._verify_profile_runtime_locked()
    return names


def restore_locked(worker, runtime, availability, directory, state):
    validate_plan(state['plan'])
    if state.get('cleaned'): return
    worker.assert_no_calls(); check_owned(worker, runtime)
    if set(state['main']) != set(MAIN_NAMES): raise AuditError('Journal global incompleto.')
    # Check ALL globals before modifying ANY; unrelated operator changes block recovery.
    for name in MAIN_NAMES:
        target = ASTERISK_ROOT / name; safe_path(target)
        entry = state['main'][name]
        if hashlib.sha256(target.read_bytes()).hexdigest() not in entry['allowed_sha']:
            raise AuditError('Global fora do journal; limpeza manual necessaria.')
    for name in MAIN_NAMES:
        worker.assert_no_calls(); entry = state['main'][name]; target = ASTERISK_ROOT / name
        before = base64.b64decode(entry['before'], validate=True)
        worker.write_atomic(target, before, entry['mode'], entry['gid']); os.chown(target, entry['uid'], entry['gid'])
        os.utime(target, ns=(entry['atime_ns'], entry['mtime_ns']))
    expire_own_lease(worker, state['plan'])
    files, directories = owned_paths(worker, runtime)
    for path in files:
        worker.assert_no_calls(); path.unlink(missing_ok=True)
    for path in directories:
        if path.exists(): path.rmdir()
    for command in ('module reload res_pjsip.so', 'module reload res_pjsip_outbound_registration.so'):
        if 'reloaded successfully' not in worker.guarded_reload(command).lower():
            raise AuditError('Recarga do modulo SIP nao confirmada na recuperacao.')
    if 'reloaded' not in worker.guarded_reload('dialplan reload').lower():
        raise AuditError('Recarga do dialplan nao confirmada na recuperacao.')
    for name in MAIN_NAMES:
        target = ASTERISK_ROOT / name; entry = state['main'][name]; info = target.stat()
        if target.read_bytes() != base64.b64decode(entry['before'], validate=True) or (stat.S_IMODE(info.st_mode), info.st_uid, info.st_gid) != (entry['mode'], entry['uid'], entry['gid']):
            raise AuditError('Restauracao dos globais nao confirmada.')
    names = sys.modules['sip_trunks'].trunk_names(state['plan']['organization_id'], state['plan']['trunk_id'])
    for endpoint in (names['endpoint'], extension_job(state['plan'])['endpoint_name']):
        detail = worker.strip_ansi(worker.asterisk('pjsip show endpoint ' + endpoint))
        if re.search(r'(?m)^\s*Endpoint:\s+' + re.escape(endpoint) + r'\b', detail):
            raise AuditError('Endpoint sintetico ainda carregado.')
    registrations = worker.asterisk('pjsip show registrations')
    if names['registration'] + '/' in registrations: raise AuditError('Registro sintetico ainda carregado.')
    for context in (worker.DIALPLAN_CONTEXT, worker.QUEUE_TEST_CONTEXT, runtime.paths(worker)[3], names['inbound'], names['outbound']):
        detail = worker.asterisk('dialplan show ' + context)
        if context not in detail or 'no existence' not in detail.lower():
            raise AuditError('Contexto sintetico ainda carregado.')
    verify_baseline(worker, availability, state)
    state['cleaned'] = True; save(worker, directory, state)


def prepare_worker(worker, runtime, plan, directory):
    worker.select_profile(plan['organization_id']); worker._audit_plan = plan
    worker.BACKUP_DIR = directory / 'runtime-backups'
    return worker


def run(runtime_directory):
    worker, runtime, compiler, availability = load_runtime(runtime_directory)
    plan = make_plan(); validate_plan(plan)
    safe_path(AUDIT_ROOT); AUDIT_ROOT.mkdir(parents=True, exist_ok=True, mode=0o700); private_directory(AUDIT_ROOT)
    directory = AUDIT_ROOT / uuid.uuid4().hex; directory.mkdir(mode=0o700)
    fd = os.open(AUDIT_ROOT, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)
    # Read production baseline before selecting synthetic profile.
    with worker.operation_lock():
        worker.assert_no_calls(); loopback_port_unused(); production = baseline(worker, availability)
        prepare_worker(worker, runtime, plan, directory)
        files, directories = owned_paths(worker, runtime)
        if any(path.exists() or path.is_symlink() for path in (*files, *directories)):
            raise AuditError('Destino sintetico ja existe.')
        for path in (*files, *directories): safe_path(path)
        state = dict(version=1, plan=plan, main={}, baseline=production, passed=False, cleaned=False,
                     runtime_sha=REVIEWED_BUNDLE_SHA)
        for name in MAIN_NAMES:
            path = ASTERISK_ROOT / name; safe_path(path); info = path.stat(); raw = path.read_bytes()
            if any('*' in line for line in raw.decode().splitlines() if line.strip().startswith('#include')):
                raise AuditError('Includes globais exigem revisao especifica.')
            state['main'][name] = dict(before=base64.b64encode(raw).decode(), allowed_sha=[hashlib.sha256(raw).hexdigest()],
                                      mode=stat.S_IMODE(info.st_mode), uid=info.st_uid, gid=info.st_gid,
                                      atime_ns=info.st_atime_ns, mtime_ns=info.st_mtime_ns)
        save(worker, directory, state)
    # No detailed runtime output, CLI details, traceback or credentials are logged.
    try:
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            with worker.operation_lock():
                worker.assert_no_calls()
                main = ASTERISK_ROOT / 'pjsip.conf'
                after = include_after(main.read_bytes(), worker.INCLUDE)
                authorize_main(worker, directory, state, 'pjsip.conf', after)
                info = main.stat(); worker.write_atomic(main, after, stat.S_IMODE(info.st_mode), info.st_gid)
                worker.init(); worker.configure(plan['agent_id'], plan['organization_id'])
                for name, include in (('extensions.conf', worker.DIALPLAN_FILE_INCLUDE), ('queues.conf', worker.QUEUE_MAIN_INCLUDE)):
                    authorize_main(worker, directory, state, name, include_after((ASTERISK_ROOT / name).read_bytes(), include))
                worker.install_profile_routes(); worker.apply_job(extension_job(plan), plan['organization_id'])
                # Runtime init has its own lock, so journal its exact possible global bytes here.
                authorize_main(worker, directory, state, 'pjsip.conf', include_after(main.read_bytes(), runtime.pjsip_include(worker), blank=False))
            runtime.init(worker, plan['organization_id'])
            row = trunk_row(plan)
            if runtime.apply_snapshot(worker, [row], plan['organization_id']) != [dict(id=plan['trunk_id'], revision=1, status='applied')]:
                raise AuditError('Aplicacao sintetica nao confirmada.')
            with worker.operation_lock():
                worker.assert_no_calls(); verify_live(worker, runtime, compiler, plan); verify_baseline(worker, availability, state)
            if runtime.apply_snapshot(worker, [{**row, 'enabled': False, 'revision': 2}], plan['organization_id']) != [dict(id=plan['trunk_id'], revision=2, status='applied')]:
                raise AuditError('Desativacao sintetica nao confirmada.')
            with worker.operation_lock():
                worker.assert_no_calls(); runtime.verify(worker, plan['organization_id'])
                sip, route, _, _ = runtime.paths(worker)
                if sip.read_bytes() != b'' or route.read_bytes() != runtime.empty_routes(worker):
                    raise AuditError('Arquivos de saida nao removidos pela desativacao.')
                verify_baseline(worker, availability, state); state['passed'] = True; save(worker, directory, state)
    finally:
        try:
            with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()), worker.operation_lock():
                restore_locked(worker, runtime, availability, directory, state)
        except Exception:
            print('CRITICO: limpeza pendente; audit_id=' + directory.name + '. Executar --apply --acknowledge-sip-audit --runtime-directory DIRETORIO_REVISADO --cleanup ' + directory.name + ' apos liberar chamadas.', file=sys.stderr)
            raise AuditError('Ensaio interrompido com recuperacao pendente.') from None
    print(json.dumps(dict(passed=state['passed'], cleaned=state['cleaned'], audit_id=directory.name,
                         configs_restored=True, lease_expired=True, profiles=1,
                         calls_originated=0, cloud_requests=0, external_providers=0)))


def cleanup(runtime_directory, run_id):
    if not isinstance(run_id, str) or not re.fullmatch(r'[a-f0-9]{32}', run_id):
        raise AuditError('Identificador de recuperacao invalido.')
    private_directory(AUDIT_ROOT); directory = AUDIT_ROOT / run_id; private_directory(directory)
    journal = directory / 'state.json'; safe_path(journal)
    info = journal.stat()
    if info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o600 or not stat.S_ISREG(info.st_mode):
        raise AuditError('Journal sem protecao obrigatoria.')
    state = json.loads(journal.read_bytes())
    if state.get('version') != 1 or state.get('runtime_sha') != REVIEWED_BUNDLE_SHA:
        raise AuditError('Versao ou runtime de recuperacao diferente.')
    validate_plan(state['plan'])
    worker, runtime, _, availability = load_runtime(runtime_directory)
    prepare_worker(worker, runtime, state['plan'], directory)
    with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()), worker.operation_lock():
        restore_locked(worker, runtime, availability, directory, state)
    print(json.dumps(dict(cleaned=True, configs_restored=True, lease_expired=True, audit_id=run_id, calls_originated=0)))


def diagnostic_chain(exc):
    """Bounded locations only: no messages, source, exception repr or locals."""
    result = []; seen = set()
    while exc is not None and id(exc) not in seen and len(result) < 4:
        seen.add(id(exc))
        frames = traceback.extract_tb(exc.__traceback__)[-6:]
        result.append(dict(type=type(exc).__name__, frames=[dict(file=Path(frame.filename).name,
                           line=frame.lineno, function=frame.name) for frame in frames]))
        exc = exc.__context__
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--preview', action='store_true')
    parser.add_argument('--acknowledge-sip-audit', action='store_true')
    parser.add_argument('--runtime-directory', type=Path)
    parser.add_argument('--cleanup')
    parser.add_argument('--diagnostics', action='store_true', help='Tipos e localizacoes de falha, sem mensagens ou dados SIP')
    args = parser.parse_args(argv)
    try:
        if args.preview and args.apply: raise AuditError('Escolha preview ou apply.')
        if not args.apply:
            print(json.dumps(dict(preview=True, profiles=1, host='127.0.0.1', port=59999,
                                 transport='transport-udp-local', calls_originated=0, cloud_requests=0,
                                 changes='temporary fake profile, loopback registration, disable, verified cleanup')))
        elif not args.acknowledge_sip_audit or args.runtime_directory is None:
            raise AuditError('Apply exige acknowledge-sip-audit e runtime-directory revisado.')
        elif args.cleanup: cleanup(args.runtime_directory, args.cleanup)
        else: run(args.runtime_directory)
    except Exception as exc:
        # Untrusted engine exceptions can contain SIP data; never print them.
        print('Auditoria nao concluida: ' + (str(exc) if isinstance(exc, AuditError) else 'falha interna segura.'), file=sys.stderr)
        if args.diagnostics and args.apply and args.acknowledge_sip_audit and args.runtime_directory is not None:
            print(json.dumps(dict(diagnostics=diagnostic_chain(exc))), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__': raise SystemExit(main())
