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
  converted_at timestamptz,
  converted_by uuid references public.profiles(id) on delete set null,
  order_id uuid references public.service_orders(id) on delete restrict,
  payload jsonb,
  images jsonb not null default '[]'::jsonb,
  constraint order_intake_image_limit check (jsonb_typeof(images)='array' and jsonb_array_length(images)<=5)
);
create index order_intake_org_created_idx on public.order_intake_requests(organization_id, created_at desc);
create index order_intake_conversation_idx on public.order_intake_requests(organization_id, conversation_id, created_at desc);
alter table public.order_intake_requests enable row level security;
revoke all on public.order_intake_requests from public, anon, authenticated;
grant select,insert,update,delete on public.order_intake_requests to service_role;

-- The normal atomic OS creation uses the intake UUID as the idempotency key.
-- Marking conversion inside that same transaction prevents double numbering.
create or replace function private.mark_order_intake_converted()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.order_intake_requests r where r.id=new.id) then
    update public.order_intake_requests
       set status='converted', order_id=new.id, converted_at=now(), converted_by=auth.uid()
     where id=new.id and organization_id=new.organization_id and status='received';
    if not found then raise exception 'Pré-OS indisponível para conversão.' using errcode='23514'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.mark_order_intake_converted() from public,anon,authenticated;
create trigger mark_order_intake_converted after insert on public.service_orders
for each row execute function private.mark_order_intake_converted();
commit;
