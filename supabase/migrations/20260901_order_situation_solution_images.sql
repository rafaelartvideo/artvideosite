begin;

-- Compatibilidade com o fluxo atual de Resolver OS:
-- imagens de solução continuam sendo gravadas em service_order_media com sort_order >= 1000.
-- Este trigger também as classifica automaticamente na situação em que a resolução foi registrada.
create or replace function public.link_solution_media_to_order_situation()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_situation_id uuid;
begin
  if coalesce(new.sort_order, 0) < 1000 then
    return new;
  end if;

  select so.situation_id
    into v_situation_id
  from public.service_orders so
  where so.id = new.service_order_id;

  if v_situation_id is null then
    return new;
  end if;

  insert into public.service_order_situation_media (
    service_order_id,
    situation_id,
    media_id,
    uploaded_by
  ) values (
    new.service_order_id,
    v_situation_id,
    new.media_id,
    coalesce(auth.uid(), (select so.resolved_by from public.service_orders so where so.id = new.service_order_id))
  )
  on conflict (service_order_id, situation_id, media_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_link_solution_media_to_order_situation on public.service_order_media;
create trigger trg_link_solution_media_to_order_situation
after insert or update of media_id, sort_order on public.service_order_media
for each row
execute function public.link_solution_media_to_order_situation();

-- Migra fotos de solução já existentes para a situação atual da OS quando possível.
insert into public.service_order_situation_media (
  service_order_id,
  situation_id,
  media_id,
  uploaded_by,
  created_at
)
select
  som.service_order_id,
  so.situation_id,
  som.media_id,
  coalesce(so.resolved_by, so.created_by),
  coalesce(som.created_at, now())
from public.service_order_media som
join public.service_orders so on so.id = som.service_order_id
where coalesce(som.sort_order, 0) >= 1000
  and so.situation_id is not null
  and coalesce(so.resolved_by, so.created_by) is not null
on conflict (service_order_id, situation_id, media_id) do nothing;

commit;
