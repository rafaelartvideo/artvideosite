-- O técnico não deve alterar a situação da OS nem visualizar o controle.
-- Remove autorização direta, concessões em cargos/usuários e a entrada no catálogo.
-- A alteração de situação pela OS regular permanece intacta.
begin;

revoke execute on function public.change_my_technician_order_situation_v1(uuid,uuid)
from authenticated;

delete from public.role_permissions
where permission_id in (
  select id from public.permissions where key='technician_panel.actions.change_situation'
);

delete from public.user_permission_overrides
where permission_id in (
  select id from public.permissions where key='technician_panel.actions.change_situation'
);

delete from public.permissions where key='technician_panel.actions.change_situation';

commit;
