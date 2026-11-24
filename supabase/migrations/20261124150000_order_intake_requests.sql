-- Pré-OS Digital: nenhum acesso direto do navegador público ao banco.
begin;
create table public.order_intake_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  conversation_id uuid not null references public.union_whatsapp_conversations(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  phone text not null check (phone ~ '^[0-9]{12,13}$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'sent' check (status in ('sent','filling','submitting','received','converted','cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '48 hours',
  submitted_at timestamptz,
  upload_attempt uuid,
  upload_started_at timestamptz,
  converted_at timestamptz,
  converted_by uuid references public.profiles(id) on delete set null,
  order_id uuid references public.service_orders(id) on delete restrict,
  payload jsonb,
  images jsonb not null default '[]'::jsonb,
  constraint order_intake_image_limit check (jsonb_typeof(images)='array' and jsonb_array_length(images)<=5)
);
-- Serialize link creation and cap issuance for each conversation and operator.
create or replace function private.guard_order_intake_issuance()
returns trigger language plpgsql security definer set search_path='' as $guard$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.organization_id::text||':'||new.created_by::text,0));
  if (select count(*) from public.order_intake_requests r where r.organization_id=new.organization_id and r.created_by=new.created_by and r.created_at>now()-interval '1 hour')>=30 then
    raise exception 'Limite temporário de links atingido.' using errcode='23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.organization_id::text||':'||new.conversation_id::text||':conversation',0));
  if (select count(*) from public.order_intake_requests r where r.organization_id=new.organization_id and r.conversation_id=new.conversation_id and r.status in ('sent','filling','submitting') and r.expires_at>now())>=5 then
    raise exception 'Limite de links pendentes atingido.' using errcode='23514';
  end if;
  return new;
end;
$guard$;
revoke all on function private.guard_order_intake_issuance() from public,anon,authenticated;
create trigger guard_order_intake_issuance before insert on public.order_intake_requests
for each row execute function private.guard_order_intake_issuance();
create index order_intake_creator_created_idx on public.order_intake_requests(organization_id,created_by,created_at desc);
create index order_intake_org_created_idx on public.order_intake_requests(organization_id, created_at desc);
create index order_intake_conversation_idx on public.order_intake_requests(organization_id, conversation_id, created_at desc);
alter table public.order_intake_requests enable row level security;
create index order_intake_images_idx on public.order_intake_requests using gin(images jsonb_path_ops);
revoke all on public.order_intake_requests from public, anon, authenticated;
grant select,insert,update,delete on public.order_intake_requests to service_role;

-- The normal atomic OS creation uses the intake UUID as the idempotency key.
-- Marking conversion inside that same transaction prevents double numbering.
create or replace function private.mark_order_intake_converted()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.order_intake_requests r where r.id=new.id) then
    update public.order_intake_requests r
       set status='converted', order_id=new.id, converted_at=now(), converted_by=auth.uid()
     where r.id=new.id and r.organization_id=new.organization_id and r.status='received'
       and private.has_effective_organization_permission(new.organization_id,'orders.create')
       and (created_by=auth.uid() or private.has_effective_organization_permission(new.organization_id,'orders.view_all'))
       and exists(select 1 from public.customers c where c.id=new.customer_id and c.organization_id=new.organization_id
         and regexp_replace(coalesce(case when length(r.payload->>'document')=11 then c.document else c.cnpj end,''),'[^0-9]','','g')=r.payload->>'document');
    if not found then raise exception 'Pré-OS indisponível para conversão.' using errcode='23514'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.mark_order_intake_converted() from public,anon,authenticated;
create trigger mark_order_intake_converted after insert on public.service_orders
for each row execute function private.mark_order_intake_converted();
-- Only metadata is published; no CPF, phone, address, token, image or problem text.
create table public.order_intake_events (
  request_id uuid primary key references public.order_intake_requests(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  conversation_id uuid not null,
  created_by uuid not null,
  status text not null,
  updated_at timestamptz not null default now()
);
alter table public.order_intake_events enable row level security;
revoke all on public.order_intake_events from public,anon,authenticated;
grant select on public.order_intake_events to authenticated;
create policy order_intake_events_select on public.order_intake_events for select to authenticated using (
  private.has_effective_organization_permission(organization_id,'orders.create')
  and private.has_effective_organization_permission(organization_id,'orders.view')
  and (created_by=auth.uid() or private.has_effective_organization_permission(organization_id,'orders.view_all'))
);
create index order_intake_events_scope_idx on public.order_intake_events(organization_id,created_by,status);
create or replace function private.publish_order_intake_event()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if TG_OP='UPDATE' then if old.status=new.status then return new; end if; end if;
  insert into public.order_intake_events(request_id,organization_id,conversation_id,created_by,status,updated_at)
  values(new.id,new.organization_id,new.conversation_id,new.created_by,new.status,now())
  on conflict(request_id) do update set status=excluded.status,updated_at=excluded.updated_at;
  return new;
end;
$function$;
revoke all on function private.publish_order_intake_event() from public,anon,authenticated;
create trigger publish_order_intake_event after insert or update of status on public.order_intake_requests
for each row execute function private.publish_order_intake_event();
alter publication supabase_realtime add table public.order_intake_events;
-- Authorize only intake images already visible to the reviewer, including the
-- brief transactional interval between inserting the OS and linking its media.
create or replace function private.can_read_order_intake_media(p_media_id uuid,p_org uuid)
returns boolean language sql stable security definer set search_path='' as $media$
  select auth.uid() is not null
    and private.has_effective_organization_permission(p_org,'orders.create')
    and private.has_effective_organization_permission(p_org,'orders.view')
    and exists (
      select 1 from public.order_intake_requests r
      where r.organization_id=p_org
        and r.status in ('received','converted')
        and (r.created_by=auth.uid() or private.has_effective_organization_permission(p_org,'orders.view_all'))
        and (r.status='received' or private.can_view_service_order(r.order_id))
        and r.images @> jsonb_build_array(jsonb_build_object('mediaId',p_media_id::text))
    );
$media$;
revoke all on function private.can_read_order_intake_media(uuid,uuid) from public,anon,authenticated;
grant execute on function private.can_read_order_intake_media(uuid,uuid) to authenticated;
create policy media_order_intake_reviewer_select on public.media for select to authenticated
using (bucket_id='service-images' and storage_path like 'orders/%/draft/pre-os-%'
  and private.can_read_order_intake_media(id,organization_id));
-- Received requests are not orphans merely because they have no OS yet.
-- Preserve the maintenance function's existing filters and grants.
do $maintenance$
declare v_definition text; v_anchor text := '    and not exists (select 1 from public.service_order_media x where x.media_id = m.id)';
begin
  select pg_get_functiondef('public.media_maintenance_orphan_candidates(integer,interval)'::regprocedure) into v_definition;
  if position(v_anchor in v_definition)=0 then raise exception 'Unexpected media maintenance definition'; end if;
  execute replace(v_definition,v_anchor,v_anchor||E'\n    and not exists (select 1 from public.order_intake_requests r where r.organization_id=m.organization_id and r.status=''received'' and r.images @> jsonb_build_array(jsonb_build_object(''mediaId'',m.id::text)))');
end;
$maintenance$;
commit;
