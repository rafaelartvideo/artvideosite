-- Site público, orçamentos recebidos pela web e loja são EXCLUSIVOS da Artvideo.
-- Preserva pedidos, OS e orçamentos históricos; apenas desliga módulos indevidos.
begin;

-- As ativações antigas de quotes em empresas de teste não representam um site próprio.
update public.organization_modules
   set is_enabled=false, updated_at=now()
 where is_enabled=true
   and organization_id <> public.artvideo_organization_id()
   and (module_key='quotes' or module_key like 'site_%');

-- Amplia o bloqueio preexistente de site_* para também impedir reativar quotes
-- via atualização da coluna is_enabled em qualquer empresa não-Artvideo.
create or replace function private.enforce_artvideo_only_site_modules()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
  if new.is_enabled and (new.module_key='quotes' or new.module_key like 'site_%')
     and new.organization_id <> public.artvideo_organization_id() then
    raise exception 'Site e orçamentos do site são exclusivos da Artvideo.'
      using errcode='42501';
  end if;
  return new;
end; $fn$;

drop trigger if exists enforce_artvideo_only_site_modules on public.organization_modules;
create trigger enforce_artvideo_only_site_modules
before insert or update of organization_id,module_key,is_enabled
on public.organization_modules
for each row execute function private.enforce_artvideo_only_site_modules();

commit;
