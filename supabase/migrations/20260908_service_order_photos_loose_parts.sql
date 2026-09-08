-- Complemento aditivo do fluxo de resolução e documentos da OS.
-- 1) Persiste o texto de peças avulsas no registro da própria OS.
-- 2) Salva peças avulsas com a permissão específica orders.solve, sem exigir orders.edit.
-- 3) Garante que fotos da solução (sort_order >= 1000) também sejam
--    classificadas na situação atual da OS, sem depender de campos legados.
-- 4) Impede que uma foto da solução seja desvinculada isoladamente da situação.

begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:service_order_photos_loose_parts', 0)
);

alter table public.service_orders
  add column if not exists loose_parts text;

comment on column public.service_orders.loose_parts is
  'Peças, materiais ou componentes utilizados na solução que não pertencem ao estoque controlado.';

-- A alteração de peças avulsas pertence ao ato de resolver a OS.
-- Este trigger impede que alguém com orders.edit, mas sem orders.solve,
-- contorne a permissão específica por UPDATE direto.
create or replace function private.guard_service_order_loose_parts_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.loose_parts is distinct from old.loose_parts then
    perform private.require_service_order_action(
      old.id,
      'orders.solve',
      'Você não possui permissão para alterar as peças avulsas desta OS nesta empresa.'
    );
  end if;

  return new;
end;
$$;

revoke all on function private.guard_service_order_loose_parts_update() from public;

drop trigger if exists service_orders_loose_parts_action_guard
  on public.service_orders;
create trigger service_orders_loose_parts_action_guard
before update of loose_parts
on public.service_orders
for each row
execute function private.guard_service_order_loose_parts_update();

-- RPC dedicada: SECURITY DEFINER contorna a policy genérica de edição,
-- mas exige explicitamente orders.solve na empresa proprietária da OS.
create or replace function public.set_service_order_loose_parts(
  p_service_order_id uuid,
  p_loose_parts text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_solved boolean;
  v_result text;
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  perform private.require_service_order_action(
    p_service_order_id,
    'orders.solve',
    'Você não possui permissão para alterar as peças avulsas desta OS nesta empresa.'
  );

  select service_order.is_solved
    into v_is_solved
  from public.service_orders service_order
  where service_order.id = p_service_order_id
  for update;

  if not found then
    raise exception 'OS não encontrada.' using errcode = 'P0002';
  end if;

  if v_is_solved then
    raise exception 'Esta OS já foi solucionada e as peças avulsas não podem mais ser alteradas.'
      using errcode = '42501';
  end if;

  update public.service_orders
  set
    loose_parts = nullif(trim(coalesce(p_loose_parts, '')), ''),
    updated_at = now()
  where id = p_service_order_id
  returning loose_parts into v_result;

  return v_result;
end;
$$;

revoke all on function public.set_service_order_loose_parts(uuid, text) from public;
grant execute on function public.set_service_order_loose_parts(uuid, text) to authenticated;

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

-- Fotos da solução fazem parte da situação em que foram registradas.
-- O vínculo não pode ser removido isoladamente pelo aplicativo.
create or replace function private.prevent_solution_situation_media_unlink()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return old;
  end if;

  if exists (
    select 1
    from public.service_order_media link
    where link.service_order_id = old.service_order_id
      and link.media_id = old.media_id
      and coalesce(link.sort_order, 0) >= 1000
  ) then
    raise exception 'Fotos da solução fazem parte da situação da OS e não podem ser desvinculadas isoladamente.'
      using errcode = '42501';
  end if;

  return old;
end;
$$;

revoke all on function private.prevent_solution_situation_media_unlink() from public;

drop trigger if exists service_order_situation_media_protect_solution_link
  on public.service_order_situation_media;
create trigger service_order_situation_media_protect_solution_link
before delete
on public.service_order_situation_media
for each row
execute function private.prevent_solution_situation_media_unlink();

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
