begin;
-- The consent checkbox was removed from the OS editor. Keep the legacy RPC argument
-- to avoid breaking existing clients while removing its authorization gate.
-- Preserve the encryption key, tenant checks, employee permissions and audit logs.
do $guard$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='private' and table_name='service_order_device_unlocks' and column_name='authorized_at'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='private' and table_name='service_order_device_unlocks' and column_name='recorded_at'
  ) then
    alter table private.service_order_device_unlocks rename column authorized_at to recorded_at;
  end if;
end;
$guard$;
create or replace function public.set_service_order_unlock_v1(
  p_order_id uuid, p_type text, p_value text, p_authorized boolean default false
) returns void
language plpgsql security definer set search_path = ''
as $fn$
declare v_org uuid; v_type_name text; v_solved boolean; v_key text;
begin
  if (select auth.uid()) is null then raise exception 'Acesso negado' using errcode='42501'; end if;
  select so.organization_id, et.name, so.is_solved
    into v_org,v_type_name,v_solved
    from public.service_orders so
    left join public.equipment_types et on et.id=so.equipment_type_id and et.organization_id=so.organization_id
    where so.id=p_order_id;
  if v_org is null or not private.has_tenant_module_permission(v_org,'orders','orders.unlock.manage') then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  if v_solved then raise exception 'OS concluida nao permite alterar desbloqueio'; end if;
  if coalesce(v_type_name,'') !~* '(celular|tablet|smartphone|iphone|ipad)' then
    raise exception 'Desbloqueio disponivel apenas para celular ou tablet';
  end if;
  if p_type='none' then
    delete from private.service_order_device_unlocks where service_order_id=p_order_id and organization_id=v_org;
    insert into private.service_order_device_unlock_access_logs(organization_id,service_order_id,user_id,action)
    values(v_org,p_order_id,auth.uid(),'delete');
    return;
  end if;
  if not (
    (p_type='pin' and p_value ~ '^[0-9]{4,12}$') or
    (p_type='password' and char_length(p_value) between 1 and 64) or
    (p_type='pattern' and p_value ~ '^[1-9]{4,9}$' and
       (select count(distinct digit) from regexp_split_to_table(p_value,'') digit) = char_length(p_value))
  ) then raise exception 'Codigo de desbloqueio invalido'; end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name='union_service_order_unlock_key_v1' limit 1;
  if v_key is null then raise exception 'Chave de seguranca indisponivel'; end if;
  insert into private.service_order_device_unlocks(service_order_id,organization_id,unlock_type,encrypted_value,recorded_at,updated_at,updated_by)
  values(p_order_id,v_org,p_type,extensions.pgp_sym_encrypt(p_value,v_key,'cipher-algo=aes256'),now(),now(),auth.uid())
  on conflict(service_order_id) do update set
    unlock_type=excluded.unlock_type,encrypted_value=excluded.encrypted_value,
    recorded_at=excluded.recorded_at,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
  insert into private.service_order_device_unlock_access_logs(organization_id,service_order_id,user_id,action)
  values(v_org,p_order_id,auth.uid(),'set');
end $fn$;
revoke all on function public.set_service_order_unlock_v1(uuid,text,text,boolean) from public,anon;
grant execute on function public.set_service_order_unlock_v1(uuid,text,text,boolean) to authenticated;
comment on column private.service_order_device_unlocks.recorded_at is 'Data do registro da credencial, sem representar comprovante de autorizacao do cliente.';
commit;