begin;

drop policy if exists profiles_delete on public.profiles;
drop policy if exists profiles_create on public.profiles;
drop policy if exists "Managers can update profiles" on public.profiles;
drop policy if exists "Users can update their own basic profile" on public.profiles;
drop policy if exists profiles_update on public.profiles;

revoke insert, update, delete on public.profiles from authenticated;
revoke insert, update, delete on public.profiles from anon;

commit;
