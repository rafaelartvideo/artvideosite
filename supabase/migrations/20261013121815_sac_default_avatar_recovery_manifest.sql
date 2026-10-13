-- Rollback inventory for the single verified default SAC avatar.
-- Keep the original JPEG once and only small per-contact restoration flags.
-- Private-only; preserves all custom contact photos.
create table if not exists private.sac_default_avatar_source (
  singleton boolean primary key default true check (singleton),
  original_data_uri text not null,
  captured_at timestamptz not null default now()
);
create table if not exists private.sac_default_avatar_rollback (
  contact_id uuid primary key references public.sac_digital_contacts(id) on delete cascade,
  original_location text not null check (original_location in ('avatar_url','raw_metadata')),
  captured_at timestamptz not null default now()
);
revoke all on private.sac_default_avatar_source from public, anon, authenticated;
revoke all on private.sac_default_avatar_rollback from public, anon, authenticated;

-- Import-time capture; only the repeatedly observed default image is eligible.
with images as (
  select coalesce(nullif(avatar_url,''),raw_metadata->>'avatar') as image
  from public.sac_digital_contacts
), common as (
  select image, count(*) as reuse
  from images
  where image like 'data:image/jpg;base64,%'
  group by image
  order by count(*) desc limit 1
)
insert into private.sac_default_avatar_source(singleton,original_data_uri)
select true,image from common where reuse > 6000
on conflict(singleton) do nothing;

insert into private.sac_default_avatar_rollback(contact_id,original_location)
select c.id,
  case when c.avatar_url is not null then 'avatar_url' else 'raw_metadata' end
from public.sac_digital_contacts c
cross join private.sac_default_avatar_source s
where coalesce(nullif(c.avatar_url,''),c.raw_metadata->>'avatar')=s.original_data_uri
on conflict(contact_id) do nothing;
