"""Pure, fail-closed tenant SIP compiler; no I/O, activation or legacy FVX fallback.

Contract: compile_trunks(org_uuid, rows, extensions, transports). UUIDs must be
canonical lowercase strings. Each row has exactly: id, organization_id, enabled
(bool), host (DNS hostname/IPv4), port (integer), transport (existing named PJSIP
transport), username, password, realm (DNS name or '*'), allowed_extension_ids
(nonempty UUID list), inbound_enabled (False). Disabled rows retain this exact
key structure and require valid identity/ownership/boolean headers, but their
body is ignored: stale extension references or missing credentials cannot block
removal. Enabled rows always undergo full body validation before rendering.
extensions is the authoritative, already admitted mapping of extension UUID to
{organization_id, endpoint}; endpoint must match uw-<32 lowercase hex>, taken
from the authoritative admitted catalog, never derived from the extension UUID.
transports
maps existing transport section names to udp/tcp/tls. Caller must verify transport
configuration, TLS certificates, module support and tenant endpoint admission.

Output bytes contain credentials: write with restrictive permissions, never log
or serialize output. The result repr is redacted. Exceptions never echo inputs.
The dialplan outbound context must ONLY be included in this organization's
internal context; it additionally checks CHANNEL(endpoint) against the whitelist.
Exactly one enabled default trunk per organization is supported. Multiple enabled
trunks are rejected; no implicit routing priority or competing patterns exist.
New outbound calls also require an unexpired organization-specific cloud lease;
cached credentials alone cannot sustain new calls after cloud admission stops.

Inbound intentionally unavailable: line is endpoint IDENTIFICATION, not source
authentication. Every generated trunk inbound context rejects all calls. Before
enabling inbound, a separate runtime-reviewed design must require source ACL or
digest authentication AND exact approved DID AND admitted own-tenant destination,
including cross-tenant spoofing tests on the deployed Asterisk version. No OR
IP/header identify rules are generated, nor are any provider IPs invented.

Official references consulted for registration/endpoint/contact_user/line:
https://docs.asterisk.org/Asterisk_20_Documentation/API_Documentation/Module_Configuration/res_pjsip_outbound_registration/
https://www.asterisk.org/the-pjsip-outbound-registration-line-option/
https://docs.asterisk.org/Certified-Asterisk_20.7_Documentation/API_Documentation/Dialplan_Functions/CHANNEL/
"""
from dataclasses import dataclass, field
import re
import uuid


class TrunkConfigError(ValueError):
    """Safe diagnostic: never contains credentials or untrusted field values."""


DDDS = '11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split()
NUMBER_PATTERN = '55('+'|'.join(DDDS)+')([2-5][0-9]{7}|9[0-9]{8})'
FIELDS = frozenset(('id', 'organization_id', 'enabled', 'host', 'port', 'transport',
                    'username', 'password', 'realm', 'allowed_extension_ids', 'inbound_enabled'))


def _fail():
    raise TrunkConfigError('Invalid or unsafe tenant trunk configuration.')


def _uuid(value):
    if not isinstance(value, str): _fail()
    try:
        parsed = uuid.UUID(value)
    except (ValueError, AttributeError):
        _fail()
    if str(parsed) != value or parsed.int == 0: _fail()
    return parsed.hex


def _token(value, pattern, maximum=128):
    if not isinstance(value, str) or not 1 <= len(value) <= maximum or not re.fullmatch(pattern, value):
        _fail()
    return value


def _host(value):
    _token(value, r'[a-zA-Z0-9.-]+', 253)
    if any(not re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?', label)
           for label in value.split('.')): _fail()
    return value


def national_number(value):
    """Only 55 + real Brazilian DDD + ordinary fixed/mobile national number."""
    return isinstance(value, str) and re.fullmatch(NUMBER_PATTERN, value) is not None


def trunk_names(organization_id, trunk_id):
    base = 'uwt-'+_uuid(organization_id)+'-'+_uuid(trunk_id)
    return {kind: base+'-'+suffix for kind, suffix in
            [('endpoint', 'ep'), ('auth', 'auth'), ('aor', 'aor'),
             ('registration', 'reg'), ('contact', 'contact'),
             ('inbound', 'in'), ('outbound', 'out')]}


def lease_name(organization_id):
    return 'UW_SIP_LEASE_'+_uuid(organization_id)


@dataclass(frozen=True)
class CompiledTrunks:
    pjsip: bytes = field(repr=False)
    dialplan: bytes = field(repr=False)

    def __repr__(self):
        return 'CompiledTrunks(<redacted>)'


def compile_trunks(organization_id, rows, extensions, transports):
    """Validate the entire batch before rendering; caller owns atomic installation."""
    _uuid(organization_id)
    if not isinstance(rows, list) or not isinstance(extensions, dict) or not isinstance(transports, dict): _fail()
    for name, protocol in transports.items():
        _token(name, r'[A-Za-z0-9_-]+')
        if protocol not in ('udp', 'tcp', 'tls'): _fail()
    seen, assigned, validated = set(), set(), []
    for row in rows:
        if not isinstance(row, dict) or set(row) != FIELDS: _fail()
        names = trunk_names(organization_id, row['id'])
        if row['organization_id'] != organization_id or row['id'] in seen: _fail()
        seen.add(row['id'])
        if type(row['enabled']) is not bool or row['inbound_enabled'] is not False: _fail()
        if not row['enabled']: continue
        host = _host(row['host'])
        if type(row['port']) is not int or not 1 <= row['port'] <= 65535: _fail()
        transport = _token(row['transport'], r'[A-Za-z0-9_-]+')
        if transport not in transports: _fail()
        _token(row['username'], r'[A-Za-z0-9_.+-]+')
        # Deliberately limited to configuration-safe literal credentials; no
        # interpolation, comment markers, escaping or multiline parser semantics.
        _token(row['password'], r'[A-Za-z0-9_!@%+.,:/?&*(){}~-]+', 256)
        if row['realm'] != '*': _host(row['realm'])
        ids = row['allowed_extension_ids']
        if not isinstance(ids, list) or not ids: _fail()
        endpoints, local_seen = [], set()
        for ext_id in ids:
            _uuid(ext_id)
            if ext_id in local_seen: _fail()
            local_seen.add(ext_id)
            admitted = extensions.get(ext_id)
            if (not isinstance(admitted, dict) or set(admitted) != {'organization_id', 'endpoint'}
                    or admitted['organization_id'] != organization_id
                    or not isinstance(admitted['endpoint'], str)
                    or not re.fullmatch(r'uw-[a-f0-9]{32}', admitted['endpoint'])): _fail()
            endpoints.append(admitted['endpoint'])
        if validated: _fail()
        if assigned.intersection(local_seen): _fail()
        assigned.update(local_seen)
        uri = 'sip:'+host+':'+str(row['port'])+';transport='+transports[transport]
        validated.append((row, names, sorted(endpoints), uri))
    sip, dial = [], []
    for row, names, endpoints, uri in sorted(validated, key=lambda item: item[0]['id']):
        sip.append(
            '['+names['auth']+']\ntype=auth\nauth_type=userpass\nusername='+row['username']+
            '\npassword='+row['password']+'\nrealm='+row['realm']+'\n\n'+
            '['+names['aor']+']\ntype=aor\ncontact='+uri+'\n\n'+
            '['+names['endpoint']+']\ntype=endpoint\ntransport='+row['transport']+
            '\ncontext='+names['inbound']+'\ndisallow=all\nallow=alaw,ulaw\ndirect_media=no'+
            '\nallow_transfer=no\nallow_subscribe=no\naors='+names['aor']+
            '\noutbound_auth='+names['auth']+'\n\n'+
            '['+names['registration']+']\ntype=registration\ntransport='+row['transport']+
            '\noutbound_auth='+names['auth']+'\nserver_uri='+uri+
            '\nclient_uri=sip:'+row['username']+'@'+row['host']+':'+str(row['port'])+
            '\ncontact_user='+names['contact']+'\nline=yes\nendpoint='+names['endpoint']+'\n')
        allowed = ' | '.join('"${CHANNEL(endpoint)}" = "'+endpoint+'"' for endpoint in endpoints)
        lease='${GLOBAL('+lease_name(organization_id)+')}'
        dial.append('['+names['inbound']+']\nexten => _.,1,Hangup(21)\nexten => s,1,Hangup(21)\n\n'+
                    '['+names['outbound']+']\n'+
                    'exten => _55.,1,GotoIf($["'+lease+'" = ""]?denied)\n'+
                    ' same => n,GotoIf($[${REGEX("^[0-9]{1,12}$" '+lease+')} = 0]?denied)\n'+
                    ' same => n,GotoIf($['+lease+' <= ${EPOCH}]?denied)\n'+
                    ' same => n,GotoIf($[${REGEX("^'+NUMBER_PATTERN+'$" ${EXTEN})} = 0]?denied)\n'+
                    ' same => n,GotoIf($['+allowed+']?allowed:denied)\n'+
                    ' same => n(allowed),Dial(PJSIP/${EXTEN}@'+names['endpoint']+',30)\n'+
                    ' same => n,Hangup()\n same => n(denied),Hangup(21)\n')
    return CompiledTrunks('\n'.join(sip).encode(), '\n'.join(dial).encode())
