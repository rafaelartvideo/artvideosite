-- Leitura estritamente gerencial para os três dados auxiliares do resumo.
-- RLS permanece habilitada; operadores sem whatsapp.inbox.manage não recebem acesso.
BEGIN;
GRANT SELECT ON TABLE public.union_whatsapp_departments,
  public.union_whatsapp_handoffs,
  public.union_whatsapp_queue_settings TO authenticated;

CREATE POLICY dashboard_attendance_manager_read_departments
ON public.union_whatsapp_departments FOR SELECT TO authenticated
USING (
  private.has_tenant_module_permission(organization_id,'whatsapp','whatsapp.inbox.view')
  AND private.has_tenant_module_permission(organization_id,'whatsapp','whatsapp.inbox.manage')
);
CREATE POLICY dashboard_attendance_manager_read_handoffs
ON public.union_whatsapp_handoffs FOR SELECT TO authenticated
USING (
  private.has_tenant_module_permission(organization_id,'whatsapp','whatsapp.inbox.view')
  AND private.has_tenant_module_permission(organization_id,'whatsapp','whatsapp.inbox.manage')
);
CREATE POLICY dashboard_attendance_manager_read_queue_settings
ON public.union_whatsapp_queue_settings FOR SELECT TO authenticated
USING (
  private.has_tenant_module_permission(organization_id,'whatsapp','whatsapp.inbox.view')
  AND private.has_tenant_module_permission(organization_id,'whatsapp','whatsapp.inbox.manage')
);
COMMIT;