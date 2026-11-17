-- Termos e conferência para descarte ou devolução sem reparo de qualquer OS.
begin;
alter table public.service_orders drop constraint if exists service_orders_closure_outcome_check;
alter table public.service_orders add constraint service_orders_closure_outcome_check
 check (closure_outcome is null or closure_outcome in ('rejected_quote_return','disposal_confirmed','returned_unrepaired'));

create table if not exists public.service_order_terminal_closures(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 service_order_id uuid not null unique references public.service_orders(id),
 outcome text not null check(outcome in ('disposal_confirmed','returned_unrepaired')),
 reason text not null check(length(btrim(reason))>=8),
 signature_request_id uuid not null references public.document_signature_requests(id),
 evidence_media_id uuid not null references public.media(id),
 disposal_partner_id uuid references public.entities(id),
 order_snapshot jsonb not null default '{}'::jsonb,
 stock_snapshot jsonb not null default '[]'::jsonb,
 confirmed_by uuid not null references auth.users(id),
 confirmed_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create index if not exists terminal_closures_org_date_idx on public.service_order_terminal_closures(organization_id,confirmed_at desc);
alter table public.service_order_terminal_closures enable row level security;
drop policy if exists terminal_closures_read on public.service_order_terminal_closures;
create policy terminal_closures_read on public.service_order_terminal_closures for select to authenticated
using(private.is_organization_member(organization_id)
 and (private.has_effective_organization_permission(organization_id,'orders.view')
 or private.has_effective_organization_permission(organization_id,'orders.view_all')
 or private.has_effective_organization_permission(organization_id,'finance.reports.view')));
revoke all on public.service_order_terminal_closures from anon,authenticated;
grant select on public.service_order_terminal_closures to authenticated;

create table if not exists public.service_order_terminal_stock_lines(
 id uuid primary key default gen_random_uuid(),
 closure_id uuid not null references public.service_order_terminal_closures(id) on delete restrict,
 organization_id uuid not null references public.organizations(id),
 inventory_item_id uuid not null references public.inventory_items(id),
 quantity_outstanding numeric not null check(quantity_outstanding>0),
 quantity_restored numeric not null check(quantity_restored>=0 and quantity_restored<=quantity_outstanding),
 decision text not null check(decision in ('reusable','installed','damaged','not_recovered')),
 movement_id uuid references public.inventory_movements(id),
 confirmed_by uuid not null references auth.users(id),
 confirmed_at timestamptz not null default now(),
 unique(closure_id,inventory_item_id)
);
alter table public.service_order_terminal_stock_lines enable row level security;
drop policy if exists terminal_stock_lines_read on public.service_order_terminal_stock_lines;
create policy terminal_stock_lines_read on public.service_order_terminal_stock_lines for select to authenticated
using(exists(select 1 from public.service_order_terminal_closures c
 where c.id=closure_id and c.organization_id=organization_id));
revoke all on public.service_order_terminal_stock_lines from anon,authenticated;
grant select on public.service_order_terminal_stock_lines to authenticated;

-- Situações ficam disponíveis até em tipos de atendimento com lista própria.
do $seed$
declare v record; t record; sid uuid;
begin
 for v in select id from public.organizations loop
  for t in select * from (values
   ('descarte','Descarte','#64748b'),
   ('equipamento-devolvido-sem-reparo','Equipamento Devolvido Sem Reparo','#f59e0b')
  ) as x(slug,name,color) loop
   select id into sid from public.os_situations
    where organization_id=v.id and (slug=t.slug or lower(name)=lower(t.name))
    order by created_at limit 1;
   if sid is null then
    insert into public.os_situations(organization_id,name,slug,color,sort_order,is_active)
      values(v.id,t.name,t.slug,t.color,
        coalesce((select max(sort_order)+1 from public.os_situations where organization_id=v.id),100),true)
    returning id into sid;
   end if;
   insert into public.service_type_situations(organization_id,service_type_id,situation_id,use_default_hours,sort_order)
   select st.organization_id,st.id,sid,true,
     coalesce((select max(sort_order)+1 from public.service_type_situations ss where ss.service_type_id=st.id),100)
   from public.service_types st where st.organization_id=v.id
    and not exists(select 1 from public.service_type_situations ss where ss.service_type_id=st.id and ss.situation_id=sid);
  end loop;
 end loop;
end;$seed$;

insert into public.attachment_types(organization_id,name,is_active)
select o.id,t.name,true from public.organizations o cross join
 (values('Evidência de descarte'),('Evidência de devolução')) t(name)
where not exists(select 1 from public.attachment_types a where a.organization_id=o.id and lower(a.name)=lower(t.name));

-- Assinatura dupla pelo fluxo já existente: cliente + responsável da assistência.
do $terms$
declare v record;t record; tid uuid; sid uuid; k text; idx integer;f text[];
begin
 for v in select id from public.organizations loop
  for t in select * from (values
   ('TERMO_DESCARTE','Termo de autorização de descarte',
    'Declaro, como proprietário ou responsável autorizado, que identifico o equipamento e os acessórios descritos nesta OS e AUTORIZO EXPRESSAMENTE seu encaminhamento à instituição destinatária para descarte ambientalmente adequado. Sei que a destinação efetiva é irreversível e deverá seguir a legislação aplicável. Esta autorização não concede acesso aos meus dados pessoais ou arquivos e não representa renúncia a garantias ou direitos legais. O equipamento e o destino serão conferidos pela assistência, com evidência do encaminhamento e assinatura das partes.'),
   ('TERMO_DEVOLUCAO_SEM_REPARO','Termo de devolução de equipamento sem reparo',
    'Declaro que conferi e recebi o equipamento, em condição e com acessórios identificados nesta OS, sem reparo concluído. Fui informado do motivo da devolução e pude verificar os itens recebidos e a evidência da entrega. Minha assinatura comprova o recebimento físico e as condições descritas, mas não implica renúncia a direitos de consumidor, garantia ou obrigações legalmente devidas. O representante da assistência confirma a entrega e a conferência.')
  ) as x(doc_type,title,terms) loop
   select id into tid from public.print_templates
     where organization_id=v.id and document_type=t.doc_type order by created_at limit 1;
   if tid is null then
    insert into public.print_templates(
      organization_id,name,description,document_type,is_active,paper_size,orientation,
      margin_top,margin_right,margin_bottom,margin_left,show_logo,show_company_info,
      show_page_number,show_printed_at,header_text,footer_text,
      allow_online_signature,signature_link_ttl_hours,require_external_signature,
      require_employee_signature,employee_signature_source
    ) values(v.id,t.title,'Termo de encerramento especial da ordem de serviço.',
      t.doc_type,true,'A4','portrait',12,12,12,12,true,true,true,true,
      'TERMO DE RESPONSABILIDADE E CIÊNCIA — Leia e confira os dados da OS antes de assinar.',
      t.terms,true,168,true,true,'responsible') returning id into tid;
    for k in select unnest(array['customer','equipment','order','signatures']) loop
     f:=case k
       when 'customer' then array['customer.full_name','customer.document','customer.phone','customer.email']
       when 'equipment' then array['equipment.general','equipment.accessories','equipment.condition']
       when 'order' then array['order.created_at','order.customer_notes','order.situation']
       else array['signatures.customer','signatures.employee'] end;
     insert into public.print_template_sections(organization_id,template_id,section_key,title,sort_order,columns,is_enabled)
     values(v.id,tid,k,case k when 'customer' then 'Cliente' when 'equipment' then 'Equipamento'
       when 'order' then 'Ordem de Serviço' else 'Assinaturas' end,
       case k when 'customer' then 1 when 'equipment' then 2 when 'order' then 3 else 4 end,
       case when k='signatures' then 2 else 3 end,true) returning id into sid;
     for idx in 1..array_length(f,1) loop
      insert into public.print_template_fields(template_section_id,field_key,label,sort_order,is_enabled)
      values(sid,f[idx],case f[idx]
       when 'customer.full_name' then 'Nome'
       when 'customer.document' then 'CPF / CNPJ'
       when 'customer.phone' then 'Telefone'
       when 'customer.email' then 'E-mail'
       when 'equipment.general' then 'Equipamento / marca / modelo / série'
       when 'equipment.accessories' then 'Acessórios'
       when 'equipment.condition' then 'Estado do equipamento'
       when 'order.created_at' then 'Abertura da OS'
       when 'order.customer_notes' then 'Problema informado'
       when 'order.situation' then 'Situação'
       when 'signatures.customer' then 'Assinatura do cliente'
       when 'signatures.employee' then 'Assinatura do responsável'
       else f[idx] end,idx,true);
     end loop;
    end loop;
   end if;
  end loop;
 end loop;
end;$terms$;
commit;