
-- Opções de garantia por tipo de equipamento. Certificados são snapshots imutáveis, um por OS.
create table if not exists public.equipment_warranty_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  equipment_type_id uuid not null references public.equipment_types(id) on delete cascade,
  label text not null check(length(trim(label)) between 2 and 100),
  warranty_days integer not null check(warranty_days between 1 and 3650),
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (organization_id,equipment_type_id,label)
);
create index if not exists equipment_warranty_options_by_equipment
  on public.equipment_warranty_options (organization_id,equipment_type_id,sort_order);

alter table public.equipment_warranty_options enable row level security;
drop policy if exists equipment_warranty_options_read on public.equipment_warranty_options;
create policy equipment_warranty_options_read on public.equipment_warranty_options
  for select to authenticated
  using (private.has_effective_organization_permission(organization_id,'equipment.view')
    or private.has_effective_organization_permission(organization_id,'orders.complete')
    or private.has_effective_organization_permission(organization_id,'orders.details.view'));
revoke all on public.equipment_warranty_options from anon;
grant select on public.equipment_warranty_options to authenticated;

create or replace function public.save_equipment_warranty_options_v1(
  p_organization_id uuid, p_equipment_type_id uuid, p_options jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare v_option jsonb; v_count int; v_label text; v_days int; v_default boolean; v_order int := 0; v_labels text[] := '{}'; 
begin
 if auth.uid() is null then raise exception 'Sessão inválida.' using errcode='42501'; end if;
 if not (private.has_effective_organization_permission(p_organization_id,'equipment.edit')
      or private.has_effective_organization_permission(p_organization_id,'equipment.create'))
 then raise exception 'Sem permissão para configurar a garantia.' using errcode='42501'; end if;
 if not exists(select 1 from public.equipment_types e where e.id=p_equipment_type_id and e.organization_id=p_organization_id)
 then raise exception 'Equipamento inválido.' using errcode='23503'; end if;
 if jsonb_typeof(p_options)<>'array' or jsonb_array_length(p_options)>10
 then raise exception 'Use até 10 opções de garantia.' using errcode='22023'; end if;
 v_count:=jsonb_array_length(p_options);
 if v_count>0 and (select count(*) from jsonb_array_elements(p_options) x where coalesce((x->>'is_default')::boolean,false))<>1
 then raise exception 'Defina uma única opção padrão.' using errcode='22023'; end if;
 -- Valida completamente antes da escrita; todo o catálogo é salvo em uma transação.
 for v_option in select value from jsonb_array_elements(p_options) loop
   v_label:=trim(coalesce(v_option->>'label',''));
   if length(v_label)<2 or length(v_label)>100 then raise exception 'Informe um nome válido para a garantia.' using errcode='22023'; end if;
   if lower(v_label)=any(v_labels) then raise exception 'Não repita nomes de garantia.' using errcode='23505'; end if;
   v_labels:=array_append(v_labels,lower(v_label));
   if (v_option->>'warranty_days') is null or (v_option->>'warranty_days') !~ '^[0-9]{1,4}$'
   then raise exception 'Prazo de garantia inválido.' using errcode='22023'; end if;
   v_days:=(v_option->>'warranty_days')::int;
   if v_days<1 or v_days>3650 then raise exception 'Prazo permitido: 1 a 3650 dias.' using errcode='22023'; end if;
 end loop;
 delete from public.equipment_warranty_options where organization_id=p_organization_id and equipment_type_id=p_equipment_type_id;
 for v_option in select value from jsonb_array_elements(p_options) loop
   insert into public.equipment_warranty_options(organization_id,equipment_type_id,label,warranty_days,is_default,sort_order)
   values(p_organization_id,p_equipment_type_id,trim(v_option->>'label'),(v_option->>'warranty_days')::int,
     coalesce((v_option->>'is_default')::boolean,false),v_order);
   v_order:=v_order+1;
 end loop;
end $$;
revoke all on function public.save_equipment_warranty_options_v1(uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_equipment_warranty_options_v1(uuid,uuid,jsonb) to authenticated;

create table if not exists public.service_order_warranty_certificates (
  id uuid primary key default gen_random_uuid(),
  certificate_number bigint generated always as identity unique,
  organization_id uuid not null references public.organizations(id),
  service_order_id uuid not null references public.service_orders(id),
  equipment_type_id uuid references public.equipment_types(id) on delete set null,
  warranty_option_label text not null,
  warranty_days integer not null check(warranty_days between 1 and 3650),
  starts_at date not null,
  expires_at date not null,
  issued_at timestamptz not null default now(),
  issued_by uuid references public.profiles(id),
  snapshot jsonb not null,
  unique (organization_id,service_order_id)
);
create index if not exists warranty_certificates_by_order
  on public.service_order_warranty_certificates (organization_id,service_order_id);
alter table public.service_order_warranty_certificates enable row level security;
drop policy if exists warranty_certificates_read on public.service_order_warranty_certificates;
create policy warranty_certificates_read on public.service_order_warranty_certificates
  for select to authenticated using (
    private.has_effective_organization_permission(organization_id,'orders.details.view')
    or private.has_effective_organization_permission(organization_id,'documents.print')
    or private.has_effective_organization_permission(organization_id,'orders.complete'));
revoke all on public.service_order_warranty_certificates from anon;
grant select on public.service_order_warranty_certificates to authenticated;

create or replace function public.issue_service_order_warranty_v1(
  p_organization_id uuid, p_service_order_id uuid, p_warranty_option_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_os public.service_orders%rowtype;
  v_option public.equipment_warranty_options%rowtype;
  v_label text;
  v_days int;
  v_begin date;
  v_customer jsonb;
  v_brand text;
  v_model text;
  v_equipment text;
  v_service text;
  v_org text;
  v_record public.service_order_warranty_certificates%rowtype;
begin
 if auth.uid() is null or not private.has_effective_organization_permission(p_organization_id,'orders.complete')
 then raise exception 'Sem permissão para emitir certificado.' using errcode='42501'; end if;
 select * into v_record from public.service_order_warranty_certificates
 where organization_id=p_organization_id and service_order_id=p_service_order_id;
 if found then return to_jsonb(v_record); end if;
 select * into v_os from public.service_orders
 where id=p_service_order_id and organization_id=p_organization_id for update;
 if not found or v_os.completed_at is null or v_os.cancelled_at is not null
 then raise exception 'O certificado só pode ser emitido após concluir a OS.' using errcode='22023'; end if;
 if p_warranty_option_id is not null then
   select * into v_option from public.equipment_warranty_options w
   where w.id=p_warranty_option_id and w.organization_id=p_organization_id
     and w.equipment_type_id=v_os.equipment_type_id;
   if not found then raise exception 'Garantia não corresponde ao equipamento desta OS.' using errcode='22023'; end if;
 else
   select * into v_option from public.equipment_warranty_options w
   where w.organization_id=p_organization_id and w.equipment_type_id=v_os.equipment_type_id
   order by w.is_default desc,w.sort_order asc limit 1;
 end if;
 v_days:=coalesce(v_option.warranty_days,90);
 v_label:=coalesce(v_option.label,'Garantia do serviço');
 v_begin:=(v_os.completed_at at time zone 'America/Sao_Paulo')::date;
 select to_jsonb(c) into v_customer from public.customers c
   where c.id=v_os.customer_id and c.organization_id=p_organization_id;
 select name into v_brand from public.equipment_brands
   where id=v_os.equipment_brand_id and organization_id=p_organization_id;
 select name into v_model from public.equipment_models
   where id=v_os.equipment_model_id and organization_id=p_organization_id;
 select name into v_equipment from public.equipment_types
   where id=v_os.equipment_type_id and organization_id=p_organization_id;
 select name into v_service from public.general_services
   where id=v_os.general_service_id and organization_id=p_organization_id;
 select name into v_org from public.organizations where id=p_organization_id and status='active';
 if v_org is null then raise exception 'Empresa inválida.' using errcode='23503'; end if;
 insert into public.service_order_warranty_certificates (
  organization_id,service_order_id,equipment_type_id,warranty_option_label,warranty_days,starts_at,expires_at,issued_by,snapshot
 ) values (
  p_organization_id,p_service_order_id,v_os.equipment_type_id,v_label,v_days,v_begin,v_begin+v_days,auth.uid(),
  jsonb_build_object(
    'organization_name',v_org,'os_number',v_os.os_number,
    'customer_name',coalesce(v_customer->>'trade_name',v_customer->>'full_name','Cliente'),
    'customer_document',coalesce(nullif(v_customer->>'cnpj',''),v_customer->>'document'),
    'customer_phone',coalesce(nullif(v_customer->>'whatsapp',''),v_customer->>'phone'),
    'customer_city',v_os.service_city,'customer_state',v_os.service_state,
    'equipment_name',coalesce(v_equipment,'Equipamento'),'equipment_brand',coalesce(v_brand,''),
    'equipment_model',coalesce(v_model,v_os.model,''),'serial_number',v_os.serial_number,
    'accessories',v_os.accessories,'solution',coalesce(nullif(trim(v_os.solution),''),nullif(v_service,''),'Serviço descrito na Ordem de Serviço')
  )
 ) on conflict (organization_id,service_order_id) do nothing
 returning * into v_record;
 if v_record.id is null then
   select * into v_record from public.service_order_warranty_certificates
   where organization_id=p_organization_id and service_order_id=p_service_order_id;
 end if;
 return to_jsonb(v_record);
end $$;
revoke all on function public.issue_service_order_warranty_v1(uuid,uuid,uuid) from public,anon;
grant execute on function public.issue_service_order_warranty_v1(uuid,uuid,uuid) to authenticated;
