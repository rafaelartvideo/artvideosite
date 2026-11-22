"""Pure v2 multi-account compiler, intentionally disconnected from v1 activation.

Reuses the production single-account validation and PJSIP object naming without
weakening v1 admission. A v2 group router must reserve before dialing. This
compiler emits ONLY rejected inbound contexts; it never emits competing _55.
patterns, never attaches an internal context and never reads legacy files.
"""
from dataclasses import dataclass, field

from outbound_capacity import Account, Group, RoutingError, identity
from sip_trunks import FIELDS, TrunkConfigError, compile_trunks, trunk_names


@dataclass(frozen=True, repr=False)
class AccountBundle:
    pjsip: bytes = field(repr=False)
    inbound: bytes = field(repr=False)
    accounts: tuple
    endpoints: tuple

    def __repr__(self):
        return 'AccountBundle(<redacted>)'


def compile_accounts(organization_id, rows, extensions, transports, catalog, *, claimed_identities):
    """Compile a whole own-org snapshot, all-or-nothing, with no side effects.

    rows retain the v1 credential contract. Catalog contains secret-free Account
    objects; logical trunk ID, channel capacity and priority are separate from
    the credential record. claimed_identities is a trusted complete set of
    (lowercase_host, port, lowercase_username) reserved by legacy or other orgs.
    It MUST be sourced through the platform's existing account-claim mechanism;
    a browser cannot assert that an identity is free. No secrets in diagnostics.
    """
    identity(organization_id)
    if not isinstance(rows, list) or not isinstance(catalog, tuple) or not isinstance(claimed_identities, frozenset):
        raise RoutingError('invalid_configuration')
    if len(rows) > 100 or len(rows) != len(catalog): raise RoutingError('invalid_configuration')
    accounts = {}
    for account in catalog:
        if not isinstance(account, Account): raise RoutingError('invalid_configuration')
        account.validate(organization_id)
        if account.id in accounts: raise RoutingError('invalid_configuration')
        accounts[account.id] = account
    seen, identities, pieces, inbound, endpoints = set(), set(), [], [], []
    # Validate/render into private memory only. Any error discards whole bundle.
    for row in sorted(rows, key=lambda item: item.get('id','') if isinstance(item,dict) else ''):
        if not isinstance(row, dict) or set(row) != FIELDS: raise RoutingError('invalid_configuration')
        account = accounts.get(row['id'])
        if account is None or row['id'] in seen or row['enabled'] is not account.enabled:
            raise RoutingError('catalog_divergent')
        seen.add(row['id'])
        if row['enabled'] and (not isinstance(row['allowed_extension_ids'],list) or
                               set(row['allowed_extension_ids']) != set(account.allowed_extensions)):
            raise RoutingError('catalog_divergent')
        try:
            compiled = compile_trunks(organization_id, [row], extensions, transports)
        except TrunkConfigError:
            raise RoutingError('invalid_configuration') from None
        if not row['enabled']: continue
        claim = (row['host'].lower(), row['port'], row['username'].lower())
        if claim in identities or claim in claimed_identities: raise RoutingError('sip_identity_conflict')
        identities.add(claim)
        names = trunk_names(organization_id, row['id'])
        pieces.append(compiled.pjsip)
        inbound.append(('['+names['inbound']+']\nexten => _.,1,Hangup(21)\nexten => s,1,Hangup(21)\n').encode())
        endpoints.append((row['id'], names['endpoint']))
    return AccountBundle(b'\n'.join(pieces), b'\n'.join(inbound), tuple(sorted(catalog,key=lambda a:a.id)), tuple(endpoints))


def validate_groups(organization_id, groups, catalog):
    """Ensure one routing policy for all groups sharing a company/trunk limit."""
    identity(organization_id)
    if not isinstance(groups, tuple) or not 1 <= len(groups) <= 100 or not isinstance(catalog, tuple):
        raise RoutingError('invalid_configuration')
    accounts = {}
    for account in catalog:
        if not isinstance(account, Account): raise RoutingError('invalid_configuration')
        account.validate(organization_id)
        if account.id in accounts: raise RoutingError('invalid_configuration')
        accounts[account.id] = account
    group_ids, trunk_limits, company_limit = set(), {}, None
    for group in groups:
        if not isinstance(group, Group) or group.organization_id != organization_id or group.id in group_ids:
            raise RoutingError('foreign_or_duplicate_group')
        limits = group.validate(); group_ids.add(group.id)
        if any(accounts.get(a.id) != a for a in group.accounts): raise RoutingError('catalog_divergent')
        if company_limit is not None and company_limit != group.organization_channels:
            raise RoutingError('company_limit_divergent')
        company_limit = group.organization_channels
        for trunk, limit in limits.items():
            if trunk in trunk_limits and trunk_limits[trunk] != limit: raise RoutingError('trunk_limit_divergent')
            trunk_limits[trunk] = limit
    return tuple(sorted(groups, key=lambda g:g.id))
