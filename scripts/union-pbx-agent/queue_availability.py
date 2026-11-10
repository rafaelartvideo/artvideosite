"""Exact queue-member pause control; no reload, dialplan, SIP secret or global pause."""
import re
import subprocess
import time
import uuid


class AvailabilityError(Exception):
    pass


def canonical_uuid(value):
    try:
        if not isinstance(value, str) or str(uuid.UUID(value)) != value:
            raise ValueError()
        return value
    except (ValueError, AttributeError):
        raise AvailabilityError('Identificador de disponibilidade invalido.') from None


def validate_job(job, organization_id, states):
    if not isinstance(job, dict):
        raise AvailabilityError('Solicitacao de disponibilidade invalida.')
    for key in ('queue_id', 'extension_id', 'revision'):
        canonical_uuid(job.get(key))
    if job.get('organization_id') != organization_id or type(job.get('desired_paused')) is not bool:
        raise AvailabilityError('Solicitacao nao pertence a esta organizacao.')
    endpoint = job.get('endpoint_name')
    number = job.get('number')
    if type(number) is not int or not 100 <= number <= 9999:
        raise AvailabilityError('Ramal invalido.')
    if (not isinstance(endpoint, str) or
            (not re.fullmatch(r'uw-[a-f0-9]{32}', endpoint) and not (endpoint == 'union-301' and number == 301))):
        raise AvailabilityError('Endpoint invalido.')
    state = states.get(job['queue_id'])
    if not isinstance(state, dict) or state.get('organization_id') != organization_id or state.get('enabled') is not True:
        raise AvailabilityError('Fila local indisponivel para esta organizacao.')
    if not any(member.get('endpoint_name') == endpoint and member.get('number') == number
               for member in state.get('members', []) if isinstance(member, dict)):
        raise AvailabilityError('Ramal nao pertence a fila local.')
    return 'uwq-' + uuid.UUID(job['queue_id']).hex


def paused_state(text, queue, endpoint):
    text = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', text)
    if not re.search(r'^' + re.escape(queue) + r' has [0-9]+ calls?\b', text, re.MULTILINE):
        raise AvailabilityError('Fila nao confirmada no Asterisk.')
    lines = [line for line in text.splitlines() if '(PJSIP/' + endpoint + ')' in line]
    if len(lines) != 1:
        raise AvailabilityError('Integrante nao confirmado no Asterisk.')
    return bool(re.search(r'\(paused(?:[:)]|\s)', lines[0], re.IGNORECASE))


def run_cli(command):
    result = subprocess.run(['asterisk', '-rx', command], stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, timeout=2, check=False)
    if result.returncode:
        raise AvailabilityError('Comando nao confirmado pelo Asterisk.')
    return result.stdout


def apply_job(job, organization_id, states, cli=run_cli):
    queue = validate_job(job, organization_id, states)
    endpoint, desired = job['endpoint_name'], job['desired_paused']
    if paused_state(cli('queue show ' + queue), queue, endpoint) == desired:
        return True
    verb = 'pause' if desired else 'unpause'
    cli('queue ' + verb + ' member PJSIP/' + endpoint + ' queue ' + queue + ' reason UnionCRM')
    if paused_state(cli('queue show ' + queue), queue, endpoint) != desired:
        raise AvailabilityError('Estado solicitado nao foi confirmado.')
    return True


def process_jobs(jobs, organization_id, states, cli=run_cli):
    if not isinstance(jobs, list) or len(jobs) > 10:
        raise AvailabilityError('Lote de disponibilidade invalido.')
    for job in jobs:
        if not isinstance(job, dict):
            raise AvailabilityError('Solicitacao invalida.')
        for key in ('queue_id', 'extension_id', 'revision'):
            canonical_uuid(job.get(key))
    started, results = time.monotonic(), []
    for job in jobs:
        if time.monotonic() - started >= 10:
            break  # Remaining rows stay pending and are selected again.
        result = {key: job[key] for key in ('queue_id', 'extension_id', 'revision')}
        try:
            apply_job(job, organization_id, states, cli)
            result.update(status='applied', error=None)
        except Exception:
            result.update(status='failed', error='Nao foi possivel confirmar a disponibilidade do atendente.')
        results.append(result)
    return results
