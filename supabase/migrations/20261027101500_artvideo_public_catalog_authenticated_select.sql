-- Public Artvideo storefront rows must be readable both without and with customer login.
-- Reuse the existing, already-public row predicates; never widen admin CRUD policies.
do $$
declare item record;
begin
  for item in
    select tablename,policyname
    from pg_policies
    where schemaname = 'public'
      and cmd = 'SELECT'
      and roles = array['anon']::name[]
      and (
        policyname like '%_public_artvideo'
        or (tablename = 'media' and policyname = 'media_public_select')
      )
  loop
    execute format('alter policy %I on public.%I to anon, authenticated', item.policyname, item.tablename);
  end loop;
end $$;
