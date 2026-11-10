begin;
-- Atualização imediata das listas de Vendas sem expor dados entre empresas.
-- A consulta original de detalhes continua protegida por RPC e permissões.
do $sales_realtime$
begin
  if not exists(select 1 from pg_policies
    where schemaname='public' and tablename='sales_proposals'
      and policyname='sales_proposals_read') then
    create policy sales_proposals_read on public.sales_proposals
      for select to authenticated
      using (
        (select auth.uid()) is not null
        and private.has_tenant_module_permission(
          organization_id, 'sales', 'sales.view'
        )
      );
  end if;
  grant select on public.sales_proposals to authenticated;

  if not exists(select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public'
      and tablename='sales_orders') then
    alter publication supabase_realtime add table public.sales_orders;
  end if;
  if not exists(select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public'
      and tablename='sales_proposals') then
    alter publication supabase_realtime add table public.sales_proposals;
  end if;
end
$sales_realtime$;
commit;