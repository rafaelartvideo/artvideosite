begin;

do $$
declare
  v_def text;
  v_old text := $old$  if v_customer_id is not null then
    delete from public.customer_addresses ca
    where ca.customer_id = v_customer_id
      and ca.organization_id = p_organization_id
      and exists (
        select 1
        from public.entity_addresses ea
        where ea.entity_id = p_registration_id
          and ea.organization_id = p_organization_id
          and coalesce(ea.legacy_customer_address_id, ea.id) = ca.id
          and not (ea.id = any(v_keep_ids))
      );
  end if;

  delete from public.entity_addresses ea
  where ea.entity_id = p_registration_id
    and ea.organization_id = p_organization_id
    and not (ea.id = any(v_keep_ids));
$old$;
  v_new text := $new$  if v_customer_id is not null then
    with removed_entity_addresses as (
      delete from public.entity_addresses ea
      where ea.entity_id = p_registration_id
        and ea.organization_id = p_organization_id
        and not (ea.id = any(v_keep_ids))
      returning coalesce(ea.legacy_customer_address_id, ea.id) as customer_address_id
    )
    delete from public.customer_addresses ca
    using removed_entity_addresses removed
    where ca.id = removed.customer_address_id
      and ca.customer_id = v_customer_id
      and ca.organization_id = p_organization_id;
  else
    delete from public.entity_addresses ea
    where ea.entity_id = p_registration_id
      and ea.organization_id = p_organization_id
      and not (ea.id = any(v_keep_ids));
  end if;
$new$;
begin
  select pg_get_functiondef('public.sync_registration_addresses(uuid,uuid,jsonb)'::regprocedure)
    into v_def;

  if position('with removed_entity_addresses as' in v_def) > 0 then
    return;
  end if;

  if position(v_old in v_def) = 0 then
    raise exception 'Não foi possível localizar o bloco de exclusão de sync_registration_addresses.';
  end if;

  v_def := replace(v_def, v_old, v_new);
  execute v_def;
end $$;

commit;
