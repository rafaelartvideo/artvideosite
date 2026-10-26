-- Fotos opcionais de serviço/local no mesmo bucket privado de orçamentos.
begin;
alter table public.quote_media drop constraint if exists quote_media_kind_check;
alter table public.quote_media add constraint quote_media_kind_check
  check (kind in ('equipment','label','site'));
commit;
