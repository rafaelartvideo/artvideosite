begin;

alter table public.inventory_items
  add column if not exists conversion_factor integer not null default 1;

update public.inventory_items
set conversion_factor = 1
where conversion_factor is null or conversion_factor < 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_items_conversion_factor_positive'
      and conrelid = 'public.inventory_items'::regclass
  ) then
    alter table public.inventory_items
      add constraint inventory_items_conversion_factor_positive
      check (conversion_factor >= 1);
  end if;
end $$;

comment on column public.inventory_items.conversion_factor is
  'Quantidade de unidades contidas em uma unidade de estoque. Para un = 1; para cx = quantidade exata de unidades por caixa.';

commit;
