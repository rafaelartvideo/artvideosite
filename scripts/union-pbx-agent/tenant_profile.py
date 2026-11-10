"""Pure tenant namespaces for a shared PBX. No secret, filesystem or SIP access."""
from dataclasses import dataclass
from pathlib import Path
import uuid


class TenantProfileError(ValueError):
    pass


def organization_id(value):
    try:
        if not isinstance(value,str) or str(uuid.UUID(value))!=value:
            raise ValueError()
        return value
    except (ValueError,AttributeError):
        raise TenantProfileError('O perfil exige um UUID canonico de organizacao.') from None


@dataclass(frozen=True)
class TenantPaths:
    organization_id:str
    config_dir:Path
    state_dir:Path
    master_file:Path
    pjsip_include:str
    dialplan_file:Path
    dialplan_include:str
    context:str
    queue_file:Path
    queue_include:str
    queue_routes_file:Path
    queue_routes_include:str
    queue_context:str


def profile_paths(value):
    value=organization_id(value)
    suffix=uuid.UUID(value).hex
    master='uw-'+suffix+'.conf'
    dialplan='uw-internal-'+suffix+'.conf'
    queues='uw-queues-'+suffix+'.conf'
    return TenantPaths(
        organization_id=value,
        config_dir=Path('/etc/union-pbx-agent/tenants')/value,
        state_dir=Path('/var/lib/union-pbx-agent/tenants')/value,
        master_file=Path('/etc/asterisk/pjsip.d')/master,
        pjsip_include='#include "pjsip.d/'+master+'"',
        dialplan_file=Path('/etc/asterisk/extensions.d')/dialplan,
        dialplan_include='#include "extensions.d/'+dialplan+'"',
        context='uwi-'+suffix,
        queue_file=Path('/etc/asterisk/queues.d')/queues,
        queue_include='#include "queues.d/'+queues+'"',
        queue_routes_file=Path('/etc/asterisk/extensions.d')/queues,
        queue_routes_include='#include "extensions.d/'+queues+'"',
        queue_context='uwiq-'+suffix,
    )
