begin;

do $$
declare
  v_def text;
  v_old text := 'v_address_id := coalesce(nullif(v_address->>''id'', '''')::uuid, gen_random_uuid());';
  v_new text := $guard$
if nullif(v_address->>'id', '') is not null then
      v_address_id := (v_address->>'id')::uuid;
      if not exists (
        select 1 from public.entity_addresses existing
        where existing.id = v_address_id
          and existing.entity_id = p_registration_id
          and existing.organization_id = p_organization_id
      ) then
        raise exception 'Endereço informado não pertence a este cadastro e empresa.';
      end if;
    else
      v_address_id := gen_random_uuid();
    end if;$guard$;
begin
  select pg_get_functiondef('public.sync_registration_addresses(uuid,uuid,jsonb)'::regprocedure)
    into v_def;

  if position('Endereço informado não pertence a este cadastro e empresa.' in v_def) = 0 then
    if position(v_old in v_def) = 0 then
      raise exception 'Trecho esperado de sync_registration_addresses não foi encontrado.';
    end if;
    v_def := replace(v_def, v_old, v_new);
    execute v_def;
  end if;
end $$;

commit;
