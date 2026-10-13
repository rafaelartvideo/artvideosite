-- SAC Digital: single source of truth for contact photos.
-- raw_metadata.avatar can be safely discarded only when exactly equal to
-- avatar_url; contacts whose photo exists solely in metadata are preserved.
create or replace function private.sac_contact_dedupe_avatar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.avatar_url is not null
     and new.raw_metadata is not null
     and new.raw_metadata ->> 'avatar' = new.avatar_url then
    new.raw_metadata := new.raw_metadata - 'avatar';
  end if;
  return new;
end;
$$;

drop trigger if exists sac_contact_dedupe_avatar_before_write
  on public.sac_digital_contacts;
create trigger sac_contact_dedupe_avatar_before_write
before insert or update of avatar_url, raw_metadata
on public.sac_digital_contacts
for each row execute function private.sac_contact_dedupe_avatar();

-- One-off backfill: remove only proven identical duplicates.
-- Keep avatar_url and all other raw_metadata fields unmodified.
update public.sac_digital_contacts
set raw_metadata = raw_metadata - 'avatar'
where avatar_url is not null
  and raw_metadata ->> 'avatar' = avatar_url;
