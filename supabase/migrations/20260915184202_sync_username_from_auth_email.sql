create or replace function private.ensure_profile_username()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_candidate text;
begin
  if new.email is not null and lower(new.email) like '%@auth.artvideo.app' then
    v_base := lower(split_part(new.email, '@', 1));
    if v_base ~ '^[a-z0-9][a-z0-9._-]{2,31}$' then
      new.username := v_base;
      return new;
    end if;
  end if;

  if new.username is not null and btrim(new.username) <> '' then
    new.username := lower(btrim(new.username));
    return new;
  end if;

  v_base := lower(regexp_replace(split_part(coalesce(new.email, ''), '@', 1), '[^a-zA-Z0-9._-]+', '', 'g'));
  if v_base !~ '^[a-z0-9]' or char_length(v_base) < 3 then
    v_base := 'user-' || left(replace(new.id::text, '-', ''), 8);
  else
    v_base := left(v_base, 24);
  end if;

  v_candidate := v_base;
  if exists (select 1 from public.profiles p where p.username = v_candidate and p.id <> new.id) then
    v_candidate := left(v_base, 24) || '-' || left(replace(new.id::text, '-', ''), 6);
  end if;

  new.username := v_candidate;
  return new;
end;
$$;
