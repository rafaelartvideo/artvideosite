begin;

alter table public.financial_entries
  add column if not exists approval_cycle integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.financial_entries'::regclass
      and conname='financial_entries_approval_cycle_check'
  ) then
    alter table public.financial_entries
      add constraint financial_entries_approval_cycle_check check (approval_cycle >= 1);
  end if;
end $$;

create table if not exists public.financial_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  financial_entry_id uuid not null,
  approval_cycle integer not null check (approval_cycle >= 1),
  approver_user_id uuid not null references public.profiles(id) on delete restrict,
  approver_name_snapshot text not null check (btrim(approver_name_snapshot) <> ''),
  action text not null check (action in ('approve','reject')),
  approval_order smallint,
  note text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, financial_entry_id)
    references public.financial_entries(organization_id, id) on delete restrict,
  check (
    (action='approve' and approval_order between 1 and 2)
    or (action='reject' and approval_order is null)
  )
);

create index if not exists financial_approvals_entry_cycle_created_idx
  on public.financial_approvals(organization_id, financial_entry_id, approval_cycle, created_at);
create unique index if not exists financial_approvals_unique_approver_cycle_idx
  on public.financial_approvals(financial_entry_id, approval_cycle, approver_user_id)
  where action='approve';
create unique index if not exists financial_approvals_unique_order_cycle_idx
  on public.financial_approvals(financial_entry_id, approval_cycle, approval_order)
  where action='approve';

create or replace function private.can_view_financial_entry(p_organization_id uuid, p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1 from public.financial_entries e
    where e.organization_id=p_organization_id
      and e.id=p_entry_id
      and (
        (e.entry_type='receivable' and private.can_access_finance(e.organization_id,'finance.receivables.view'))
        or (e.entry_type='payable' and private.can_access_finance(e.organization_id,'finance.payables.view'))
      )
  );
$$;
revoke all on function private.can_view_financial_entry(uuid,uuid) from public;

alter table public.financial_approvals enable row level security;
revoke all on table public.financial_approvals from anon;
revoke all on table public.financial_approvals from authenticated;
grant select on table public.financial_approvals to authenticated;

drop policy if exists financial_approvals_select on public.financial_approvals;
create policy financial_approvals_select on public.financial_approvals
for select to authenticated
using (private.can_view_financial_entry(organization_id, financial_entry_id));

create or replace function public.decide_financial_entry(
  p_organization_id uuid,
  p_entry_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_action text := lower(btrim(coalesce(p_action,'')));
  v_note text := nullif(btrim(coalesce(p_note,'')),'');
  v_entry public.financial_entries%rowtype;
  v_permission_key text;
  v_approver_name text;
  v_approval_count integer;
  v_approval_order smallint;
  v_final boolean := false;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if v_action not in ('approve','reject') then raise exception 'Decisão financeira inválida.' using errcode='22023'; end if;

  select * into v_entry
  from public.financial_entries e
  where e.id=p_entry_id and e.organization_id=p_organization_id
  for update;
  if not found then raise exception 'Lançamento financeiro não encontrado.' using errcode='P0002'; end if;
  if v_entry.approval_status<>'pending' then raise exception 'Este lançamento não está pendente de aprovação.' using errcode='22023'; end if;

  v_permission_key := case when v_entry.entry_type='receivable'
    then 'finance.receivables.approve' else 'finance.payables.approve' end;
  if not private.can_access_finance(p_organization_id,v_permission_key) then
    raise exception 'Sem permissão para decidir este lançamento financeiro.' using errcode='42501';
  end if;

  select nullif(btrim(p.full_name),'') into v_approver_name
  from public.profiles p where p.id=v_user_id;
  v_approver_name := coalesce(v_approver_name,'Usuário');

  if v_action='reject' then
    if v_note is null then raise exception 'Informe o motivo da rejeição.' using errcode='22023'; end if;
    insert into public.financial_approvals(
      organization_id,financial_entry_id,approval_cycle,approver_user_id,
      approver_name_snapshot,action,approval_order,note
    ) values (
      p_organization_id,p_entry_id,v_entry.approval_cycle,v_user_id,
      v_approver_name,'reject',null,v_note
    );
    update public.financial_entries
    set approval_status='rejected',rejected_at=now(),approved_at=null,updated_by=v_user_id
    where id=p_entry_id and organization_id=p_organization_id;
    insert into public.financial_events(organization_id,financial_entry_id,event_type,event_data,created_by)
    values(p_organization_id,p_entry_id,'rejected',jsonb_build_object('approval_cycle',v_entry.approval_cycle,'note',v_note),v_user_id);
    return jsonb_build_object('status','rejected','approvals',0,'required_approvals',v_entry.required_approvals,'approval_cycle',v_entry.approval_cycle);
  end if;

  if exists (
    select 1 from public.financial_approvals a
    where a.organization_id=p_organization_id
      and a.financial_entry_id=p_entry_id
      and a.approval_cycle=v_entry.approval_cycle
      and a.action='approve'
      and a.approver_user_id=v_user_id
  ) then
    raise exception 'Este usuário já aprovou este lançamento neste ciclo.' using errcode='23505';
  end if;

  select count(*) into v_approval_count
  from public.financial_approvals a
  where a.organization_id=p_organization_id
    and a.financial_entry_id=p_entry_id
    and a.approval_cycle=v_entry.approval_cycle
    and a.action='approve';

  if v_approval_count>=v_entry.required_approvals then
    raise exception 'Este lançamento já recebeu todas as aprovações necessárias.' using errcode='22023';
  end if;

  if v_entry.required_approvals=2 and v_approval_count=1 and v_entry.created_by=v_user_id then
    raise exception 'O criador do lançamento não pode ser o segundo aprovador.' using errcode='42501';
  end if;

  v_approval_order := (v_approval_count+1)::smallint;
  insert into public.financial_approvals(
    organization_id,financial_entry_id,approval_cycle,approver_user_id,
    approver_name_snapshot,action,approval_order,note
  ) values (
    p_organization_id,p_entry_id,v_entry.approval_cycle,v_user_id,
    v_approver_name,'approve',v_approval_order,v_note
  );

  v_approval_count := v_approval_count+1;
  v_final := v_approval_count>=v_entry.required_approvals;
  if v_final then
    update public.financial_entries
    set approval_status='approved',approved_at=now(),rejected_at=null,updated_by=v_user_id
    where id=p_entry_id and organization_id=p_organization_id;
  end if;

  insert into public.financial_events(organization_id,financial_entry_id,event_type,event_data,created_by)
  values(
    p_organization_id,p_entry_id,
    case when v_final then 'approved' else 'approval_recorded' end,
    jsonb_build_object(
      'approval_cycle',v_entry.approval_cycle,
      'approval_order',v_approval_order,
      'approvals',v_approval_count,
      'required_approvals',v_entry.required_approvals,
      'note',v_note
    ),
    v_user_id
  );

  return jsonb_build_object(
    'status',case when v_final then 'approved' else 'pending' end,
    'approvals',v_approval_count,
    'required_approvals',v_entry.required_approvals,
    'approval_cycle',v_entry.approval_cycle
  );
end;
$$;

revoke all on function public.decide_financial_entry(uuid,uuid,text,text) from public;
grant execute on function public.decide_financial_entry(uuid,uuid,text,text) to authenticated;

commit;
