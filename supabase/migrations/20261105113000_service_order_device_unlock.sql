begin;

-- O segredo de criptografia fica no Vault; nenhum PIN/padrao e armazenado como campo tecnico.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'union_service_order_unlock_key_v1') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'union_service_order_unlock_key_v1',
      'Chave de criptografia das credenciais temporarias dos aparelhos das OS'
    );
  end if;
end $$;

create table if not exists private.service_order_device_unlocks (
  service_order_id uuid primary key references public.service_orders(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unlock_type text not null check (unlock_type in ('pin','password','pattern')),
  encrypted_value bytea not null,
  authorized_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id) on delete restrict
);
create index if not exists idx_service_order_device_unlocks_org on private.service_order_device_unlocks(organization_id);
alter table private.service_order_device_unlocks enable row level security;
revoke all on private.service_order_device_unlocks from public, anon, authenticated;

create table if not exists private.service_order_device_unlock_access_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('set','reveal','delete')),
  occurred_at timestamptz not null default now()
);
create index if not exists idx_service_order_device_unlock_log_order on private.service_order_device_unlock_access_logs(service_order_id, occurred_at desc);
alter table private.service_order_device_unlock_access_logs enable row level security;
revoke all on private.service_order_device_unlock_access_logs from public, anon, authenticated;

insert into public.permissions (key,label,description,module_name,sort_order)
values
 ('orders.unlock.view','Visualizar desbloqueio do aparelho','Permite consultar PIN, senha ou desenho mediante autorizacao do cliente.','Ordens de Serviço — Desbloqueio',1350),
 ('orders.unlock.manage','Gerenciar desbloqueio do aparelho','Permite registrar, substituir ou apagar o desbloqueio de celulares e tablets.','Ordens de Serviço — Desbloqueio',1351)
on conflict (key) do update set
 label=excluded.label,description=excluded.description,module_name=excluded.module_name,sort_order=excluded.sort_order;

-- Preserva o alcance dos papeis existentes que ja editam OS.
insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id, target.id
from public.role_permissions rp
join public.permissions existing on existing.id=rp.permission_id and existing.key='orders.edit'
join public.permissions target on target.key in ('orders.unlock.view','orders.unlock.manage')
on conflict do nothing;

create or replace function public.get_service_order_unlock_meta_v1(p_order_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_org uuid; v_type text;
begin
  if (select auth.uid()) is null then raise exception 'Acesso negado' using errcode='42501'; end if;
  select organization_id into v_org from public.service_orders where id=p_order_id;
  if v_org is null or not (
    private.has_tenant_module_permission(v_org,'orders','orders.unlock.view')
    or private.has_tenant_module_permission(v_org,'orders','orders.unlock.manage')
  ) then raise exception 'Acesso negado' using errcode='42501'; end if;
  select unlock_type into v_type from private.service_order_device_unlocks where service_order_id=p_order_id and organization_id=v_org;
  return jsonb_build_object('type',v_type,'has_value',v_type is not null);
end $$;
revoke all on function public.get_service_order_unlock_meta_v1(uuid) from public,anon;
grant execute on function public.get_service_order_unlock_meta_v1(uuid) to authenticated;

create or replace function public.set_service_order_unlock_v1(
  p_order_id uuid, p_type text, p_value text, p_authorized boolean default false
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_org uuid; v_type_name text; v_solved boolean; v_key text; v_action text;
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
  if not coalesce(p_authorized,false) then
    raise exception 'Registre a autorizacao do cliente antes de salvar o desbloqueio';
  end if;
  if not (
    (p_type='pin' and p_value ~ '^[0-9]{4,12}$') or
    (p_type='password' and char_length(p_value) between 1 and 64) or
    (p_type='pattern' and p_value ~ '^[1-9]{4,9}$' and
       (select count(distinct digit) from regexp_split_to_table(p_value,'') digit) = char_length(p_value))
  ) then raise exception 'Codigo de desbloqueio invalido'; end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name='union_service_order_unlock_key_v1' limit 1;
  if v_key is null then raise exception 'Chave de seguranca indisponivel'; end if;
  insert into private.service_order_device_unlocks(service_order_id,organization_id,unlock_type,encrypted_value,authorized_at,updated_at,updated_by)
  values(p_order_id,v_org,p_type,extensions.pgp_sym_encrypt(p_value,v_key,'cipher-algo=aes256'),now(),now(),auth.uid())
  on conflict(service_order_id) do update set
    unlock_type=excluded.unlock_type,encrypted_value=excluded.encrypted_value,
    authorized_at=excluded.authorized_at,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
  insert into private.service_order_device_unlock_access_logs(organization_id,service_order_id,user_id,action)
  values(v_org,p_order_id,auth.uid(),'set');
end $$;
revoke all on function public.set_service_order_unlock_v1(uuid,text,text,boolean) from public,anon;
grant execute on function public.set_service_order_unlock_v1(uuid,text,text,boolean) to authenticated;

create or replace function public.reveal_service_order_unlock_v1(p_order_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_org uuid; v_type text; v_cipher bytea; v_key text;
begin
  if (select auth.uid()) is null then raise exception 'Acesso negado' using errcode='42501'; end if;
  select organization_id into v_org from public.service_orders where id=p_order_id;
  if v_org is null or not private.has_tenant_module_permission(v_org,'orders','orders.unlock.view') then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  select unlock_type,encrypted_value into v_type,v_cipher
  from private.service_order_device_unlocks where service_order_id=p_order_id and organization_id=v_org;
  if v_type is null then return jsonb_build_object('type',null,'value',null); end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name='union_service_order_unlock_key_v1' limit 1;
  if v_key is null then raise exception 'Chave de seguranca indisponivel'; end if;
  insert into private.service_order_device_unlock_access_logs(organization_id,service_order_id,user_id,action)
  values(v_org,p_order_id,auth.uid(),'reveal');
  return jsonb_build_object('type',v_type,'value',extensions.pgp_sym_decrypt(v_cipher,v_key));
end $$;
revoke all on function public.reveal_service_order_unlock_v1(uuid) from public,anon;
grant execute on function public.reveal_service_order_unlock_v1(uuid) to authenticated;

commit;