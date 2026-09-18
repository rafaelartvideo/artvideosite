begin;

select pg_advisory_xact_lock(hashtextextended('artvideo:finance_documents', 0));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('financial-documents','financial-documents',false,20971520,null)
on conflict(id) do update
set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table public.financial_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  financial_entry_id uuid not null,
  financial_settlement_id uuid,
  attachment_type text not null check (attachment_type in ('invoice','boleto','receipt','proof','other')),
  file_name text not null check (btrim(file_name)<>''),
  storage_path text not null check (btrim(storage_path)<>''),
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes>=0),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  archive_reason text,
  unique (organization_id,id),
  unique (storage_path),
  foreign key (organization_id,financial_entry_id)
    references public.financial_entries(organization_id,id) on delete restrict,
  foreign key (organization_id,financial_settlement_id)
    references public.financial_settlements(organization_id,id) on delete restrict
);

create index financial_attachments_entry_idx
  on public.financial_attachments(organization_id,financial_entry_id,created_at desc);
create index financial_attachments_settlement_idx
  on public.financial_attachments(organization_id,financial_settlement_id)
  where financial_settlement_id is not null;

alter table public.financial_attachments enable row level security;
revoke all on table public.financial_attachments from anon,authenticated;
grant select on table public.financial_attachments to authenticated;

create policy financial_attachments_select on public.financial_attachments
for select to authenticated
using (
  archived_at is null
  and (
    private.can_access_finance(organization_id,'finance.documents.view')
    or private.can_access_finance(organization_id,'finance.documents.manage')
  )
  and private.can_view_financial_entry(organization_id,financial_entry_id)
);

drop policy if exists financial_documents_select on storage.objects;
drop policy if exists financial_documents_insert on storage.objects;
drop policy if exists financial_documents_update on storage.objects;
drop policy if exists financial_documents_delete on storage.objects;

create policy financial_documents_select
on storage.objects
for select
to authenticated
using (
  bucket_id='financial-documents'
  and exists(
    select 1 from public.organizations o
    where o.id::text=(storage.foldername(name))[1]
      and (
        private.can_access_finance(o.id,'finance.documents.view')
        or private.can_access_finance(o.id,'finance.documents.manage')
      )
  )
);

create policy financial_documents_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id='financial-documents'
  and exists(
    select 1 from public.organizations o
    where o.id::text=(storage.foldername(name))[1]
      and private.can_access_finance(o.id,'finance.documents.manage')
  )
);

create or replace function public.register_financial_attachment(
  p_organization_id uuid,
  p_entry_id uuid,
  p_settlement_id uuid,
  p_attachment_type text,
  p_file_name text,
  p_storage_path text,
  p_mime_type text default null,
  p_size_bytes bigint default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid:=auth.uid();
  v_type text:=lower(btrim(coalesce(p_attachment_type,'other')));
  v_name text:=btrim(coalesce(p_file_name,''));
  v_path text:=btrim(coalesce(p_storage_path,''));
  v_id uuid;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if not private.can_access_finance(p_organization_id,'finance.documents.manage') then
    raise exception 'Sem permissão para gerenciar documentos financeiros.' using errcode='42501';
  end if;
  if v_type not in ('invoice','boleto','receipt','proof','other') then raise exception 'Tipo de documento financeiro inválido.' using errcode='22023'; end if;
  if v_name='' or v_path='' then raise exception 'Arquivo financeiro inválido.' using errcode='22023'; end if;
  if v_path not like p_organization_id::text||'/'||p_entry_id::text||'/%' then
    raise exception 'O caminho do documento não corresponde à empresa e ao lançamento.' using errcode='22023';
  end if;
  if p_size_bytes is not null and (p_size_bytes<0 or p_size_bytes>20971520) then
    raise exception 'O documento financeiro excede o limite permitido.' using errcode='22023';
  end if;
  if not exists(
    select 1 from public.financial_entries e
    where e.organization_id=p_organization_id and e.id=p_entry_id
  ) then raise exception 'Lançamento financeiro não encontrado.' using errcode='P0002'; end if;
  if p_settlement_id is not null and not exists(
    select 1 from public.financial_settlements s
    where s.organization_id=p_organization_id
      and s.id=p_settlement_id
      and s.financial_entry_id=p_entry_id
  ) then raise exception 'A baixa informada não pertence ao lançamento.' using errcode='23503'; end if;

  insert into public.financial_attachments(
    organization_id,financial_entry_id,financial_settlement_id,
    attachment_type,file_name,storage_path,mime_type,size_bytes,created_by
  ) values (
    p_organization_id,p_entry_id,p_settlement_id,
    v_type,v_name,v_path,nullif(btrim(coalesce(p_mime_type,'')),''),p_size_bytes,v_user_id
  ) returning id into v_id;

  insert into public.financial_events(organization_id,financial_entry_id,event_type,event_data,created_by)
  values(p_organization_id,p_entry_id,'document_attached',jsonb_build_object(
    'attachment_id',v_id,'attachment_type',v_type,'file_name',v_name,'settlement_id',p_settlement_id
  ),v_user_id);
  return v_id;
end;
$$;

create or replace function public.archive_financial_attachment(
  p_organization_id uuid,
  p_attachment_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid:=auth.uid();
  v_attachment public.financial_attachments%rowtype;
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if not private.can_access_finance(p_organization_id,'finance.documents.manage') then
    raise exception 'Sem permissão para arquivar documentos financeiros.' using errcode='42501';
  end if;
  if v_reason is null then raise exception 'Informe o motivo do arquivamento.' using errcode='22023'; end if;

  select * into v_attachment
  from public.financial_attachments a
  where a.organization_id=p_organization_id and a.id=p_attachment_id
  for update;
  if not found then raise exception 'Documento financeiro não encontrado.' using errcode='P0002'; end if;
  if v_attachment.archived_at is not null then raise exception 'Este documento já está arquivado.' using errcode='22023'; end if;

  update public.financial_attachments
  set archived_at=now(),archived_by=v_user_id,archive_reason=v_reason
  where organization_id=p_organization_id and id=p_attachment_id;

  insert into public.financial_events(organization_id,financial_entry_id,event_type,event_data,created_by)
  values(p_organization_id,v_attachment.financial_entry_id,'document_archived',jsonb_build_object(
    'attachment_id',v_attachment.id,'file_name',v_attachment.file_name,'reason',v_reason
  ),v_user_id);
  return v_attachment.id;
end;
$$;

revoke all on function public.register_financial_attachment(uuid,uuid,uuid,text,text,text,text,bigint) from public,anon;
revoke all on function public.archive_financial_attachment(uuid,uuid,text) from public,anon;
grant execute on function public.register_financial_attachment(uuid,uuid,uuid,text,text,text,text,bigint) to authenticated;
grant execute on function public.archive_financial_attachment(uuid,uuid,text) to authenticated;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p2.id
from public.role_permissions rp
join public.permissions p1 on p1.id=rp.permission_id
join public.permissions p2 on p2.key in ('finance.documents.view','finance.documents.manage')
where p1.key in ('finance.settings.manage','roles.permissions.manage')
on conflict (role_id,permission_id) do nothing;

commit;
