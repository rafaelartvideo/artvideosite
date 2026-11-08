begin;
alter table public.sales_proposal_approval_links add column if not exists failed_identity_attempts int
  not null default 0 check(failed_identity_attempts between 0 and 10);
create index if not exists sales_stock_reservations_inventory_fk_idx
  on public.sales_stock_reservations(inventory_item_id);
create or replace function public.respond_sales_proposal_public_v1(
 p_token text,p_decision text,p_confirm_name text,p_document_last4 text,p_consent boolean
) returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare
 v_link public.sales_proposal_approval_links%rowtype;
 v_proposal public.sales_proposals%rowtype;
 v_doc4 text;
 v_name text:=left(btrim(coalesce(p_confirm_name,'')),160);
 v_decision text;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$'
   or p_decision not in ('approved','rejected')
   or length(v_name)<3 or p_consent is distinct from true then
   raise exception 'Preencha a identificação e confirme sua decisão.' using errcode='22023'; end if;
 select * into v_link from public.sales_proposal_approval_links
 where token_hash=encode(extensions.digest(convert_to(p_token,'UTF8'),'sha256'),'hex') for update;
 if not found or v_link.used_at is not null or v_link.revoked_at is not null
   or v_link.expires_at<=now() then
   raise exception 'Link inválido, usado ou expirado.' using errcode='22023'; end if;
 if coalesce(v_link.failed_identity_attempts,0)>=10 then
   return jsonb_build_object('status','locked','message',
      'Confirmação bloqueada por tentativas incorretas. Solicite outro link.');
 end if;
 select * into v_proposal from public.sales_proposals
 where id=v_link.proposal_id and organization_id=v_link.organization_id for update;
 if not found or v_proposal.status<>'sent' or v_proposal.valid_until<current_date then
   raise exception 'A proposta não está mais aguardando sua resposta.' using errcode='22023'; end if;
 v_doc4:=right(regexp_replace(coalesce(v_proposal.customer_document_snapshot,''),'[^0-9]','','g'),4);
 if length(v_doc4)=4 and
   (p_document_last4 is null or p_document_last4 !~ '^[0-9]{4}
 v_decision:=p_decision;
 update public.sales_proposals set status=v_decision,updated_at=now()
 where id=v_proposal.id and organization_id=v_proposal.organization_id;
 update public.sales_proposal_approval_links set used_at=now()
 where id=v_link.id;
 update public.sales_proposal_approval_links set revoked_at=now()
 where organization_id=v_link.organization_id and proposal_id=v_link.proposal_id
   and id<>v_link.id and used_at is null and revoked_at is null;
 insert into public.sales_proposal_events(organization_id,proposal_id,event_type,event_data,created_by)
 values(v_link.organization_id,v_link.proposal_id,v_decision,
  jsonb_build_object('source','customer_link','name',v_name,
   'consent_confirmed',true,'confirmed_at',now()),null);
 return jsonb_build_object('status',v_decision,'proposal_number',v_proposal.proposal_number);
end;$function$; or p_document_last4<>v_doc4) then
   update public.sales_proposal_approval_links
     set failed_identity_attempts=failed_identity_attempts+1
     where id=v_link.id;
   return jsonb_build_object('status','verification_failed','message',
     'Os quatro últimos dígitos do CPF/CNPJ não conferem.');
 end if;
 v_decision:=p_decision;
 update public.sales_proposals set status=v_decision,updated_at=now()
 where id=v_proposal.id and organization_id=v_proposal.organization_id;
 update public.sales_proposal_approval_links set used_at=now()
 where id=v_link.id;
 update public.sales_proposal_approval_links set revoked_at=now()
 where organization_id=v_link.organization_id and proposal_id=v_link.proposal_id
   and id<>v_link.id and used_at is null and revoked_at is null;
 insert into public.sales_proposal_events(organization_id,proposal_id,event_type,event_data,created_by)
 values(v_link.organization_id,v_link.proposal_id,v_decision,
  jsonb_build_object('source','customer_link','name',v_name,
   'consent_confirmed',true,'confirmed_at',now()),null);
 return jsonb_build_object('status',v_decision,'proposal_number',v_proposal.proposal_number);
end;$function$;
revoke all on function public.respond_sales_proposal_public_v1(text,text,text,text,boolean) from public;
grant execute on function public.respond_sales_proposal_public_v1(text,text,text,text,boolean)
 to anon,authenticated;
commit;
