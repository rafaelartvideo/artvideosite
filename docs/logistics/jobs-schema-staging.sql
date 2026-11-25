-- Schema para staging, executar DEPOIS de fleet-schema-staging.sql.
-- Não modifica a situação técnica, estoque ou financeiro da OS.
begin;
create unique index if not exists logistics_shift_org_id_uidx on public.logistics_shifts(organization_id,id);
create unique index if not exists logistics_order_org_id_uidx on public.service_orders(organization_id,id);
create table public.logistics_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  order_id uuid not null,
  kind text not null check(kind in ('pickup','delivery')),
  status text not null default 'requested' check(status in ('requested','assigned','loaded','arrived','collected','received','delivered','cancelled')),
  address text not null check(length(btrim(address)) between 5 and 1000),
  window_start timestamptz not null,
  window_end timestamptz not null check(window_end > window_start),
  shift_id uuid,
  order_number text,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  assigned_at timestamptz,
  loaded_at timestamptz,
  arrived_at timestamptz,
  collected_at timestamptz,
  finished_at timestamptz,
  last_actor uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  recipient text check(length(recipient) <= 200),
  notes text check(length(notes) <= 1000),
  events jsonb not null default '[]'::jsonb check(jsonb_typeof(events)='array'),
  foreign key(organization_id,order_id) references public.service_orders(organization_id,id) on delete restrict,
  foreign key(organization_id,shift_id) references public.logistics_shifts(organization_id,id) on delete restrict
);
create unique index logistics_jobs_unique_open on public.logistics_jobs(organization_id,order_id) where status not in ('received','delivered','cancelled');
create index logistics_jobs_org_window on public.logistics_jobs(organization_id,window_start);
create index logistics_jobs_order on public.logistics_jobs(organization_id,order_id,created_at desc);
create index logistics_jobs_shift on public.logistics_jobs(organization_id,shift_id) where shift_id is not null;
alter table public.logistics_jobs enable row level security;
revoke all on public.logistics_jobs from public,anon,authenticated;
grant select on public.logistics_jobs to authenticated;
grant insert(organization_id,order_id,kind,address,window_start,window_end) on public.logistics_jobs to authenticated;
grant update(status,shift_id,recipient,notes) on public.logistics_jobs to authenticated;
create policy logistics_jobs_read on public.logistics_jobs for select to authenticated using (
  private.can_access_field_tracking(organization_id,'field_tracking.view') and private.can_access_field_tracking(organization_id,'field_tracking.manage')
);
create policy logistics_jobs_insert on public.logistics_jobs for insert to authenticated with check (
  private.can_access_field_tracking(organization_id,'field_tracking.view') and private.can_access_field_tracking(organization_id,'field_tracking.manage')
  and exists(select 1 from public.service_orders o where o.organization_id=logistics_jobs.organization_id and o.id=logistics_jobs.order_id)
);
create policy logistics_jobs_update on public.logistics_jobs for update to authenticated using (
  private.can_access_field_tracking(organization_id,'field_tracking.view') and private.can_access_field_tracking(organization_id,'field_tracking.manage')
) with check (
  private.can_access_field_tracking(organization_id,'field_tracking.view') and private.can_access_field_tracking(organization_id,'field_tracking.manage')
);
create function private.validate_logistics_job() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then
    select o.os_number into new.order_number from public.service_orders o where o.organization_id=new.organization_id and o.id=new.order_id;
    if not found then raise exception 'OS não disponível nesta empresa.'; end if;
    new.events := jsonb_build_array(jsonb_build_object('status','requested','at',now(),'actor',auth.uid()));
    return new;
  end if;
  if old.status in ('received','delivered','cancelled') then raise exception 'Operação já encerrada.'; end if;
  if new.status=old.status then raise exception 'Informe a próxima etapa.'; end if;
  if not (
    (old.status='requested' and new.status in ('assigned','cancelled')) or
    (old.status='assigned' and new.status='cancelled') or
    (old.kind='pickup' and old.status='assigned' and new.status='arrived') or
    (old.kind='pickup' and old.status='arrived' and new.status='collected') or
    (old.kind='pickup' and old.status='collected' and new.status='received') or
    (old.kind='delivery' and old.status='assigned' and new.status='loaded') or
    (old.kind='delivery' and old.status='loaded' and new.status='arrived') or
    (old.kind='delivery' and old.status='arrived' and new.status='delivered')
  ) then raise exception 'Transição logística inválida.'; end if;
  if new.status='assigned' then
    perform 1 from public.logistics_shifts s where s.organization_id=new.organization_id and s.id=new.shift_id and s.ended_at is null for share;
    if not found then raise exception 'Selecione uma jornada aberta.'; end if;
    new.assigned_at := now();
  elsif new.shift_id is distinct from old.shift_id then raise exception 'Não é permitido trocar a jornada nesta etapa.';
  end if;
  if new.status='cancelled' and length(btrim(coalesce(new.notes,'')))=0 then raise exception 'Informe o motivo do cancelamento.'; end if;
  if new.status in ('collected','received','delivered','loaded') and length(btrim(coalesce(new.recipient,'')))=0 then raise exception 'Informe quem entregou ou recebeu o aparelho.'; end if;
  if new.status='loaded' then new.loaded_at:=now(); end if;
  if new.status='arrived' then new.arrived_at:=now(); end if;
  if new.status='collected' then new.collected_at:=now(); end if;
  if new.status in ('received','delivered','cancelled') then new.finished_at:=now(); end if;
  new.last_actor:=auth.uid();
  new.events := old.events || jsonb_build_array(jsonb_build_object('status',new.status,'at',now(),'actor',auth.uid(),'recipient',case when new.status in ('loaded','collected','received','delivered') then new.recipient else null end,'notes',new.notes));
  return new;
end $$;
create trigger logistics_job_validation before insert or update on public.logistics_jobs for each row execute function private.validate_logistics_job();
revoke all on function private.validate_logistics_job() from public,anon,authenticated;
-- Guarda a jornada aberta até resolver todas as operações atribuídas.
create function private.guard_logistics_shift_close() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from public.logistics_jobs j where j.organization_id=old.organization_id and j.shift_id=old.id and j.status not in ('received','delivered','cancelled')) then
    raise exception 'Existem coletas ou entregas pendentes nesta jornada.';
  end if;
  return new;
end $$;
create trigger logistics_shift_close_guard before update on public.logistics_shifts for each row execute function private.guard_logistics_shift_close();
revoke all on function private.guard_logistics_shift_close() from public,anon,authenticated;
commit;
