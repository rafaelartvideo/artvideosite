-- Complemento aditivo do fluxo de resolução e documentos da OS.
-- 1) Persiste o texto de peças avulsas no registro da própria OS.
-- 2) Garante que fotos da solução (sort_order >= 1000) também sejam
--    classificadas na situação atual da OS, sem depender de campos legados.

begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:service_order_photos_loose_parts', 0)
);

alter table public.service_orders
  add column if not exists loose_parts text;

comment on column public.service_orders.loose_parts is
  'Peças, materiais ou componentes utilizados na solução que não pertencem ao estoque controlado.';

create or replace function public.link_solution_media_to_order_situation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_situation_id uuid;
  v_organization_id uuid;
  v_uploaded_by uuid;
begin
  if coalesce(new.sort_order, 0) < 1000 then
    return new;
  end if;

  select service_order.situation_id, service_order.organization_id
    into v_situation_id, v_organization_id
  from public.service_orders service_order
  where service_order.id = new.service_order_id;

  if v_situation_id is null or v_organization_id is null then
    return new;
  end if;

  select media.uploaded_by
    into v_uploaded_by
  from public.media media
  where media.id = new.media_id;

  if v_uploaded_by is null then
    return new;
  end if;

  insert into public.service_order_situation_media (
    organization_id,
    service_order_id,
    situation_id,
    media_id,
    uploaded_by
  ) values (
    v_organization_id,
    new.service_order_id,
    v_situation_id,
    new.media_id,
    v_uploaded_by
  )
  on conflict (service_order_id, situation_id, media_id) do nothing;

  return new;
end;
$$;

revoke all on function public.link_solution_media_to_order_situation() from public;

drop trigger if exists trg_link_solution_media_to_order_situation
  on public.service_order_media;
create trigger trg_link_solution_media_to_order_situation
after insert or update of media_id, sort_order
on public.service_order_media
for each row
execute function public.link_solution_media_to_order_situation();

-- Reclassifica fotos de solução antigas que ainda não estejam vinculadas a uma situação.
insert into public.service_order_situation_media (
  organization_id,
  service_order_id,
  situation_id,
  media_id,
  uploaded_by,
  created_at
)
select
  service_order.organization_id,
  link.service_order_id,
  service_order.situation_id,
  link.media_id,
  media.uploaded_by,
  coalesce(link.created_at, now())
from public.service_order_media link
join public.service_orders service_order
  on service_order.id = link.service_order_id
join public.media media
  on media.id = link.media_id
where coalesce(link.sort_order, 0) >= 1000
  and service_order.organization_id is not null
  and service_order.situation_id is not null
  and media.uploaded_by is not null
on conflict (service_order_id, situation_id, media_id) do nothing;

commit;
