-- Permite consultar os expedientes pela Agenda sem exigir acesso de edição de OS.
-- Mantém o isolamento por empresa e a permissão agenda.view_others.
begin;

drop policy if exists employee_schedule_agenda_calendar_read on public.employee_work_schedules;

create policy employee_schedule_agenda_calendar_read
on public.employee_work_schedules
for select to authenticated
using (
  (select auth.uid()) is not null
  and (
    private.has_effective_organization_permission(organization_id, 'agenda.view')
    or private.has_effective_organization_permission(organization_id, 'agenda.create')
  )
  and exists (
    select 1
    from public.employees employee
    where employee.id = employee_work_schedules.employee_id
      and employee.organization_id = employee_work_schedules.organization_id
      and (
        private.has_effective_organization_permission(organization_id, 'agenda.view_others')
        or employee.profile_id = (select auth.uid())
      )
  )
);

commit;
