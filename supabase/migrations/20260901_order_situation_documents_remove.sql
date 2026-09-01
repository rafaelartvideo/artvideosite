begin;

insert into public.permissions (
  key,
  label,
  description,
  module_name,
  sort_order
)
values (
  'orders.documents.remove',
  'Remover documentos da OS',
  'Permite remover documentos e imagens anexados às situações da OS.',
  'Ordens de Serviço — Documentos',
  1299
)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

create or replace function public.remove_service_order_situation_media(
  p_link_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_link public.service_order_situation_media%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not private.has_permission('orders.documents.remove') then
    raise exception 'Você não possui permissão para remover documentos da OS.';
  end if;

  select *
    into v_link
  from public.service_order_situation_media
  where id = p_link_id;

  if not found then
    raise exception 'Documento não encontrado.';
  end if;

  if not private.can_view_service_order(v_link.service_order_id) then
    raise exception 'Você não possui acesso a esta OS.';
  end if;

  delete from public.service_order_situation_media
  where id = p_link_id;

  return p_link_id;
end;
$$;

revoke all on function public.remove_service_order_situation_media(uuid)
from public;

grant execute on function public.remove_service_order_situation_media(uuid)
to authenticated;

commit;
