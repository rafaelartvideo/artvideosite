begin;

alter table public.inventory_items
  add column if not exists storage_shelf text,
  add column if not exists storage_level text,
  add column if not exists storage_compartment text;

comment on column public.inventory_items.storage_shelf is
  'Estante física onde a peça está armazenada. Aceita letras e números.';
comment on column public.inventory_items.storage_level is
  'Prateleira física onde a peça está armazenada. Aceita letras e números.';
comment on column public.inventory_items.storage_compartment is
  'Compartimento físico onde a peça está armazenada. Aceita letras e números.';

commit;
