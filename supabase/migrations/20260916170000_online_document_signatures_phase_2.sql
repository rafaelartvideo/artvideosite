begin;

create unique index if not exists service_orders_id_organization_uidx
  on public.service_orders(id, organization_id);
create unique index if not exists print_templates_id_organization_uidx
  on public.print_templates(id, organization_id);
create unique index if not exists employee_signatures_id_organization_uidx
  on public.employee_signatures(id, organization_id);

create table if not exists public.document_signature_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  service_order_id uuid not null,
  print_template_id uuid not null,
  status text not null default 'pending',
  token_hash text not null unique,
  token_ciphertext text not null,
  token_iv text not null,
  verification_code text not null unique,
  expires_at timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  first_viewed_at timestamptz,
  signed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  supersedes_request_id uuid references public.document_signature_requests(id) on delete restrict,
  require_external_signature boolean not null default true,
  require_employee_signature boolean not null default false,
  external_signer_type text,
  external_signer_name text,
  external_signer_email text,
  external_signer_phone text,
  external_document_hmac text,
  external_document_masked text,
  employee_entity_id uuid,
  employee_signature_id uuid,
  template_name_snapshot text not null,
  order_number_snapshot text not null,
  document_snapshot jsonb not null,
  snapshot_hash text not null,
  snapshot_html_storage_path text not null,
  employee_signature_storage_path text,
  final_pdf_storage_path text,
  final_pdf_hash text,
  consent_text_snapshot text not null,
  last_email_sent_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint document_signature_requests_order_fkey
    foreign key (service_order_id, organization_id)
    references public.service_orders(id, organization_id)
    on delete restrict,
  constraint document_signature_requests_template_fkey
    foreign key (print_template_id, organization_id)
    references public.print_templates(id, organization_id)
    on delete restrict,
  constraint document_signature_requests_employee_entity_fkey
    foreign key (employee_entity_id, organization_id)
    references public.entities(id, organization_id)
    on delete restrict,
  constraint document_signature_requests_employee_signature_fkey
    foreign key (employee_signature_id, organization_id)
    references public.employee_signatures(id, organization_id)
    on delete restrict,
  constraint document_signature_requests_status_check
    check (status in ('pending','viewed','signed','expired','cancelled')),
  constraint document_signature_requests_external_signer_type_check
    check (external_signer_type is null or external_signer_type in ('customer','contact')),
  constraint document_signature_requests_require_any_signature_check
    check (require_external_signature or require_employee_signature),
  constraint document_signature_requests_external_required_fields_check
    check (
      not require_external_signature
      or (
        external_signer_type is not null
        and btrim(coalesce(external_signer_name,'')) <> ''
        and btrim(coalesce(external_signer_email,'')) <> ''
        and btrim(coalesce(external_document_hmac,'')) <> ''
        and btrim(coalesce(external_document_masked,'')) <> ''
      )
    ),
  constraint document_signature_requests_employee_required_fields_check
    check (
      not require_employee_signature
      or (employee_entity_id is not null and employee_signature_id is not null and employee_signature_storage_path is not null)
    ),
  constraint document_signature_requests_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint document_signature_requests_snapshot_hash_check
    check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  constraint document_signature_requests_final_pdf_hash_check
    check (final_pdf_hash is null or final_pdf_hash ~ '^[0-9a-f]{64}$'),
  constraint document_signature_requests_expiration_check
    check (expires_at > created_at),
  constraint document_signature_requests_signed_state_check
    check ((status = 'signed') = (signed_at is not null)),
  constraint document_signature_requests_cancelled_state_check
    check ((status = 'cancelled') = (cancelled_at is not null))
);

create index if not exists document_signature_requests_order_idx
  on public.document_signature_requests(organization_id, service_order_id, created_at desc);
create index if not exists document_signature_requests_status_idx
  on public.document_signature_requests(organization_id, status, expires_at);
create index if not exists document_signature_requests_template_idx
  on public.document_signature_requests(organization_id, print_template_id);

create table if not exists public.document_signatures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_id uuid not null references public.document_signature_requests(id) on delete restrict,
  signer_type text not null,
  signer_name text not null,
  signer_document_masked text,
  employee_entity_id uuid,
  employee_signature_version integer,
  signature_storage_path text not null,
  signature_hash text not null,
  validation_method text not null,
  consent_accepted boolean not null default false,
  consent_text_snapshot text,
  signed_at timestamptz not null default timezone('utc', now()),
  constraint document_signatures_signer_type_check check (signer_type in ('employee','external')),
  constraint document_signatures_validation_method_check check (validation_method in ('stored_employee_signature','email_otp')),
  constraint document_signatures_signature_hash_check check (signature_hash ~ '^[0-9a-f]{64}$'),
  constraint document_signatures_signer_shape_check check (
    (signer_type = 'employee' and employee_entity_id is not null and employee_signature_version is not null and validation_method = 'stored_employee_signature')
    or
    (signer_type = 'external' and employee_entity_id is null and employee_signature_version is null and validation_method = 'email_otp' and consent_accepted = true)
  )
);

create unique index if not exists document_signatures_one_type_per_request_uidx
  on public.document_signatures(request_id, signer_type);
create index if not exists document_signatures_request_idx
  on public.document_signatures(organization_id, request_id, signed_at);

create table if not exists public.document_signature_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.document_signature_requests(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_type text not null,
  actor_type text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint document_signature_events_actor_type_check check (actor_type in ('admin','external','system')),
  constraint document_signature_events_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists document_signature_events_request_idx
  on public.document_signature_events(organization_id, request_id, created_at);

create table if not exists public.document_signature_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.document_signature_requests(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code_hmac text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  send_count integer not null default 1,
  window_started_at timestamptz not null default timezone('utc', now()),
  last_sent_at timestamptz not null default timezone('utc', now()),
  verified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint document_signature_otp_attempts_check check (attempts between 0 and 5),
  constraint document_signature_otp_send_count_check check (send_count between 1 and 5)
);

create index if not exists document_signature_otp_request_idx
  on public.document_signature_otp_challenges(organization_id, request_id, created_at desc);

create or replace function private.protect_document_signature_request()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Solicitações de assinatura não podem ser excluídas.' using errcode = '42501';
  end if;

  if row(
    new.organization_id,
    new.service_order_id,
    new.print_template_id,
    new.token_hash,
    new.token_ciphertext,
    new.token_iv,
    new.verification_code,
    new.expires_at,
    new.created_by,
    new.created_at,
    new.supersedes_request_id,
    new.require_external_signature,
    new.require_employee_signature,
    new.external_signer_type,
    new.external_signer_name,
    new.external_signer_email,
    new.external_signer_phone,
    new.external_document_hmac,
    new.external_document_masked,
    new.employee_entity_id,
    new.employee_signature_id,
    new.template_name_snapshot,
    new.order_number_snapshot,
    new.document_snapshot,
    new.snapshot_hash,
    new.snapshot_html_storage_path,
    new.employee_signature_storage_path,
    new.consent_text_snapshot
  ) is distinct from row(
    old.organization_id,
    old.service_order_id,
    old.print_template_id,
    old.token_hash,
    old.token_ciphertext,
    old.token_iv,
    old.verification_code,
    old.expires_at,
    old.created_by,
    old.created_at,
    old.supersedes_request_id,
    old.require_external_signature,
    old.require_employee_signature,
    old.external_signer_type,
    old.external_signer_name,
    old.external_signer_email,
    old.external_signer_phone,
    old.external_document_hmac,
    old.external_document_masked,
    old.employee_entity_id,
    old.employee_signature_id,
    old.template_name_snapshot,
    old.order_number_snapshot,
    old.document_snapshot,
    old.snapshot_hash,
    old.snapshot_html_storage_path,
    old.employee_signature_storage_path,
    old.consent_text_snapshot
  ) then
    raise exception 'Os dados congelados da solicitação de assinatura são imutáveis.' using errcode = '42501';
  end if;

  if old.status in ('signed','expired','cancelled') and new.status is distinct from old.status then
    raise exception 'Uma solicitação finalizada não pode voltar de estado.' using errcode = '42501';
  end if;

  if old.status = 'pending' and new.status not in ('pending','viewed','signed','expired','cancelled') then
    raise exception 'Transição de assinatura inválida.' using errcode = '23514';
  end if;
  if old.status = 'viewed' and new.status not in ('viewed','signed','expired','cancelled') then
    raise exception 'Transição de assinatura inválida.' using errcode = '23514';
  end if;

  if old.status = 'signed' and row(new.final_pdf_storage_path,new.final_pdf_hash,new.signed_at) is distinct from row(old.final_pdf_storage_path,old.final_pdf_hash,old.signed_at) then
    raise exception 'O documento final assinado é imutável.' using errcode = '42501';
  end if;

  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists protect_document_signature_request on public.document_signature_requests;
create trigger protect_document_signature_request
before update or delete on public.document_signature_requests
for each row execute function private.protect_document_signature_request();

create or replace function private.protect_document_signature_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Registros de assinatura e auditoria são somente de acréscimo.' using errcode = '42501';
end;
$$;

drop trigger if exists protect_document_signatures_append_only on public.document_signatures;
create trigger protect_document_signatures_append_only
before update or delete on public.document_signatures
for each row execute function private.protect_document_signature_append_only();

drop trigger if exists protect_document_signature_events_append_only on public.document_signature_events;
create trigger protect_document_signature_events_append_only
before update or delete on public.document_signature_events
for each row execute function private.protect_document_signature_append_only();

insert into public.permissions(key,label,description,module_name,sort_order)
values
  ('documents.signatures.view','Visualizar assinaturas','Permite visualizar solicitações de assinatura eletrônica das OS.','Documentos — Assinaturas',1370),
  ('documents.signatures.send','Enviar para assinatura','Permite criar e enviar documentos para assinatura eletrônica.','Documentos — Assinaturas',1371),
  ('documents.signatures.resend','Reenviar assinatura','Permite reenviar convites de assinatura pendentes.','Documentos — Assinaturas',1372),
  ('documents.signatures.cancel','Cancelar assinatura','Permite cancelar solicitações de assinatura ainda não concluídas.','Documentos — Assinaturas',1373),
  ('documents.signatures.audit','Visualizar auditoria de assinatura','Permite visualizar IP, navegador e eventos detalhados da assinatura.','Documentos — Assinaturas',1374)
on conflict (key) do update set
  label=excluded.label,
  description=excluded.description,
  module_name=excluded.module_name,
  sort_order=excluded.sort_order;

with mappings(target_key, source_key) as (
  values
    ('documents.signatures.view','documents.view'),
    ('documents.signatures.view','documents.print'),
    ('documents.signatures.send','documents.print'),
    ('documents.signatures.resend','documents.print'),
    ('documents.signatures.cancel','documents.print'),
    ('documents.signatures.audit','documents.edit')
), inherited as (
  select distinct rp.role_id, target.id as permission_id
  from mappings m
  join public.permissions source on source.key=m.source_key
  join public.role_permissions rp on rp.permission_id=source.id
  join public.permissions target on target.key=m.target_key
)
insert into public.role_permissions(role_id,permission_id)
select role_id,permission_id from inherited
on conflict do nothing;

alter table public.document_signature_requests enable row level security;
alter table public.document_signatures enable row level security;
alter table public.document_signature_events enable row level security;
alter table public.document_signature_otp_challenges enable row level security;

revoke all on public.document_signature_requests from anon, authenticated;
revoke all on public.document_signatures from anon, authenticated;
revoke all on public.document_signature_events from anon, authenticated;
revoke all on public.document_signature_otp_challenges from anon, authenticated;

grant select on public.document_signature_requests to authenticated;
grant select on public.document_signatures to authenticated;
grant select on public.document_signature_events to authenticated;

drop policy if exists document_signature_requests_admin_select on public.document_signature_requests;
create policy document_signature_requests_admin_select
on public.document_signature_requests
for select to authenticated
using (
  private.has_effective_organization_permission(organization_id,'documents.signatures.view')
  and private.can_view_service_order(service_order_id)
);

drop policy if exists document_signatures_admin_select on public.document_signatures;
create policy document_signatures_admin_select
on public.document_signatures
for select to authenticated
using (
  exists (
    select 1 from public.document_signature_requests r
    where r.id=request_id
      and r.organization_id=document_signatures.organization_id
      and private.has_effective_organization_permission(r.organization_id,'documents.signatures.view')
      and private.can_view_service_order(r.service_order_id)
  )
);

drop policy if exists document_signature_events_audit_select on public.document_signature_events;
create policy document_signature_events_audit_select
on public.document_signature_events
for select to authenticated
using (
  exists (
    select 1 from public.document_signature_requests r
    where r.id=request_id
      and r.organization_id=document_signature_events.organization_id
      and private.has_effective_organization_permission(r.organization_id,'documents.signatures.audit')
      and private.can_view_service_order(r.service_order_id)
  )
);

insert into storage.buckets(id,name,public)
values ('signed-documents','signed-documents',false)
on conflict (id) do update set public=false;

commit;
