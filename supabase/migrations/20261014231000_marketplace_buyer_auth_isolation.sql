
-- Impedir que cadastros públicos do Marketplace recebam perfil interno.
-- O marcador não concede privilégios: apenas impede o bootstrap de funcionário.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  default_role_id uuid;
begin
  if new.raw_user_meta_data ->> 'registration_origin' = 'marketplace_buyer' then
    return new;
  end if;

  select id into default_role_id
  from public.roles
  where name = 'FUNCIONARIO' and is_active = true
  limit 1;

  insert into public.profiles (id, full_name, email, role_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    default_role_id
  );

  return new;
end;
$$;
