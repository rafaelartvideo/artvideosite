begin;

-- Serviços operacionais da Artvideo podem ser publicados no site sem exigir
-- um segundo cadastro manual. Registros de site já existentes continuam válidos.
alter table public.services
  add column if not exists general_service_id uuid
    references public.general_services(id) on delete cascade;

alter table public.services
  add column if not exists show_in_catalog boolean not null default true;

alter table public.services
  add column if not exists public_icon text;

create unique index if not exists services_general_service_unique
  on public.services (general_service_id)
  where general_service_id is not null;

-- Impede que serviços de empresas parceiras sejam vinculados ao site Artvideo.
create or replace function private.validate_service_publication_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.general_service_id is not null and (
    new.organization_id <> public.artvideo_organization_id()
    or not exists (
      select 1 from public.general_services g
      where g.id = new.general_service_id
        and g.organization_id = new.organization_id
    )
  ) then
    raise exception 'Somente os serviços gerais da Artvideo podem ser publicados.'
      using errcode = '23514';
  end if;
  if new.general_service_id is not null then
    select new.is_active and g.is_active
      into new.is_active
    from public.general_services g
    where g.id = new.general_service_id;
  end if;
  return new;
end
$$;

revoke all on function private.validate_service_publication_link() from public, anon, authenticated;

drop trigger if exists validate_service_publication_link on public.services;
create trigger validate_service_publication_link
before insert or update
on public.services for each row
execute function private.validate_service_publication_link();

-- A autorização pública depende tanto da publicação quanto da ativação operacional.
drop policy if exists services_public_artvideo on public.services;
create policy services_public_artvideo on public.services
for select to anon
using (
  organization_id = public.artvideo_organization_id()
  and is_active = true
  and show_in_catalog = true
  -- O gatilho mantém is_active alinhado ao serviço operacional.
);

-- Propaga somente dados operacionais. Textos e imagens da página pública
-- permanecem independentes e não são substituídos ao alterar o preço na OS.
create or replace function private.sync_general_service_public_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id = public.artvideo_organization_id()
    and (new.name is distinct from old.name
      or new.price is distinct from old.price
      or new.price_at_completion is distinct from old.price_at_completion
      or new.is_active is distinct from old.is_active)
  then
    update public.services s
    set title = new.name,
        base_price = case when new.price_at_completion or new.price is null or new.price <= 0 then null else new.price end,
        price_mode = case when new.price_at_completion or new.price is null or new.price <= 0 then 'QUOTE' else 'FIXED' end,
        is_active = new.is_active
    where s.general_service_id = new.id
      and s.organization_id = new.organization_id;
  end if;
  return new;
end
$$;

revoke all on function private.sync_general_service_public_fields() from public, anon, authenticated;

drop trigger if exists sync_general_service_public_fields on public.general_services;
create trigger sync_general_service_public_fields
after update of name, price, price_at_completion, is_active
on public.general_services for each row
execute function private.sync_general_service_public_fields();

-- Associa apenas correspondências inequívocas que já existiam.
-- Isto evita que uma publicação crie um duplicado para o mesmo serviço.
with possible as (
  select s.id as public_id, g.id as general_id,
         count(*) over (partition by s.id) as matches_public,
         count(*) over (partition by g.id) as matches_general
  from public.services s
  join public.general_services g
    on g.organization_id = s.organization_id
   and lower(btrim(g.name)) = lower(btrim(s.title))
  where s.organization_id = public.artvideo_organization_id()
    and s.general_service_id is null
), unique_pairs as (
  select public_id, general_id from possible
  where matches_public = 1 and matches_general = 1
)
update public.services s
set general_service_id = p.general_id
from unique_pairs p
where s.id = p.public_id and s.general_service_id is null;

commit;
