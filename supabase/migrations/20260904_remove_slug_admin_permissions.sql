begin;

-- Slugs são internos e gerados automaticamente. Eles não são mais exibidos
-- nem configuráveis nas tabelas administrativas de Categorias e Situações.
delete from public.role_permissions
where permission_id in (
  select id
  from public.permissions
  where key in (
    'categories.table.slug',
    'situations.table.slug'
  )
);

delete from public.permissions
where key in (
  'categories.table.slug',
  'situations.table.slug'
);

commit;
