drop policy if exists checklist_profiles_select on public.checklist_profiles;
create policy checklist_profiles_select on public.checklist_profiles
for select to authenticated
using (
  private.can_manage_own_operation_config(organization_id, 'checklists', 'checklists.view')
  or private.can_manage_own_operation_config(organization_id, 'checklists', 'checklists.manage')
  or private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.view')
);

drop policy if exists checklist_profile_stages_select on public.checklist_profile_stages;
create policy checklist_profile_stages_select on public.checklist_profile_stages
for select to authenticated
using (
  private.can_manage_own_operation_config(organization_id, 'checklists', 'checklists.view')
  or private.can_manage_own_operation_config(organization_id, 'checklists', 'checklists.manage')
  or private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.view')
);
