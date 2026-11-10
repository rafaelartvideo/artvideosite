begin;
create table if not exists public.sales_proposal_approval_links(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 proposal_id uuid not null,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null,
 used_at timestamptz,
 revoked_at timestamptz,
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 foreign key(organization_id,proposal_id) references public.sales_proposals(organization_id,id) on delete restrict
);
create index if not exists sales_proposal_approval_links_proposal_idx
 on public.sales_proposal_approval_links(organization_id,proposal_id,created_at desc);
create index if not exists sales_proposal_approval_links_creator_idx
 on public.sales_proposal_approval_links(created_by) where created_by is not null;
alter table public.sales_proposal_approval_links enable row level security;
revoke all on public.sales_proposal_approval_links from anon,authenticated;

alter table public.sales_proposal_events drop constraint if exists sales_proposal_events_event_type_check;
alter table public.sales_proposal_events add constraint sales_proposal_events_event_type_check
 check(event_type in('created','revised','sent','approved','rejected','reopened','converted',
 'cancelled','reserved','reservation_released','approval_link_created'));

create or replace function public.create_sales_proposal_approval_link_v1(
 p_organization_id uuid,p_proposal_id uuid
) returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare
 v_actor uuid:=auth.uid();
 v_proposal public.sales_proposals%rowtype;
 v_token text:=encode(extensions.gen_random_bytes(32),'hex');
 v_hash text:=encode(extensions.digest(convert_to(v_token,'UTF8'),'sha256'),'hex');
 v_expiry timestamptz;
begin
 if v_actor is null or not private.has_tenant_module_permission(
   p_organization_id,'sales','sales.proposals.manage')
 then raise exception 'Sem permissão para gerar link comercial.' using errcode='42501'; end if;
 select * into v_proposal from public.sales_proposals
 where organization_id=p_organization_id and id=p_proposal_id for update;
 if not found then raise exception 'Proposta não encontrada.' using errcode='P0002'; end if;
 if v_proposal.status<>'sent' or v_proposal.valid_until<current_date then
   raise exception 'Marque a proposta válida como enviada antes de gerar o link.' using errcode='22023'; end if;
 v_expiry:=least(now()+interval '72 hours',
   (v_proposal.valid_until::timestamp+interval '1 day') at time zone current_setting('TimeZone'));
 update public.sales_proposal_approval_links set revoked_at=now()
 where organization_id=p_organization_id and proposal_id=p_proposal_id
   and used_at is null and revoked_at is null;
 insert into public.sales_proposal_approval_links(
   organization_id,proposal_id,token_hash,expires_at,created_by
 ) values(p_organization_id,p_proposal_id,v_hash,v_expiry,v_actor);
 insert into public.sales_proposal_events(organization_id,proposal_id,event_type,event_data,created_by)
 values(p_organization_id,p_proposal_id,'approval_link_created',
   jsonb_build_object('expires_at',v_expiry),v_actor);
 return jsonb_build_object('token',v_token,'expires_at',v_expiry);
end;$function$;

-- Obter somente informação indispensável à decisão comercial, sem CPF/telefone, custo ou ID interno.
create or replace function public.get_sales_proposal_public_v1(p_token text)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_link public.sales_proposal_approval_links%rowtype;
 v_proposal public.sales_proposals%rowtype;
 v_items jsonb;
 v_company_name text;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then
   raise exception 'Link comercial inválido.' using errcode='22023'; end if;
 select * into v_link from public.sales_proposal_approval_links l
 where l.token_hash=encode(extensions.digest(convert_to(p_token,'UTF8'),'sha256'),'hex');
 if not found then raise exception 'Link de aprovação não encontrado.' using errcode='P0002'; end if;
 select * into v_proposal from public.sales_proposals
 where id=v_link.proposal_id and organization_id=v_link.organization_id;
 if not found then raise exception 'Proposta não encontrada.' using errcode='P0002'; end if;
 if v_link.revoked_at is not null or v_link.used_at is not null or v_link.expires_at<=now()
   or v_proposal.status<>'sent' or v_proposal.valid_until<current_date then
   raise exception 'O link expirou ou a proposta já foi respondida. Solicite um novo link ao vendedor.' using errcode='22023'; end if;
 select o.name into v_company_name from public.organizations o where o.id=v_link.organization_id;
 select coalesce(jsonb_agg(jsonb_build_object(
  'name',i.name_snapshot,'quantity',i.quantity,'unit_price',i.unit_price,'total',i.line_total
 ) order by i.created_at,i.id),'[]'::jsonb) into v_items
 from public.sales_proposal_items i
 where i.organization_id=v_link.organization_id and i.proposal_id=v_link.proposal_id;
 return jsonb_build_object(
  'proposal_number',v_proposal.proposal_number,
  'organization_name',v_company_name,
  'customer_name',v_proposal.customer_name_snapshot,
  'valid_until',v_proposal.valid_until,'subtotal',v_proposal.subtotal,
  'discount',v_proposal.discount_amount,'total',v_proposal.total_amount,
  'notes',v_proposal.notes,'items',v_items
 );
end;$function$;

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
 select * into v_proposal from public.sales_proposals
 where id=v_link.proposal_id and organization_id=v_link.organization_id for update;
 if not found or v_proposal.status<>'sent' or v_proposal.valid_until<current_date then
   raise exception 'A proposta não está mais aguardando sua resposta.' using errcode='22023'; end if;
 v_doc4:=right(regexp_replace(coalesce(v_proposal.customer_document_snapshot,''),'[^0-9]','','g'),4);
 if length(v_doc4)=4 and
   (p_document_last4 is null or p_document_last4 !~ '^[0-9]{4}$' or p_document_last4<>v_doc4) then
   raise exception 'Os quatro últimos dígitos do CPF/CNPJ não conferem.' using errcode='22023'; end if;
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

-- Revisão/reabertura/cancelamento/conversão invalida links antigos.
create or replace function private.revoke_proposal_links_on_status_v1()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
 if new.status is distinct from old.status and new.status<>'sent' then
   update public.sales_proposal_approval_links
   set revoked_at=now() where organization_id=new.organization_id and proposal_id=new.id
   and used_at is null and revoked_at is null;
 end if;
 return new;
end;$function$;
drop trigger if exists revoke_proposal_links_on_status_v1 on public.sales_proposals;
create trigger revoke_proposal_links_on_status_v1 after update of status on public.sales_proposals
for each row execute function private.revoke_proposal_links_on_status_v1();

revoke all on function public.create_sales_proposal_approval_link_v1(uuid,uuid) from public,anon;
grant execute on function public.create_sales_proposal_approval_link_v1(uuid,uuid) to authenticated;
revoke all on function public.get_sales_proposal_public_v1(text) from public;
revoke all on function public.respond_sales_proposal_public_v1(text,text,text,text,boolean) from public;
grant execute on function public.get_sales_proposal_public_v1(text) to anon,authenticated;
grant execute on function public.respond_sales_proposal_public_v1(text,text,text,text,boolean) to anon,authenticated;
commit;