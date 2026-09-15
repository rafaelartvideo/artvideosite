alter table public.profiles
  add column if not exists username text;

with source as (
  select
    p.id,
    p.created_at,
    case
      when p.username is not null and btrim(p.username) <> '' then lower(btrim(p.username))
      else lower(regexp_replace(split_part(coalesce(p.email, ''), '@', 1), '[^a-zA-Z0-9._-]+', '', 'g'))
    end as raw_candidate
  from public.profiles p
), normalized as (
  select
    id,
    created_at,
    case
      when raw_candidate ~ '^[a-z0-9]' and char_length(raw_candidate) >= 3
        then left(raw_candidate, 24)
      else 'user-' || left(replace(id::text, '-', ''), 8)
    end as base_candidate
  from source
), ranked as (
  select
    id,
    base_candidate,
    row_number() over (partition by base_candidate order by created_at, id) as candidate_rank
  from normalized
)
update public.profiles p
set username = case
  when r.candidate_rank = 1 then r.base_candidate
  else left(r.base_candidate, 24) || '-' || left(replace(r.id::text, '-', ''), 6)
end
from ranked r
where p.id = r.id
  and (p.username is null or btrim(p.username) = '');

alter table public.profiles
  alter column username set not null;

alter table public.profiles
  drop constraint if exists profiles_username_lowercase_check;
alter table public.profiles
  add constraint profiles_username_lowercase_check
  check (username = lower(username));

alter table public.profiles
  drop constraint if exists profiles_username_format_check;
alter table public.profiles
  add constraint profiles_username_format_check
  check (
    char_length(username) between 3 and 32
    and username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'
  );

create unique index if not exists profiles_username_unique_idx
  on public.profiles (username);

comment on column public.profiles.username is
  'Identificador global de login, normalizado em minúsculas e único entre todas as organizações.';
