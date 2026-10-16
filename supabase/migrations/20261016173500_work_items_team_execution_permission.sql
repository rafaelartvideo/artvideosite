-- Distinguish activity management from performing an assigned activity.
-- Team execution is an explicit opt-in; no existing role inherits it automatically.
INSERT INTO public.permissions (key,label,description,module_name,sort_order)
VALUES ('work_items.execute_team','Executar tarefas da equipe',
  'Permite ao gestor iniciar, alterar andamento, concluir e marcar etapas de tarefas atribuídas a outros funcionários.',
  'Compromissos e Tarefas',3264)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, description=EXCLUDED.description, module_name=EXCLUDED.module_name,sort_order=EXCLUDED.sort_order;

CREATE OR REPLACE FUNCTION private.can_execute_work_item(
  p_organization_id uuid, p_assignees uuid[]
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND private.has_tenant_module_permission(p_organization_id,'work_items','work_items.view')
    AND (
      private.is_work_item_assignee(p_organization_id,p_assignees)
      OR (
        private.has_tenant_module_permission(p_organization_id,'work_items','work_items.manage')
        AND private.has_tenant_module_permission(p_organization_id,'work_items','work_items.execute_team')
      )
    );
$$;
REVOKE ALL ON FUNCTION private.can_execute_work_item(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.can_execute_work_item(uuid,uuid[]) TO authenticated;

DROP POLICY IF EXISTS work_items_update ON public.work_items;
CREATE POLICY work_items_update ON public.work_items FOR UPDATE TO authenticated
USING (
  (private.has_tenant_module_permission(organization_id,'work_items','work_items.edit') AND
    (private.has_tenant_module_permission(organization_id,'work_items','work_items.manage')
      OR created_by=(SELECT auth.uid())
      OR private.is_work_item_assignee(organization_id,assigned_employee_ids)))
  OR private.can_execute_work_item(organization_id,assigned_employee_ids)
)
WITH CHECK (
  (private.has_tenant_module_permission(organization_id,'work_items','work_items.edit') AND
    (private.has_tenant_module_permission(organization_id,'work_items','work_items.manage')
      OR created_by=(SELECT auth.uid())
      OR private.is_work_item_assignee(organization_id,assigned_employee_ids)))
  OR private.can_execute_work_item(organization_id,assigned_employee_ids)
);

CREATE OR REPLACE FUNCTION private.enforce_work_item_execution_permission()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  v_can_edit boolean;
  v_metadata_changed boolean;
BEGIN
  v_can_edit := private.has_tenant_module_permission(old.organization_id,'work_items','work_items.edit')
    AND (private.has_tenant_module_permission(old.organization_id,'work_items','work_items.manage')
      OR old.created_by=auth.uid()
      OR private.is_work_item_assignee(old.organization_id,old.assigned_employee_ids));
  IF old.status IS DISTINCT FROM new.status OR old.outcome IS DISTINCT FROM new.outcome THEN
    IF NOT private.can_execute_work_item(old.organization_id,old.assigned_employee_ids) THEN
      RAISE EXCEPTION 'Apenas responsáveis designados ou gestores autorizados podem executar ou concluir esta atividade.'
        USING ERRCODE='42501';
    END IF;
  END IF;
  -- A team performer without edit permission may change ONLY status/outcome.
  -- Lifecycle timestamps are populated by the existing work_item_before_write trigger.
  v_metadata_changed := (
    to_jsonb(old) - ARRAY['status','outcome','updated_at','completed_at','completed_by']
  ) IS DISTINCT FROM (
    to_jsonb(new) - ARRAY['status','outcome','updated_at','completed_at','completed_by']
  );
  IF v_metadata_changed AND NOT v_can_edit THEN
    RAISE EXCEPTION 'Sem permissão para editar os dados desta atividade.' USING ERRCODE='42501';
  END IF;
  RETURN new;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_work_item_execution_permission() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS work_item_execution_permission ON public.work_items;
CREATE TRIGGER work_item_execution_permission BEFORE UPDATE ON public.work_items
FOR EACH ROW EXECUTE FUNCTION private.enforce_work_item_execution_permission();

DROP POLICY IF EXISTS work_item_checklist_update ON public.work_item_checklist;
CREATE POLICY work_item_checklist_update ON public.work_item_checklist FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.work_items w
  WHERE w.id=work_item_id AND w.organization_id=work_item_checklist.organization_id
    AND (
      private.has_tenant_module_permission(w.organization_id,'work_items','work_items.edit')
      OR private.can_execute_work_item(w.organization_id,w.assigned_employee_ids)
    )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.work_items w
  WHERE w.id=work_item_id AND w.organization_id=work_item_checklist.organization_id
    AND (
      private.has_tenant_module_permission(w.organization_id,'work_items','work_items.edit')
      OR private.can_execute_work_item(w.organization_id,w.assigned_employee_ids)
    )
));

CREATE OR REPLACE FUNCTION private.enforce_work_item_checklist_execution()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_item public.work_items%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM public.work_items
  WHERE id=old.work_item_id AND organization_id=old.organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Atividade indisponível.' USING ERRCODE='42501'; END IF;
  IF old.done IS DISTINCT FROM new.done
    AND NOT private.can_execute_work_item(v_item.organization_id,v_item.assigned_employee_ids) THEN
    RAISE EXCEPTION 'Apenas responsáveis designados ou gestores autorizados podem concluir etapas.'
      USING ERRCODE='42501';
  END IF;
  IF (to_jsonb(old)-ARRAY['done','updated_at']) IS DISTINCT FROM
      (to_jsonb(new)-ARRAY['done','updated_at'])
    AND NOT (
      private.has_tenant_module_permission(v_item.organization_id,'work_items','work_items.edit')
      AND (private.has_tenant_module_permission(v_item.organization_id,'work_items','work_items.manage')
        OR v_item.created_by=auth.uid()
        OR private.is_work_item_assignee(v_item.organization_id,v_item.assigned_employee_ids))
    ) THEN
    RAISE EXCEPTION 'Sem permissão para editar as etapas.' USING ERRCODE='42501';
  END IF;
  RETURN new;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_work_item_checklist_execution() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS work_item_checklist_execution_permission ON public.work_item_checklist;
CREATE TRIGGER work_item_checklist_execution_permission BEFORE UPDATE ON public.work_item_checklist
FOR EACH ROW EXECUTE FUNCTION private.enforce_work_item_checklist_execution();
