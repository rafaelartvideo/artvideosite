-- Retém os nomes reais dos serviços na origem financeira da OS,
-- sem modificar valores, baixas, categorias ou parcelas.
begin;

create or replace function private.finance_capture_order_service_titles_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_service_titles jsonb;
  v_service_names text;
begin
  if new.origin_type <> 'service_order'
    or nullif(new.source_details->>'service_order_id', '') is null then
    return new;
  end if;

  select jsonb_agg(s.title order by s.created_at, s.id),
         string_agg(s.title, ', ' order by s.created_at, s.id)
  into v_service_titles, v_service_names
  from (
    select i.id, i.created_at, btrim(i.title_snapshot) as title
    from public.service_order_items i
    where i.organization_id = new.organization_id
      and i.service_order_id::text = new.source_details->>'service_order_id'
      and i.item_type in ('service', 'custom_service')
      and nullif(btrim(coalesce(i.title_snapshot, '')), '') is not null
  ) s;

  if v_service_titles is not null then
    new.source_details := coalesce(new.source_details, '{}'::jsonb)
      || jsonb_build_object('service_names', v_service_titles, 'general_service_name', v_service_names);
  end if;
  return new;
end;
$function$;

revoke all on function private.finance_capture_order_service_titles_v1() from public, anon, authenticated;

drop trigger if exists finance_capture_order_service_titles_v1 on public.financial_entries;
create trigger finance_capture_order_service_titles_v1
before insert on public.financial_entries
for each row
when (new.origin_type = 'service_order')
execute function private.finance_capture_order_service_titles_v1();

-- Corrige também os lançamentos antigos; apenas o snapshot descritivo é alterado.
with titles as (
  select e.id,
         jsonb_agg(btrim(i.title_snapshot) order by i.created_at, i.id) as names,
         string_agg(btrim(i.title_snapshot), ', ' order by i.created_at, i.id) as joined_names
  from public.financial_entries e
  join public.service_order_items i
    on i.organization_id = e.organization_id
   and i.service_order_id::text = e.source_details->>'service_order_id'
   and i.item_type in ('service', 'custom_service')
   and nullif(btrim(coalesce(i.title_snapshot, '')), '') is not null
  where e.origin_type = 'service_order'
    and (
      e.source_details->>'general_service_name' = 'Produtos e Serviços da OS'
      or not (coalesce(e.source_details, '{}'::jsonb) ? 'service_names')
    )
  group by e.id
)
update public.financial_entries e
set source_details = coalesce(e.source_details, '{}'::jsonb)
  || jsonb_build_object('service_names', titles.names, 'general_service_name', titles.joined_names)
from titles
where e.id = titles.id
  and (
    e.source_details->>'general_service_name' is distinct from titles.joined_names
    or e.source_details->'service_names' is distinct from titles.names
  );

commit;
