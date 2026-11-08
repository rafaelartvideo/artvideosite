-- Reabrir negociação depois de envio ou aprovação, com motivo e permissão para desfazer aprovação.
begin;
create or replace function public.change_sales_proposal_status_v1(
 p_organization_id uuid,p_proposal_id uuid,p_next_status text,p_reason text default null
) returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare v_p public.sales_proposals%rowtype;v_actor uuid:=auth.uid();
begin
 if v_actor is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.proposals.manage')
 then raise exception 'Sem permissão para atualizar propostas.' using errcode='42501'; end if;
 if p_next_status not in ('sent','approved','rejected','draft','cancelled') or p_next_status is null
 then raise exception 'Situação de proposta inválida.' using errcode='22023'; end if;
 if p_next_status='approved' and not private.has_tenant_module_permission(
   p_organization_id,'sales','sales.proposals.approve')
 then raise exception 'Sem permissão para registrar aprovação.' using errcode='42501'; end if;
 select * into v_p from public.sales_proposals
 where organization_id=p_organization_id and id=p_proposal_id for update;
 if not found then raise exception 'Proposta não encontrada.' using errcode='P0002'; end if;
 if v_p.status=p_next_status then return jsonb_build_object('status',v_p.status,'unchanged',true); end if;
 if not (
  (v_p.status='draft' and p_next_status in ('sent','cancelled'))
  or (v_p.status='sent' and p_next_status in ('approved','rejected','cancelled'))
  or (v_p.status='rejected' and p_next_status in ('draft','cancelled'))
  or (v_p.status in ('sent','approved') and p_next_status='draft')
 ) then raise exception 'Esta mudança de situação não é permitida.' using errcode='22023'; end if;
 if v_p.valid_until<current_date and p_next_status in ('sent','approved')
 then raise exception 'Proposta vencida. Reabra e revise a validade antes de enviar ou aprovar.' using errcode='22023'; end if;
 if v_p.status='approved' and p_next_status='draft' then
   if not private.has_tenant_module_permission(p_organization_id,'sales','sales.proposals.approve')
   then raise exception 'Sem permissão para desfazer a aprovação registrada.' using errcode='42501'; end if;
   if char_length(btrim(coalesce(p_reason,'')))<5
   then raise exception 'Informe o motivo da renegociação da proposta aprovada.' using errcode='22023'; end if;
 end if;
 if p_next_status='approved' and char_length(btrim(coalesce(p_reason,'')))<3 then
   raise exception 'Informe como o cliente aprovou (WhatsApp, presencial, ligação etc.).' using errcode='22023'; end if;
 update public.sales_proposals set status=p_next_status,updated_by=v_actor,updated_at=now()
 where organization_id=p_organization_id and id=p_proposal_id;
 insert into public.sales_proposal_events(organization_id,proposal_id,event_type,event_data,created_by)
 values(p_organization_id,p_proposal_id,
  case when p_next_status='draft' then 'reopened' else p_next_status end,
  jsonb_build_object('previous',v_p.status,'next',p_next_status,'reason',left(btrim(coalesce(p_reason,'')),500)),
  v_actor);
 return jsonb_build_object('status',p_next_status,'unchanged',false);
end;$function$;
revoke all on function public.change_sales_proposal_status_v1(uuid,uuid,text,text) from public,anon;
grant execute on function public.change_sales_proposal_status_v1(uuid,uuid,text,text) to authenticated;
commit;
