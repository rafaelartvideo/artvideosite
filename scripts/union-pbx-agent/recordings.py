"""Pure policy validation and isolated recording hooks. Never performs IO."""
import re
import uuid

SCOPES = ('internal', 'inbound', 'outbound')
AGI = '/opt/union-pbx-agent/recording_agi.py'
POLICY_ROOT = '/etc/asterisk/union-recording-policies'
SPOOL_ROOT = '/var/spool/asterisk/union-recordings'


class RecordingError(ValueError):
    pass


def identity(value):
    try:
        if not isinstance(value, str) or str(uuid.UUID(value)) != value or uuid.UUID(value).int == 0:
            raise ValueError()
    except (ValueError, AttributeError):
        raise RecordingError('Identidade de gravacao invalida.') from None
    return value


def context_name(organization_id):
    return 'uwrec-' + uuid.UUID(identity(organization_id)).hex


def lease_name(organization_id):
    return 'UW_REC_LEASE_' + uuid.UUID(identity(organization_id)).hex


def validate_policy(policy, organization_id):
    identity(organization_id)
    if not isinstance(policy, dict) or policy.get('organization_id') != organization_id:
        raise RecordingError('Politica nao pertence a empresa.')
    identity(policy.get('revision'))
    if type(policy.get('enabled')) is not bool or type(policy.get('notice_enabled')) is not bool:
        raise RecordingError('Estado de gravacao invalido.')
    scopes = policy.get('scopes')
    if not isinstance(scopes, list) or any(not isinstance(scope, str) or scope not in SCOPES for scope in scopes) or len(scopes) != len(set(scopes)):
        raise RecordingError('Escopo de gravacao invalido.')
    for name, minimum, maximum in (('retention_days', 1, 90), ('quota_bytes', 67108864, 10737418240),
                                    ('max_duration_seconds', 300, 7200)):
        value = policy.get(name)
        if type(value) is not int or not minimum <= value <= maximum:
            raise RecordingError('Limite de gravacao invalido.')
    if policy['enabled']:
        if not scopes or policy.get('legal_basis') not in ('consent', 'contract', 'legal_obligation', 'legitimate_interest'):
            raise RecordingError('Base legal e escopo obrigatorios.')
        for name in ('purpose', 'information_reference'):
            value = policy.get(name)
            if not isinstance(value, str) or not 3 <= len(value.strip()) <= 1000:
                raise RecordingError('Finalidade e transparencia obrigatorias.')
        if policy['notice_enabled']:
            identity(policy.get('notice_prompt_id'))
    return policy


def recording_name(policy, organization_id, unique_id, scope):
    validate_policy(policy, organization_id)
    if not isinstance(unique_id, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,79}', unique_id) or scope not in SCOPES:
        raise RecordingError('Identidade de chamada invalida.')
    return uuid.UUID(policy['revision']).hex + '/' + unique_id + '-' + scope + '.wav'


def compile_context(policy, organization_id):
    validate_policy(policy, organization_id)
    context = context_name(organization_id)
    lease = '${GLOBAL(' + lease_name(organization_id) + ')}'
    lines = ['; Union private recordings. No shell commands or caller-derived paths.', '[' + context + ']']
    for scope in SCOPES:
        if not policy['enabled'] or scope not in policy['scopes']:
            lines.append('exten => ' + scope + ',1,Return()')
            continue
        lines.extend([
            'exten => ' + scope + ',1,GotoIf($[${REGEX("^[0-9]{1,12}$" ' + lease + ')}!=1]?done)',
            ' same => n,GotoIf($[' + lease + '<=${EPOCH}]?done)',
            ' same => n,AGI(' + AGI + ',start,' + organization_id + ',' + policy['revision'] + ',' + scope + ')',
            ' same => n(done),Return()',
        ])
    for scope in SCOPES:
        lines.append('[' + context + '-notice-' + scope + ']')
        if policy['enabled'] and policy['notice_enabled'] and scope in policy['scopes']:
            lines.extend(['exten => s,1,AGI(' + AGI + ',notice,' + organization_id + ',' + policy['revision'] + ',' + scope + ')',
                          ' same => n,Return()'])
        else:
            lines.append('exten => s,1,Return()')
    return ('\n'.join(lines) + '\n').encode()


def hook(organization_id, scope):
    if scope not in SCOPES:
        raise RecordingError('Escopo invalido.')
    return 'Gosub(' + context_name(organization_id) + ',' + scope + ',1)'


def notice_option(policy, organization_id, scope):
    validate_policy(policy, organization_id)
    if policy['enabled'] and policy['notice_enabled'] and scope in policy['scopes']:
        return 'U(' + context_name(organization_id) + '-notice-' + scope + ')'
    return ''


def decorate_routes(raw, policy, organization_id, scope):
    """Decorate only generated Dial/Queue applications, preserving guard labels.

    Callers select an already verified owned file/context, never arbitrary SIP
    input. Disabled/unselected scopes return byte-identical routing.
    """
    validate_policy(policy, organization_id)
    if scope not in SCOPES:
        raise RecordingError('Escopo invalido.')
    if not policy['enabled'] or scope not in policy['scopes']:
        return raw
    output = []
    for line in raw.decode().splitlines():
        match = re.fullmatch(r'((?:exten => [^,]+,[0-9]+| same => n(?:\([A-Za-z0-9_-]+\))?),)(Dial|Queue)\(([^\r\n]*)\)', line)
        if match is None:
            output.append(line)
            continue
        prefix, application, arguments = match.groups()
        args = arguments.split(',')
        notice = notice_option(policy, organization_id, scope)
        if application == 'Dial':
            if not args[0].startswith('PJSIP/') or len(args) > 3:
                raise RecordingError('Discagem fora do modelo revisado.')
            if notice:
                args += [''] * (3 - len(args))
                if 'U(' in args[2]:
                    raise RecordingError('Aviso de discagem ja configurado.')
                args[2] += notice
        else:
            if len(args) > 7:
                raise RecordingError('Fila fora do modelo revisado.')
            if notice:
                args += [''] * (7 - len(args))
                if args[6]:
                    raise RecordingError('Aviso de fila ja configurado.')
                # Asterisk 22 removed Macro. The member Gosub is argument 7.
                args[6] = context_name(organization_id) + '-notice-' + scope
        output.extend([prefix + hook(organization_id, scope),
                       ' same => n,' + application + '(' + ','.join(args) + ')'])
    return ('\n'.join(output) + '\n').encode()
