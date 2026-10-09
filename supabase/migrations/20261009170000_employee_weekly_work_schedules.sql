-- Expediente semanal dos técnicos por empresa.
BEGIN;
CREATE TABLE IF NOT EXISTS public.employee_work_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  is_available boolean NOT NULL DEFAULT false,
  start_time time NOT NULL DEFAULT '08:00',
  end_time time NOT NULL DEFAULT '18:00',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_work_schedule_hours CHECK (NOT is_available OR end_time > start_time),
  CONSTRAINT employee_work_schedule_unique UNIQUE (organization_id, employee_id, weekday)
);
CREATE INDEX IF NOT EXISTS employee_work_schedules_lookup_idx
  ON public.employee_work_schedules (organization_id, employee_id);
ALTER TABLE public.employee_work_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_work_schedules FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.employee_work_schedules TO authenticated;

CREATE POLICY employee_schedule_read ON public.employee_work_schedules FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.organization_id = employee_work_schedules.organization_id)
  AND (
    private.has_effective_organization_permission(organization_id, 'orders.create')
    OR private.has_effective_organization_permission(organization_id, 'orders.edit')
    OR private.has_effective_organization_permission(organization_id, 'orders.assign')
    OR private.has_effective_organization_permission(organization_id, 'employees.view')
    OR private.has_effective_organization_permission(organization_id, 'employees.edit')
    OR private.has_effective_organization_permission(organization_id, 'customers.edit')
  )
);
CREATE POLICY employee_schedule_insert ON public.employee_work_schedules FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.organization_id = employee_work_schedules.organization_id)
  AND (
    private.has_effective_organization_permission(organization_id, 'employees.edit')
    OR private.has_effective_organization_permission(organization_id, 'customers.edit')
  )
);
CREATE POLICY employee_schedule_update ON public.employee_work_schedules FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.organization_id = employee_work_schedules.organization_id)
  AND (
    private.has_effective_organization_permission(organization_id, 'employees.edit')
    OR private.has_effective_organization_permission(organization_id, 'customers.edit')
  )
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.organization_id = employee_work_schedules.organization_id)
  AND (
    private.has_effective_organization_permission(organization_id, 'employees.edit')
    OR private.has_effective_organization_permission(organization_id, 'customers.edit')
  )
);
COMMIT;
