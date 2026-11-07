-- Contagem real das fotos do produto na sessão de captura; sincronizada pelo editor.
-- A contagem de eventos enviados continua exclusiva das capturas de OS.
alter table public.device_capture_sessions
  add column if not exists product_photo_count integer not null default 0;
alter table public.device_capture_sessions
  add column if not exists product_has_cover boolean not null default false;
alter table public.device_capture_sessions
  drop constraint if exists device_capture_sessions_product_photo_count_check;
alter table public.device_capture_sessions
  add constraint device_capture_sessions_product_photo_count_check
  check (product_photo_count between 0 and 4);
comment on column public.device_capture_sessions.product_photo_count is
  'Quantidade atual de imagens únicas do produto (capa + galeria), sincronizada do formulário desktop.';
comment on column public.device_capture_sessions.product_has_cover is
  'Indica se existe capa; permite substituir a capa no celular sem consumir novo espaço.';
