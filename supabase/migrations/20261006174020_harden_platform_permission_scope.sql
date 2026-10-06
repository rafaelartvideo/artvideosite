begin;

create or replace function private.is_platform_only_permission_key(p_key text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select
    (p_key like 'organizations.%' and p_key <> 'organizations.audit.view')
    or p_key like 'integrations.%'
    or p_key like 'audit.%'
    or p_key like 'orders.monitor.%'
    or p_key like 'platform.%';
$$;

revoke all on function private.is_platform_only_permission_key(text) from public;

comment on function private.is_platform_only_permission_key(text)
is 'Permissões globais da Union World. Toda chave platform.* é sempre exclusiva da organização operadora.';

commit;
