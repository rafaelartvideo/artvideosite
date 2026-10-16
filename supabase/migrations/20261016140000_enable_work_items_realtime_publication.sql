-- Realtime do módulo Compromissos e Tarefas.
-- RLS existente permanece obrigatória para o recebimento dos eventos.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='work_items') then
    alter publication supabase_realtime add table public.work_items;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='work_item_checklist') then
    alter publication supabase_realtime add table public.work_item_checklist;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='work_item_activity') then
    alter publication supabase_realtime add table public.work_item_activity;
  end if;
end
$$;
