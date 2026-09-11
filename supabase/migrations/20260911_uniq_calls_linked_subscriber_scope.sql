begin;

-- A chamada Uniq é individual por vínculo de funcionário. Permissões genéricas
-- do painel não devem liberar a visualização de chamadas de outros assinantes.
drop policy if exists uniq_calls_artvideo_members_select on public.uniq_calls;
drop policy if exists uniq_calls_linked_employee_select on public.uniq_calls;

create policy uniq_calls_linked_employee_select
on public.uniq_calls
for select
to authenticated
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and nullif(btrim(answered_subscriber_id), '') is not null
  and exists (
    select 1
    from public.employees employee
    where employee.organization_id = uniq_calls.organization_id
      and employee.profile_id = (select auth.uid())
      and coalesce(employee.is_active, true)
      and nullif(btrim(employee.uniq_subscriber_id), '') = nullif(btrim(uniq_calls.answered_subscriber_id), '')
  )
);

comment on policy uniq_calls_linked_employee_select on public.uniq_calls is
  'Permite ao funcionário autenticado ler apenas chamadas atendidas pelo assinante Uniq explicitamente vinculado ao seu cadastro.';

commit;
