create table if not exists public.username_registry (
  username_hash text primary key,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.username_registry (username_hash, user_id)
select encode(digest(p.username, 'sha256'), 'hex'), p.id
from public.profiles p
on conflict (username_hash) do update
set user_id = excluded.user_id,
    updated_at = now();

create or replace function private.sync_username_registry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.username is not distinct from old.username then
    return new;
  end if;

  delete from public.username_registry where user_id = new.id;
  insert into public.username_registry (username_hash, user_id, updated_at)
  values (encode(extensions.digest(new.username, 'sha256'), 'hex'), new.id, now());
  return new;
end;
$$;

drop trigger if exists sync_username_registry_after_write on public.profiles;
create trigger sync_username_registry_after_write
after insert or update of username on public.profiles
for each row execute function private.sync_username_registry();

alter table public.username_registry enable row level security;

drop policy if exists username_registry_authenticated_select on public.username_registry;
create policy username_registry_authenticated_select
on public.username_registry
for select
to authenticated
using (true);

revoke all on table public.username_registry from anon;
grant select on table public.username_registry to authenticated;
