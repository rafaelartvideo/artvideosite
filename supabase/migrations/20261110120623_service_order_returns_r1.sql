-- Retornos de OS: cada Rn e uma OS vinculada, sem reutilizar lancamentos antigos.
-- Espelho da migracao aplicada no CRM em 2026-11-10.
alter table public.service_orders
  add column if not exists return_root_id uuid references public.service_orders(id) on delete restrict,
  add column if not exists return_sequence integer not null default 0,
  add column if not exists return_reason text,
  add column if not exists return_classification text not null default 'analysis';
alter table public.service_orders drop constraint if exists service_orders_return_metadata_check;
alter table public.service_orders add constraint service_orders_return_metadata_check
  check ((return_root_id is null and return_sequence=0) or
         (return_root_id is not null and return_sequence>0 and length(btrim(coalesce(return_reason,'')))>=5));
alter table public.service_orders drop constraint if exists service_orders_return_classification_check;
alter table public.service_orders add constraint service_orders_return_classification_check
  check (return_classification in ('analysis','covered','not_covered','courtesy','unrelated'));

CREATE UNIQUE INDEX IF NOT EXISTS service_orders_one_active_return ON public.service_orders USING btree (return_root_id) WHERE ((return_root_id IS NOT NULL) AND (completed_at IS NULL) AND (cancelled_at IS NULL));

CREATE UNIQUE INDEX IF NOT EXISTS service_orders_org_code_unique ON public.service_orders USING btree (organization_id, os_number);

CREATE INDEX IF NOT EXISTS service_orders_return_root_lookup ON public.service_orders USING btree (return_root_id, return_sequence DESC);

CREATE UNIQUE INDEX IF NOT EXISTS service_orders_root_return_sequence_unique ON public.service_orders USING btree (return_root_id, return_sequence) WHERE (return_root_id IS NOT NULL);

CREATE OR REPLACE FUNCTION private.guard_closed_service_order_line()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_order uuid; v_closed boolean;
begin
 v_order:=case when tg_op='INSERT' then new.service_order_id else old.service_order_id end;
 select (o.completed_at is not null or o.cancelled_at is not null)
   into v_closed from public.service_orders o where o.id=v_order;
 if coalesce(v_closed,false) then
    raise exception 'Itens de atendimentos concluidos ou cancelados nao podem ser alterados.' using errcode='42501';
 end if;
 if tg_op='UPDATE' and old.service_order_id is distinct from new.service_order_id then
   select (o.completed_at is not null or o.cancelled_at is not null)
     into v_closed from public.service_orders o where o.id=new.service_order_id;
   if coalesce(v_closed,false) then
      raise exception 'Nao e permitido movimentar itens para um atendimento fechado.' using errcode='42501';
   end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.guard_service_order_return_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if old.return_root_id is distinct from new.return_root_id
    or old.return_sequence is distinct from new.return_sequence
    or old.os_number is distinct from new.os_number then
    raise exception 'O vinculo e a numeracao do retorno sao imutaveis.' using errcode='42501';
 end if;
 if old.completed_at is not null
    and (old.return_reason is distinct from new.return_reason
         or old.return_classification is distinct from new.return_classification) then
    raise exception 'A classificacao do retorno fechado nao pode ser alterada.' using errcode='42501';
 end if;
 return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.assign_service_order_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_next_number bigint;
  v_candidate bigint;
  v_root public.service_orders%rowtype;
begin
  if new.organization_id is null then
    raise exception 'A empresa da OS deve ser informada antes da geração do número.' using errcode='23502';
  end if;

  if new.return_root_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('os-return:' || new.return_root_id::text, 0));
    select * into v_root from public.service_orders where id=new.return_root_id;
    if not found or v_root.organization_id is distinct from new.organization_id
      or v_root.return_root_id is not null or v_root.completed_at is null or v_root.cancelled_at is not null then
      raise exception 'A OS original não está concluída ou não pertence à empresa.' using errcode='23514';
    end if;
    if exists(select 1 from public.service_orders o
      where o.return_root_id=v_root.id and o.completed_at is null and o.cancelled_at is null) then
      raise exception 'Existe um retorno em andamento para esta OS.' using errcode='23505';
    end if;
    select coalesce(max(o.return_sequence),0)+1 into new.return_sequence
      from public.service_orders o where o.return_root_id=v_root.id;
    new.os_number := v_root.os_number || 'R' || new.return_sequence::text;
    return new;
  end if;

  new.return_sequence := 0;
  select greatest(coalesce(max(case when so.os_number ~ '^[0-9]+$'
       then so.os_number::bigint else null end),0)+1,1)
    into v_candidate from public.service_orders so where so.organization_id=new.organization_id;
  insert into private.service_order_number_counters as counter
    (organization_id,last_number,updated_at)
  values(new.organization_id,v_candidate,now())
  on conflict(organization_id) do update set
    last_number=greatest(counter.last_number+1,excluded.last_number),
    updated_at=excluded.updated_at
  returning last_number into v_next_number;
  new.os_number := v_next_number::text;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_service_order_return_v1(p_order_id uuid, p_reason text, p_classification text DEFAULT 'analysis'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_selected public.service_orders%rowtype;
 v_root public.service_orders%rowtype;
 v_id uuid; v_situation uuid;
begin
 if (select auth.uid()) is null then raise exception 'Sessao nao autenticada.' using errcode='42501'; end if;
 if nullif(btrim(coalesce(p_reason,'')),'') is null
    or length(btrim(p_reason)) < 5 or length(p_reason)>2000 then
   raise exception 'Descreva o motivo do retorno (5 a 2000 caracteres).' using errcode='23514';
 end if;
 if coalesce(p_classification,'') not in ('analysis','covered','not_covered','courtesy','unrelated') then
   raise exception 'Classificacao invalida.' using errcode='23514';
 end if;
 select * into v_selected from public.service_orders where id=p_order_id;
 if not found then raise exception 'OS nao encontrada ou acesso negado.' using errcode='42501'; end if;
 select * into v_root from public.service_orders where id=coalesce(v_selected.return_root_id,v_selected.id);
 if not found or v_root.organization_id<>v_selected.organization_id then
   raise exception 'OS original indisponivel.' using errcode='42501';
 end if;
 if not private.has_effective_organization_permission(v_root.organization_id,'orders.create')
    or not private.is_organization_member(v_root.organization_id) then
   raise exception 'Sem permissao para iniciar retornos.' using errcode='42501';
 end if;
 if v_root.completed_at is null or v_root.cancelled_at is not null then
   raise exception 'Somente OS originais concluidas podem receber retornos.' using errcode='23514';
 end if;
 if v_selected.completed_at is null or v_selected.cancelled_at is not null then
   raise exception 'Conclua o atendimento atual antes de iniciar outro retorno.' using errcode='23514';
 end if;
 select s.id into v_situation
 from public.os_situations s
 where s.organization_id=v_root.organization_id and s.is_active
   and (
     v_root.service_type_id is null
     or not exists(select 1 from public.service_type_situations sts
        where sts.service_type_id=v_root.service_type_id and sts.organization_id=v_root.organization_id)
     or exists(select 1 from public.service_type_situations sts
        where sts.service_type_id=v_root.service_type_id and sts.organization_id=v_root.organization_id and sts.situation_id=s.id)
   )
 order by coalesce((select sts.sort_order from public.service_type_situations sts
   where sts.service_type_id=v_root.service_type_id and sts.organization_id=v_root.organization_id and sts.situation_id=s.id),s.sort_order),s.sort_order,s.id limit 1;
 if v_situation is null then raise exception 'Configure uma situacao inicial ativa para este atendimento.' using errcode='23514'; end if;

 insert into public.service_orders
 (organization_id,customer_id,service_id,status_id,situation_id,
  brand_id,product_id,model,serial_number,accessories,equipment_condition,loose_parts,
  priority,equipment_type_id,equipment_brand_id,equipment_model_id,customer_equipment_id,
  seller_id,technician_id,service_type_id,order_type,
  service_state,service_city,service_street,service_zip_code,service_neighborhood,
  service_number,service_complement,service_address_source,service_customer_address_id,
  order_rules_snapshot,custom_field_values,return_root_id,return_reason,return_classification,customer_notes)
 values
 (v_root.organization_id,v_root.customer_id,v_root.service_id,v_root.status_id,v_situation,
  v_root.brand_id,v_root.product_id,v_root.model,v_root.serial_number,v_root.accessories,
  v_root.equipment_condition,v_root.loose_parts,
  v_root.priority,v_root.equipment_type_id,v_root.equipment_brand_id,v_root.equipment_model_id,
  v_root.customer_equipment_id,
  v_root.seller_id,v_root.technician_id,v_root.service_type_id,v_root.order_type,
  v_root.service_state,v_root.service_city,v_root.service_street,v_root.service_zip_code,
  v_root.service_neighborhood,v_root.service_number,v_root.service_complement,
  v_root.service_address_source,v_root.service_customer_address_id,
  v_root.order_rules_snapshot,coalesce(v_root.custom_field_values,'{}'::jsonb),
  v_root.id,btrim(p_reason),p_classification,btrim(p_reason))
 returning id into v_id;
 return v_id;
exception when unique_violation then
 raise exception 'Ja existe um retorno ativo para esta OS. Atualize e abra o retorno existente.' using errcode='23505';
end;
$function$;

drop trigger if exists guard_service_order_return_identity on public.service_orders;
CREATE TRIGGER guard_service_order_return_identity BEFORE UPDATE OF return_root_id, return_sequence, os_number, return_reason, return_classification ON public.service_orders FOR EACH ROW EXECUTE FUNCTION private.guard_service_order_return_identity();

drop trigger if exists service_order_items_protect_closed on public.service_order_items;
CREATE TRIGGER service_order_items_protect_closed BEFORE INSERT OR DELETE OR UPDATE ON public.service_order_items FOR EACH ROW EXECUTE FUNCTION private.guard_closed_service_order_line();

drop trigger if exists service_order_used_items_protect_closed on public.service_order_used_items;
CREATE TRIGGER service_order_used_items_protect_closed BEFORE INSERT OR DELETE OR UPDATE ON public.service_order_used_items FOR EACH ROW EXECUTE FUNCTION private.guard_closed_service_order_line();

revoke all on function public.create_service_order_return_v1(uuid,text,text) from public,anon;
grant execute on function public.create_service_order_return_v1(uuid,text,text) to authenticated;
