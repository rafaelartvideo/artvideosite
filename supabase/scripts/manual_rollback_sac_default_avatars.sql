-- MANUAL ROLLBACK, NEVER RUN AUTOMATICALLY.
-- Restore the 6,687 original SAC placeholder image references from one private
-- original JPEG and per-contact flags (no customer-specific photo overwritten).
-- Recommended maintenance window: updates briefly lock the contacts table.
begin;
set local lock_timeout = '5s';
alter table public.sac_digital_contacts
  disable trigger sac_contact_dedupe_avatar_before_write;

with snapshots as (
  select c.id, s.original_data_uri,
         coalesce(b.original_location,'avatar_url') as original_location
  from public.sac_digital_contacts c
  cross join private.sac_default_avatar_source s
  left join private.sac_default_avatar_rollback b on b.contact_id=c.id
  where c.avatar_url =
    'https://wmjmtcjpunmzvonlkjcu.supabase.co/storage/v1/object/public/public-assets/sac-digital/default-avatar-v1.svg'
), restored as (
  update public.sac_digital_contacts c set
    avatar_url = case when s.original_location='raw_metadata'
      then null else s.original_data_uri end,
    raw_metadata = case when s.original_location='raw_metadata'
      then coalesce(c.raw_metadata,'{}'::jsonb)
           || jsonb_build_object('avatar',s.original_data_uri)
      else c.raw_metadata end
  from snapshots s where c.id=s.id
  returning c.id
)
select count(*) as restored_default_avatars from restored;

-- Restore original duplication-only guard; no new default URL substitutions.
create or replace function private.sac_contact_dedupe_avatar()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.avatar_url is not null
     and new.raw_metadata is not null
     and new.raw_metadata ->> 'avatar' = new.avatar_url then
    new.raw_metadata := new.raw_metadata - 'avatar';
  end if;
  return new;
end;
$$;
alter table public.sac_digital_contacts
  enable trigger sac_contact_dedupe_avatar_before_write;
commit;

-- For full rollback of the previous avatar-metadata cleanup, remove the
-- duplication-only guard only after checking client/API usage, and decide
-- whether it is actually useful to restore redundant base64 copies.
-- Do not drop backup tables before data reconciliation.
