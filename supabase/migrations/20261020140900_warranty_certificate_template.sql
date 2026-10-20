begin;
create table if not exists public.warranty_certificate_templates (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 config jsonb not null default '{}'::jsonb check(jsonb_typeof(config)='object'),
 updated_at timestamptz not null default now()
);
alter table public.warranty_certificate_templates enable row level security;
create policy warranty_certificate_templates_read on public.warranty_certificate_templates for select to authenticated
 using (private.is_organization_member(organization_id) and (
  private.has_effective_organization_permission(organization_id,'terms.view')
  or private.has_effective_organization_permission(organization_id,'terms.manage')
  or private.has_effective_organization_permission(organization_id,'documents.print')
  or private.has_effective_organization_permission(organization_id,'orders.details.view')
  or private.has_effective_organization_permission(organization_id,'orders.complete')
 ));
create policy warranty_certificate_templates_insert on public.warranty_certificate_templates for insert to authenticated
 with check (private.is_organization_member(organization_id) and private.has_effective_organization_permission(organization_id,'terms.manage'));
create policy warranty_certificate_templates_update on public.warranty_certificate_templates for update to authenticated
 using (private.is_organization_member(organization_id) and private.has_effective_organization_permission(organization_id,'terms.manage'))
 with check (private.is_organization_member(organization_id) and private.has_effective_organization_permission(organization_id,'terms.manage'));
revoke all on public.warranty_certificate_templates from anon;
grant select,insert,update on public.warranty_certificate_templates to authenticated;
do $$ begin
 if exists(select 1 from public.service_warranty_terms limit 1)
 then raise exception 'Existem termos legados de serviços; arquive-os antes de remover a tabela.'; end if;
end $$;
drop function if exists public.save_service_warranty_term_v1(uuid,uuid,text,text,integer,boolean);
drop function if exists public.list_service_warranty_terms_v1(uuid);
drop table if exists public.service_warranty_terms;
update public.permissions set
 label=case when key='terms.view' then 'Visualizar termos e certificados' else 'Gerenciar termos e certificados' end,
 description=case when key='terms.view' then 'Permite consultar os termos da empresa e o modelo do certificado de garantia de equipamentos.'
 else 'Permite gerenciar os termos da empresa e personalizar o certificado de garantia de equipamentos.' end
 where key in ('terms.view','terms.manage');
commit;