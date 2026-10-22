-- Os termos de aceite da plataforma pertencem à Union World.
-- Empresas parceiras continuam com acesso de leitura e aceite;
-- a personalização de certificado de garantia permanece independente.
begin;

create or replace function private.guard_union_organization_terms_write_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Operações administrativas sem sessão de usuário (migrações/seeds) são preservadas.
  -- Todas as gravações autenticadas, incluindo RPC SECURITY DEFINER,
  -- exigem permissão da organização operadora da plataforma.
  if (select auth.uid()) is not null
     and not private.has_platform_permission('terms.manage') then
    raise exception 'Somente a Union World pode editar os termos da plataforma.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_union_organization_terms_write_v1()
  from public, anon, authenticated;

drop trigger if exists guard_union_organization_terms_write
  on public.organization_terms;

create trigger guard_union_organization_terms_write
before insert or update or delete on public.organization_terms
for each row execute function private.guard_union_organization_terms_write_v1();

comment on function private.guard_union_organization_terms_write_v1()
is 'Impede que empresas parceiras alterem termos de aceite, inclusive via RPC; somente gestores autorizados da Union World podem editar.';

commit;
