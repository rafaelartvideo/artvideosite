begin;

do $$
declare
  v_def text;
  v_start integer;
  v_end integer;
  v_new text := $new$if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if p_registration_id is null then
    if not exists (
      select 1
      from public.my_organization_permissions(p_organization_id) permission
      where permission.permission_key = 'customers.create'
    ) then
      raise exception 'Você não possui permissão para criar cadastros.' using errcode = '42501';
    end if;
  else
    if not exists (
      select 1
      from public.my_organization_permissions(p_organization_id) permission
      where permission.permission_key in ('customers.edit', 'customers.update')
    ) then
      raise exception 'Você não possui permissão para editar cadastros.' using errcode = '42501';
    end if;
  end if;

$new$;
begin
  select pg_get_functiondef('public.save_registration(uuid,uuid,jsonb,text[],jsonb,jsonb)'::regprocedure)
    into v_def;

  if position('private.has_effective_organization_permission' in v_def) = 0 then
    return;
  end if;

  v_start := position('if auth.uid() is null then' in v_def);
  v_end := position('  if v_name =' in v_def);

  if v_start = 0 or v_end = 0 or v_end <= v_start then
    raise exception 'Não foi possível localizar o bloco de autorização de save_registration.';
  end if;

  v_def := substring(v_def from 1 for v_start - 1)
    || v_new
    || substring(v_def from v_end);

  if position('private.has_effective_organization_permission' in v_def) > 0 then
    raise exception 'save_registration ainda contém chamada direta ao schema private.';
  end if;

  execute v_def;
end $$;

revoke all on function public.save_registration(uuid,uuid,jsonb,text[],jsonb,jsonb) from public;
revoke all on function public.save_registration(uuid,uuid,jsonb,text[],jsonb,jsonb) from anon;
grant execute on function public.save_registration(uuid,uuid,jsonb,text[],jsonb,jsonb) to authenticated;

commit;
