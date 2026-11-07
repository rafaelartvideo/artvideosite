-- Reutiliza as sessões temporárias da câmera com isolamento de finalidade.
-- 'product' requer permissão de escrita em estoque/produtos; sessões antigas permanecem 'order'.
begin;
alter table public.device_capture_sessions
  add column if not exists capture_context text not null default 'order';
alter table public.device_capture_sessions
  drop constraint if exists device_capture_sessions_capture_context_check;
alter table public.device_capture_sessions
  add constraint device_capture_sessions_capture_context_check check (capture_context in ('order','product'));
commit;
