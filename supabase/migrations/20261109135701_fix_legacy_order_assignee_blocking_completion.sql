-- Atribuicoes antigas nao devem bloquear a conclusao financeira de uma OS.
-- Validar o responsavel na insercao ou quando a atribuicao/empresa for alterada;
-- a pessoa que conclui continua sendo validada em todas as operacoes.
create or replace function private.ensure_service_order_profile_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_validate_assignee boolean := tg_op = 'INSERT';
begin
  if new.organization_id is null then
    raise exception 'A empresa da OS é obrigatória.' using errcode = '23502';
  end if;

  if tg_op = 'UPDATE' then
    v_validate_assignee :=
      new.assigned_to is distinct from old.assigned_to
      or new.organization_id is distinct from old.organization_id;
  end if;

  if v_validate_assignee
     and new.assigned_to is not null
     and not exists (
       select 1
       from public.organization_members member
       where member.organization_id = new.organization_id
         and member.user_id = new.assigned_to
         and member.status = 'active'
     ) then
    raise exception 'O responsável vinculado não pertence à empresa da OS.'
      using errcode = '42501';
  end if;

  if new.completed_by is not null and not exists (
    select 1
    from public.organization_members member
    where member.organization_id = new.organization_id
      and member.user_id = new.completed_by
      and member.status = 'active'
  ) then
    raise exception 'O usuário da conclusão não pertence à empresa da OS.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;
