-- Repara o diagnostico de retorno sem relaxar RLS nem permissao entre empresas.

-- Gestor e Gestor do Sistema recebem permissoes elegiveis da propria empresa.

CREATE OR REPLACE FUNCTION private.provision_gestor_role_permissions(p_organization_id uuid DEFAULT NULL::uuid, p_permission_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.role_permissions (role_id, permission_id)
  select role_row.id, permission_row.id
  from public.roles role_row
  join public.organizations organization
    on organization.id = role_row.organization_id
  cross join public.permissions permission_row
  where (p_organization_id is null or role_row.organization_id = p_organization_id)
    and (p_permission_id is null or permission_row.id = p_permission_id)
    and lower(btrim(role_row.name)) in ('gestor','gestor do sistema')
    and role_row.is_active
    and organization.status = 'active'
    and private.permission_belongs_to_organization(role_row.organization_id, permission_row.key)
  on conflict (role_id, permission_id) do nothing;
end;
$function$;

select private.provision_gestor_role_permissions(null,null);

-- A RPC de classificacao escreve somente os campos do diagnostico com uma excecao controlada.

CREATE OR REPLACE FUNCTION private.guard_service_order_sensitive_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_return_diagnosis boolean := false;
begin
  if (select auth.uid()) is null then return new; end if;

  -- Classificacao do retorno e diagnostico inicial, NAO e acao de solucionar.
  -- A excecao so vale durante a RPC autenticada e apenas para os 3 campos
  -- diagnostico, solucao proposta e classificacao (sem modificar estado/valores).
  v_return_diagnosis :=
    current_setting('app.classify_service_order_return',true)='true'
    and old.return_root_id is not null
    and old.completed_at is null
    and old.cancelled_at is null
    and old.is_solved is not true
    and old.return_classification='analysis'
    and new.return_classification in ('covered','unrelated')
    and private.is_organization_member(old.organization_id)
    and (
      private.has_effective_organization_permission(old.organization_id,'orders.edit')
      or private.has_effective_organization_permission(old.organization_id,'orders.update')
    )
    and (to_jsonb(new)-'diagnosis'-'solution'-'return_classification'-'updated_at')
      is not distinct from
        (to_jsonb(old)-'diagnosis'-'solution'-'return_classification'-'updated_at');

  if new.situation_id is distinct from old.situation_id
     and not private.can_access_technician_order_v1(old.id,'technician_panel.actions.change_situation') then
    perform private.require_service_order_action(
      old.id,'orders.situation.change',
      'Você não possui permissão para alterar a situação desta OS nesta empresa.');
  end if;

  if new.cancelled_at is distinct from old.cancelled_at
     or new.cancelled_by is distinct from old.cancelled_by
     or new.cancellation_reason is distinct from old.cancellation_reason then
    perform private.require_service_order_action(
      old.id,'orders.cancel','Você não possui permissão para cancelar esta OS nesta empresa.');
  end if;

  if new.is_solved is distinct from old.is_solved
     or new.solved_at is distinct from old.solved_at
     or (new.solution is distinct from old.solution and not v_return_diagnosis)
     or new.cannot_be_solved is distinct from old.cannot_be_solved
     or new.cannot_be_solved_reason is distinct from old.cannot_be_solved_reason then
    perform private.require_service_order_action(
      old.id,'orders.solve',
      'Você não possui permissão para solucionar ou alterar a solução desta OS nesta empresa.');
  end if;

  if new.diagnosis is distinct from old.diagnosis
     and not v_return_diagnosis
     and not (
       private.can_access_technician_order_v1(old.id,'technician_panel.actions.edit_diagnosis')
       and private.can_access_technician_order_v1(old.id,'technician_panel.data.diagnosis')
     ) then
    perform private.require_service_order_action(
      old.id,'orders.solve','Você não possui permissão para editar o diagnóstico desta OS.');
  end if;

  -- Concluir OS e trocar responsável continuam exigindo orders.complete.
  if new.completed_at is distinct from old.completed_at
     or new.completed_by is distinct from old.completed_by then
    perform private.require_service_order_action(
      old.id,'orders.complete',
      'Você não possui permissão para concluir financeiramente esta OS nesta empresa.');
  end if;

  -- O recálculo disparado por inclusão/remoção técnica é uma operação
  -- interna, NÃO uma permissão para alterar preços ou concluir a OS.
  if new.service_price is distinct from old.service_price
     or new.parts_total is distinct from old.parts_total
     or new.subtotal is distinct from old.subtotal
     or new.discount_type is distinct from old.discount_type
     or new.discount_percentage is distinct from old.discount_percentage
     or new.discount_amount is distinct from old.discount_amount
     or new.final_total is distinct from old.final_total
     or new.commercial_pricing_enabled is distinct from old.commercial_pricing_enabled then
    if not (
      current_setting('app.technician_order_commercial_write',true)='true'
      and current_setting('app.update_order_commercial_totals',true)='true'
      and (
        private.can_access_technician_order_v1(old.id,'technician_panel.actions.add_service')
        or private.can_access_technician_order_v1(old.id,'technician_panel.actions.add_product')
        or private.can_access_technician_order_v1(old.id,'technician_panel.actions.remove_product')
      )
      and (
        to_jsonb(new)
         -'service_price'-'parts_total'-'subtotal'-'discount_type'
         -'discount_percentage'-'discount_amount'-'final_total'
         -'commercial_pricing_enabled'-'updated_at'
      ) is not distinct from (
        to_jsonb(old)
         -'service_price'-'parts_total'-'subtotal'-'discount_type'
         -'discount_percentage'-'discount_amount'-'final_total'
         -'commercial_pricing_enabled'-'updated_at'
      )
    ) then
      perform private.require_service_order_action(
        old.id,'orders.complete',
        'Você não possui permissão para alterar os valores desta OS nesta empresa.');
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.classify_service_order_return_v2(p_organization_id uuid, p_order_id uuid, p_damage_kind text, p_diagnosis text, p_solution text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_order public.service_orders%rowtype;
  v_classification text;
begin
  if auth.uid() is null or not private.is_organization_member(p_organization_id)
    or not (private.has_effective_organization_permission(p_organization_id,'orders.edit')
        or private.has_effective_organization_permission(p_organization_id,'orders.update')) then
    raise exception 'Sem permissao para registrar o diagnostico.' using errcode='42501';
  end if;
  if coalesce(p_damage_kind,'') not in ('same_part','different_part') then
    raise exception 'Classifique se o defeito e na mesma peca ou em outra peca.' using errcode='23514';
  end if;
  if length(btrim(coalesce(p_diagnosis,'')))<5 or length(coalesce(p_diagnosis,''))>400
     or length(btrim(coalesce(p_solution,'')))<5 or length(coalesce(p_solution,''))>400 then
    raise exception 'Informe diagnostico e solucao proposta (5 a 400 caracteres cada).' using errcode='23514';
  end if;
  select * into v_order from public.service_orders
    where id=p_order_id and organization_id=p_organization_id for update;
  if not found or v_order.return_root_id is null
     or v_order.completed_at is not null or v_order.cancelled_at is not null then
    raise exception 'Este atendimento nao pode ser classificado.' using errcode='23514';
  end if;
  if v_order.return_classification<>'analysis' then
    raise exception 'O diagnostico inicial ja foi classificado.' using errcode='23514';
  end if;
  if v_order.is_solved is true then
    raise exception 'Este retorno ja foi marcado como solucionado. Desfaca a solucao antes de classificar o diagnostico.'
      using errcode='23514';
  end if;
  v_classification:=case when p_damage_kind='same_part' then 'covered' else 'unrelated' end;
  perform set_config('app.classify_service_order_return','true',true);
  update public.service_orders
    set diagnosis=btrim(p_diagnosis),solution=btrim(p_solution),
        return_classification=v_classification,updated_at=now()
    where id=v_order.id;
  perform set_config('app.classify_service_order_return','',true);
  return v_classification;
end;
$function$;

-- Recuperacao pontual da OS 28R1 na empresa Teste:
-- a OS foi solucionada indevidamente antes da classificacao estar habilitada.
-- Nao existe estoque utilizado, pedido de peca, recebimento ou nota fiscal.
-- Preserva diagnostico/solucao digitados e a tentativa antiga com historico de reversao.
DO $recovery$
declare
  v_order_id uuid := 'ae69328a-9c8f-48cf-9bec-a0c499a78f6f';
  v_organization uuid := '5bcd7ec7-38f0-4dda-a84c-10429bd46b23';
begin
  if exists (
    select 1 from public.service_orders so
      where so.id=v_order_id and so.organization_id=v_organization
        and so.os_number='28R1' and so.return_root_id is not null
        and so.return_classification='analysis'
        and so.is_solved is true and so.completed_at is null and so.cancelled_at is null
        and not exists (select 1 from public.service_order_used_items i where i.service_order_id=so.id)
        and not exists (select 1 from public.service_order_part_requests pr where pr.service_order_id=so.id)
        and not exists (select 1 from public.financial_receipts fr where fr.service_order_id=so.id)
        and not exists (select 1 from public.financial_entries fe
            where fe.organization_id=so.organization_id and fe.origin_reference in (so.id::text,so.os_number))
        and not exists (select 1 from public.fiscal_documents fd where fd.source_order_id=so.id)
        and (select count(*) from public.service_order_solution_attempts at
              where at.service_order_id=so.id and at.reverted_at is null)=1
  ) then
    update public.service_order_solution_attempts
      set reverted_at=now(),
          revert_reason='Ajuste de fluxo: retorno solucionado antes da classificacao da garantia.'
      where service_order_id=v_order_id and reverted_at is null;

    perform set_config('app.resolve_service_order','true',true);
    update public.service_orders
      set is_solved=false,updated_at=now()
      where id=v_order_id and organization_id=v_organization;
    perform set_config('app.resolve_service_order','',true);
  end if;
end;
$recovery$;
