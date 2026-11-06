-- Corrige save_registration após separar Prestadores de Serviços em módulo exclusivo da Union.
-- O papel service_provider foi removido de entity_roles em 20261103152225.
-- Mesmo assim save_registration continuava inserindo esse papel desativado
-- em todos os cadastros, gerando erro 23514 em clientes comuns.
--
-- Altera somente a função; não amplia papéis aceitos nas empresas parceiras.
-- Idempotente: também pode ser aplicada após hotfix direto no banco.
do $fix_registration_provider_split$
declare
  v_definition text;
  v_old_insert text := $old$
  insert into public.entity_roles(entity_id, role, is_active) values (v_id, 'service_provider', v_has_provider)
    on conflict (entity_id, role) do update set is_active = excluded.is_active, updated_at = timezone('utc', now());$old$;
  v_old_required text := 'if not (v_has_customer or v_has_employee or v_has_supplier or v_has_provider) then';
  v_old_allowed text := $old_roles$where role_input not in ('customer','employee','supplier','service_provider')$old_roles$;
begin
  select pg_get_functiondef('public.save_registration(uuid,uuid,jsonb,text[],jsonb,jsonb)'::regprocedure)
    into v_definition;
  if position(v_old_insert in v_definition) = 0 then
    return;
  end if;
  if position(v_old_required in v_definition) = 0 or position(v_old_allowed in v_definition) = 0 then
    raise exception 'A função save_registration mudou: revise a migração antes de aplicá-la.';
  end if;

  v_definition := replace(v_definition, v_old_insert, '');
  v_definition := replace(
    v_definition, v_old_required,
    'if not (v_has_customer or v_has_employee or v_has_supplier) then'
  );
  v_definition := replace(
    v_definition, v_old_allowed,
    $new_roles$where role_input not in ('customer','employee','supplier')$new_roles$
  );
  execute v_definition;
end
$fix_registration_provider_split$;