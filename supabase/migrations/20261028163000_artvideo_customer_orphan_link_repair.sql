-- Reconstroi vinculos de clientes legados que ficaram sem sua entidade CRM.
-- A sincronizacao oficial do CRM cria public.entities e entity_roles via trigger.
-- Restringe aos clientes Artvideo sem identidade conflitante.
do $$
declare v_count integer;
begin
  select count(*) into v_count
  from public.customers c
  where c.organization_id=public.artvideo_organization_id()
    and c.customer_type='PF'
    and nullif(btrim(c.full_name),'') is not null
    and length(regexp_replace(coalesce(c.document,''),'[^0-9]','','g'))=11
    and nullif(c.whatsapp,'') is not null
    and not exists (
      select 1 from public.entities e
      where e.organization_id=c.organization_id and (e.id=c.id or e.legacy_customer_id=c.id)
    )
    and not exists (
      select 1 from public.entities e
      where e.organization_id=c.organization_id
        and regexp_replace(coalesce(e.document,''),'[^0-9]','','g')=regexp_replace(c.document,'[^0-9]','','g')
    );
  if v_count>3 then
    raise exception 'Muitos cadastros sem entidade: requer revisao manual';
  end if;
  update public.customers c
  set updated_at=now()
  where c.organization_id=public.artvideo_organization_id()
    and c.customer_type='PF'
    and nullif(btrim(c.full_name),'') is not null
    and length(regexp_replace(coalesce(c.document,''),'[^0-9]','','g'))=11
    and nullif(c.whatsapp,'') is not null
    and not exists (
      select 1 from public.entities e
      where e.organization_id=c.organization_id and (e.id=c.id or e.legacy_customer_id=c.id)
    )
    and not exists (
      select 1 from public.entities e
      where e.organization_id=c.organization_id
        and regexp_replace(coalesce(e.document,''),'[^0-9]','','g')=regexp_replace(c.document,'[^0-9]','','g')
    );
end $$;