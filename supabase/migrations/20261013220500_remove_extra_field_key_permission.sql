-- A coluna Chave não é exibida no cadastro/listagem de Campos Extras.
-- Remover sua permissão visual, agora obsoleta, sem afetar as demais permissões.
do $$
declare v_previous text:=current_setting('app.union_catalog_automatic',true);
begin
  perform set_config('app.union_catalog_automatic','on',true);
  if exists (
    select 1 from public.user_permission_overrides up
    join public.permissions p on p.id=up.permission_id
    where p.key='equipment.technical_fields.column.key'
  ) then
    raise exception 'Existem personalizações para a antiga coluna Chave. Corrija antes de remover a permissão.';
  end if;
  delete from public.permissions where key='equipment.technical_fields.column.key';
  perform set_config('app.union_catalog_automatic',coalesce(v_previous,''),true);
exception when others then
  perform set_config('app.union_catalog_automatic',coalesce(v_previous,''),true);
  raise;
end $$;
