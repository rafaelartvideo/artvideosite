-- A verified stock placeholder, never a real customer photo.
-- Known original data URI: MD5 14d84d86f568f2d6762a217923bf48f6, 1742 characters.
-- The shared SVG is public because it contains no personal data.
-- Full source image and rollback inventory are kept in the private schema.
create or replace function private.sac_contact_dedupe_avatar()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_shared_url text := 'https://wmjmtcjpunmzvonlkjcu.supabase.co/storage/v1/object/public/public-assets/sac-digital/default-avatar-v1.svg';
  v_raw_avatar text;
begin
  if new.avatar_url is not null
     and length(new.avatar_url)=1742
     and pg_catalog.md5(new.avatar_url)='14d84d86f568f2d6762a217923bf48f6' then
    new.avatar_url := v_shared_url;
  end if;
  v_raw_avatar := new.raw_metadata ->> 'avatar';
  if v_raw_avatar is not null
     and length(v_raw_avatar)=1742
     and pg_catalog.md5(v_raw_avatar)='14d84d86f568f2d6762a217923bf48f6' then
    if new.avatar_url is null then new.avatar_url := v_shared_url; end if;
    new.raw_metadata := new.raw_metadata - 'avatar';
  end if;
  if new.avatar_url is not null
     and new.raw_metadata is not null
     and new.raw_metadata ->> 'avatar' = new.avatar_url then
    new.raw_metadata := new.raw_metadata - 'avatar';
  end if;
  return new;
end;
$$;
