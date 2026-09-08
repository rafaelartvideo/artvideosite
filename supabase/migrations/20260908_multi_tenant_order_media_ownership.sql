-- Fechamento multiempresa das mídias operacionais das Ordens de Serviço.
--
-- A mídia passa a possuir organization_id quando é vinculada a uma OS.
-- O mesmo registro de mídia nunca pode ser reutilizado em OS de empresas
-- diferentes. Arquivos antigos já vinculados são retroativamente associados
-- à empresa proprietária da OS.

begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:multi_tenant_order_media_ownership', 0)
);

alter table public.media
  add column if not exists organization_id uuid
  references public.organizations(id) on delete restrict;

create index if not exists media_organization_bucket_idx
  on public.media (organization_id, bucket_id, created_at desc);

-- Antes do backfill, aborta se um mesmo media_id já estiver vinculado a OS de
-- empresas diferentes. Isso evita escolher silenciosamente um proprietário.
do $$
declare
  v_conflicts integer;
begin
  with media_organizations as (
    select link.media_id, service_order.organization_id
    from public.service_order_media link
    join public.service_orders service_order
      on service_order.id = link.service_order_id
    where service_order.organization_id is not null

    union all

    select link.media_id, service_order.organization_id
    from public.service_order_situation_media link
    join public.service_orders service_order
      on service_order.id = link.service_order_id
    where service_order.organization_id is not null
  ), conflicts as (
    select media_id
    from media_organizations
    group by media_id
    having count(distinct organization_id) > 1
  )
  select count(*) into v_conflicts from conflicts;

  if v_conflicts > 0 then
    raise exception '% mídia(s) estão vinculadas a OS de empresas diferentes. Corrija esses vínculos antes de continuar.', v_conflicts
      using errcode = '23514';
  end if;
end;
$$;

with media_organizations as (
  select link.media_id, service_order.organization_id
  from public.service_order_media link
  join public.service_orders service_order
    on service_order.id = link.service_order_id
  where service_order.organization_id is not null

  union all

  select link.media_id, service_order.organization_id
  from public.service_order_situation_media link
  join public.service_orders service_order
    on service_order.id = link.service_order_id
  where service_order.organization_id is not null
), resolved as (
  select media_id, min(organization_id::text)::uuid as organization_id
  from media_organizations
  group by media_id
)
update public.media media
set organization_id = resolved.organization_id
from resolved
where media.id = resolved.media_id
  and media.organization_id is distinct from resolved.organization_id;

create or replace function private.prevent_media_organization_reassignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.organization_id is not null
     and new.organization_id is distinct from old.organization_id then
    raise exception 'A empresa proprietária da mídia não pode ser alterada.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_media_organization_reassignment() from public;

drop trigger if exists media_prevent_organization_reassignment on public.media;
create trigger media_prevent_organization_reassignment
before update of organization_id on public.media
for each row
execute function private.prevent_media_organization_reassignment();

create or replace function private.ensure_service_order_media_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_organization_id uuid;
  v_media_organization_id uuid;
begin
  select service_order.organization_id
    into v_order_organization_id
  from public.service_orders service_order
  where service_order.id = new.service_order_id;

  if v_order_organization_id is null then
    raise exception 'OS não encontrada ou sem empresa definida.'
      using errcode = '23503';
  end if;

  select media.organization_id
    into v_media_organization_id
  from public.media media
  where media.id = new.media_id
  for update;

  if not found then
    raise exception 'Mídia não encontrada.' using errcode = '23503';
  end if;

  if v_media_organization_id is null then
    update public.media
    set organization_id = v_order_organization_id
    where id = new.media_id
      and organization_id is null;
  elsif v_media_organization_id is distinct from v_order_organization_id then
    raise exception 'Esta mídia pertence a outra empresa e não pode ser vinculada à OS.'
      using errcode = '42501';
  end if;

  new.organization_id := v_order_organization_id;
  return new;
end;
$$;

revoke all on function private.ensure_service_order_media_organization() from public;

-- service_order_media já possui organization_id pelas migrations de filhos.
drop trigger if exists service_order_media_validate_media_organization
  on public.service_order_media;
create trigger service_order_media_validate_media_organization
before insert or update of service_order_id, media_id
on public.service_order_media
for each row
execute function private.ensure_service_order_media_organization();

-- service_order_situation_media também herda organization_id da OS.
drop trigger if exists service_order_situation_media_validate_media_organization
  on public.service_order_situation_media;
create trigger service_order_situation_media_validate_media_organization
before insert or update of service_order_id, media_id
on public.service_order_situation_media
for each row
execute function private.ensure_service_order_media_organization();

comment on column public.media.organization_id is
  'Empresa proprietária da mídia operacional. Para mídias vinculadas a OS, é definida pela empresa da OS e não pode ser transferida.';
comment on function private.ensure_service_order_media_organization() is
  'Associa mídia sem empresa à empresa da OS e bloqueia reutilização de mídia entre empresas diferentes.';

commit;
