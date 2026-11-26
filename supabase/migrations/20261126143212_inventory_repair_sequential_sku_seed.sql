begin;
-- Legacy numeric identifiers can be barcodes, not sequential stock SKUs.
-- Seed from the existing short series, then retain the monotonic tenant counter.
create or replace function private.next_inventory_sku_v1(p_org uuid)
returns text language plpgsql set search_path='' as $$
declare v_next numeric; v_code text;
begin
  perform pg_advisory_xact_lock(hashtextextended('inventory-sku:'||p_org::text,0));
  if not exists(select 1 from private.inventory_sku_counters where organization_id=p_org) then
    insert into private.inventory_sku_counters(organization_id,last_value)
    select p_org,coalesce(max(case when btrim(sku) ~ '^[0-9]{1,6}$' then btrim(sku)::numeric end),0)
    from (select sku from public.products where organization_id=p_org
          union all select sku from public.inventory_items where organization_id=p_org) existing
    on conflict (organization_id) do nothing;
  end if;
  loop
    update private.inventory_sku_counters set last_value=last_value+1
    where organization_id=p_org returning last_value into v_next;
    v_code:=v_next::text;
    exit when not exists(select 1 from public.products where organization_id=p_org and ltrim(btrim(sku),'0')=v_code)
      and not exists(select 1 from public.inventory_items where organization_id=p_org and ltrim(btrim(sku),'0')=v_code);
  end loop;
  return v_code;
end $$;
revoke all on function private.next_inventory_sku_v1(uuid) from public,anon,authenticated;

-- One-time repair of polluted counters. Keep all existing identifiers and
-- ordinary counters untouched; never rewrite product or inventory history.
do $$
declare v_org uuid;
begin
  for v_org in select organization_id from private.inventory_sku_counters where last_value>999999 order by organization_id loop
    perform pg_advisory_xact_lock(hashtextextended('inventory-sku:'||v_org::text,0));
    update private.inventory_sku_counters c set last_value=(
      select coalesce(max(case when btrim(sku) ~ '^[0-9]{1,6}$' then btrim(sku)::numeric end),0)
      from (select sku from public.products where organization_id=v_org
            union all select sku from public.inventory_items where organization_id=v_org) existing
    ) where c.organization_id=v_org and c.last_value>999999;
  end loop;
end $$;
commit;
