alter table public.product_categories
  add column if not exists icon text;

comment on column public.product_categories.icon is
  'Optional Lucide icon identifier for public storefront categories.';
