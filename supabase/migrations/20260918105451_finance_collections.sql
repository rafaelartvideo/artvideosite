begin;

select pg_advisory_xact_lock(hashtextextended('artvideo:finance_collections', 0));

create table public.financial_collection_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  financial_entry_id uuid not null,
  financial_installment_id uuid,
  channel text not null check (channel in ('phone','whatsapp','email','sms','in_person','other')),
  note text not null check (btrim(note)<>''),
  contacted_at timestamptz not null default now(),
  next_follow_up_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,financial_entry_id)
    references public.financial_entries(organization_id,id) on delete restrict,
  foreign key (organization_id,financial_installment_id)
    references public.financial_installments(organization_id,id) on delete restrict
);

create index financial_collection_logs_entry_idx
  on public.financial_collection_logs(organization_id,financial_entry_id,contacted_at desc);
create index financial_collection_logs_followup_idx
  on public.financial_collection_logs(organization_id,next_follow_up_at)
  where next_follow_up_at is not null;

alter table public.financial_collection_logs enable row level security;
revoke all on table public.financial_collection_logs from anon,authenticated;
grant select on table public.financial_collection_logs to authenticated;

create policy financial_collection_logs_select on public.financial_collection_logs
for select to authenticated
using (
  (
    private.can_access_finance(organization_id,'finance.collections.view')
    or private.can_access_finance(organization_id,'finance.collections.create')
  )
  and private.can_view_financial_entry(organization_id,financial_entry_id)
);

create or replace function public.register_financial_collection_log(
  p_organization_id uuid,
  p_entry_id uuid,
  p_installment_id uuid,
  p_channel text,
  p_note text,
  p_contacted_at timestamptz default now(),
  p_next_follow_up_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid:=auth.uid();
  v_entry public.financial_entries%rowtype;
  v_channel text:=lower(btrim(coalesce(p_channel,'')));
  v_note text:=nullif(btrim(coalesce(p_note,'')),'');
  v_id uuid;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if not private.can_access_finance(p_organization_id,'finance.collections.create') then
    raise exception 'Sem permissão para registrar cobranças.' using errcode='42501';
  end if;
  if v_channel not in ('phone','whatsapp','email','sms','in_person','other') then
    raise exception 'Canal de cobrança inválido.' using errcode='22023';
  end if;
  if v_note is null then raise exception 'Informe a observação da cobrança.' using errcode='22023'; end if;
  if p_next_follow_up_at is not null and p_next_follow_up_at<p_contacted_at then
    raise exception 'O próximo retorno não pode ser anterior ao contato.' using errcode='22023';
  end if;

  select * into v_entry
  from public.financial_entries e
  where e.organization_id=p_organization_id and e.id=p_entry_id;
  if not found then raise exception 'Lançamento financeiro não encontrado.' using errcode='P0002'; end if;
  if v_entry.entry_type<>'receivable' then
    raise exception 'Cobranças só podem ser registradas em Contas a Receber.' using errcode='22023';
  end if;

  if p_installment_id is not null and not exists(
    select 1 from public.financial_installments i
    where i.organization_id=p_organization_id
      and i.id=p_installment_id
      and i.financial_entry_id=p_entry_id
  ) then raise exception 'A parcela informada não pertence ao lançamento.' using errcode='23503'; end if;

  insert into public.financial_collection_logs(
    organization_id,financial_entry_id,financial_installment_id,
    channel,note,contacted_at,next_follow_up_at,created_by
  ) values (
    p_organization_id,p_entry_id,p_installment_id,
    v_channel,v_note,coalesce(p_contacted_at,now()),p_next_follow_up_at,v_user_id
  ) returning id into v_id;

  insert into public.financial_events(organization_id,financial_entry_id,event_type,event_data,created_by)
  values(p_organization_id,p_entry_id,'collection_recorded',jsonb_build_object(
    'collection_log_id',v_id,'channel',v_channel,'next_follow_up_at',p_next_follow_up_at
  ),v_user_id);

  return v_id;
end;
$$;

revoke all on function public.register_financial_collection_log(uuid,uuid,uuid,text,text,timestamptz,timestamptz) from public,anon;
grant execute on function public.register_financial_collection_log(uuid,uuid,uuid,text,text,timestamptz,timestamptz) to authenticated;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p2.id
from public.role_permissions rp
join public.permissions p1 on p1.id=rp.permission_id
join public.permissions p2 on p2.key in ('finance.collections.view','finance.collections.create')
where p1.key in ('finance.settings.manage','roles.permissions.manage')
on conflict (role_id,permission_id) do nothing;

commit;
