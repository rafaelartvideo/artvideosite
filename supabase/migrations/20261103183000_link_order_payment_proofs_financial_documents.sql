-- Comprovantes de pagamento da OS vinculados aos documentos financeiros.
-- Copia somente a referência; mantém o arquivo privado no bucket original.
begin;

alter table public.financial_attachments
  add column if not exists storage_bucket text not null default 'financial-documents';
alter table public.financial_attachments
  add column if not exists source_media_id uuid null references public.media(id) on delete restrict;

alter table public.financial_attachments drop constraint if exists financial_attachments_storage_bucket_check;
alter table public.financial_attachments add constraint financial_attachments_storage_bucket_check
  check (storage_bucket in ('financial-documents','service-images'));
alter table public.financial_attachments drop constraint if exists financial_attachments_source_media_consistency;
alter table public.financial_attachments add constraint financial_attachments_source_media_consistency
  check ((source_media_id is null and storage_bucket='financial-documents') or
         (source_media_id is not null and storage_bucket='service-images' and attachment_type='proof'));

create unique index if not exists financial_attachments_source_media_entry_uidx
  on public.financial_attachments (organization_id,financial_entry_id,source_media_id)
  where source_media_id is not null;

CREATE OR REPLACE FUNCTION private.sync_order_payment_proofs_to_finance_v1(p_organization_id uuid, p_service_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_organization_id is null or p_service_order_id is null then return; end if;
  insert into public.financial_attachments (
    organization_id, financial_entry_id, financial_settlement_id,
    attachment_type, file_name, storage_path, mime_type, size_bytes,
    created_by, created_at, storage_bucket, source_media_id
  )
  select entry.organization_id, entry.id, null,
    'proof', media_file.file_name, media_file.storage_path, media_file.mime_type, media_file.file_size,
    source_doc.uploaded_by, source_doc.created_at, 'service-images', media_file.id
  from public.financial_entries entry
  join public.service_order_situation_media source_doc
    on source_doc.service_order_id::text = entry.origin_reference
   and source_doc.organization_id = entry.organization_id
  join public.attachment_types type_of_doc
    on type_of_doc.id=source_doc.attachment_type_id
   and type_of_doc.organization_id=entry.organization_id
  join public.media media_file
    on media_file.id=source_doc.media_id
   and media_file.organization_id=entry.organization_id
  where entry.organization_id=p_organization_id
    and entry.origin_type='service_order'
    and entry.origin_reference=p_service_order_id::text
    and source_doc.situation_id is null
    and lower(btrim(type_of_doc.name))='comprovante de pagamento'
    and media_file.bucket_id='service-images'
    and btrim(media_file.storage_path)<>''
  on conflict (storage_path) do nothing;
end;
$function$;
revoke all on function private.sync_order_payment_proofs_to_finance_v1(uuid,uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.finance_proof_on_entry_created_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_order_id uuid;
begin
  if new.origin_reference is null or new.origin_reference !~
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return new; end if;
  v_order_id := new.origin_reference::uuid;
  perform private.sync_order_payment_proofs_to_finance_v1(new.organization_id,v_order_id);
  return new;
end;
$function$;
revoke all on function private.finance_proof_on_entry_created_v1() from public,anon,authenticated;
drop trigger if exists finance_link_order_proof_on_entry_created on public.financial_entries;
create trigger finance_link_order_proof_on_entry_created after insert on public.financial_entries
for each row when (new.origin_type='service_order')
execute function private.finance_proof_on_entry_created_v1();

CREATE OR REPLACE FUNCTION private.finance_proof_on_os_attachment_added_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if exists (
    select 1 from public.attachment_types type_of_doc
    where type_of_doc.id=new.attachment_type_id
      and type_of_doc.organization_id=new.organization_id
      and lower(btrim(type_of_doc.name))='comprovante de pagamento'
  ) then
    perform private.sync_order_payment_proofs_to_finance_v1(new.organization_id,new.service_order_id);
  end if;
  return new;
end;
$function$;
revoke all on function private.finance_proof_on_os_attachment_added_v1() from public,anon,authenticated;
drop trigger if exists finance_link_order_proof_on_attachment_added on public.service_order_situation_media;
create trigger finance_link_order_proof_on_attachment_added after insert on public.service_order_situation_media
for each row when (new.situation_id is null and new.attachment_type_id is not null)
execute function private.finance_proof_on_os_attachment_added_v1();

drop policy if exists finance_linked_order_proof_select on storage.objects;
create policy finance_linked_order_proof_select on storage.objects
for select to authenticated using (((bucket_id = 'service-images'::text) AND (EXISTS ( SELECT 1
   FROM financial_attachments linked
  WHERE ((linked.storage_bucket = 'service-images'::text) AND (linked.storage_path = objects.name) AND (linked.source_media_id IS NOT NULL) AND (linked.attachment_type = 'proof'::text) AND (linked.archived_at IS NULL) AND (private.can_access_finance(linked.organization_id, 'finance.documents.view'::text) OR private.can_access_finance(linked.organization_id, 'finance.documents.manage'::text)) AND private.can_view_financial_entry(linked.organization_id, linked.financial_entry_id))))));

-- Garante documentos de OS anteriores à migração.
do $migration$
declare order_rec record;
begin
  for order_rec in
    select distinct source_doc.organization_id,source_doc.service_order_id
    from public.service_order_situation_media source_doc
    join public.attachment_types type_of_doc
      on type_of_doc.id=source_doc.attachment_type_id
     and type_of_doc.organization_id=source_doc.organization_id
    join public.financial_entries entry
      on entry.organization_id=source_doc.organization_id
     and entry.origin_type='service_order'
     and entry.origin_reference=source_doc.service_order_id::text
    where source_doc.situation_id is null
      and lower(btrim(type_of_doc.name))='comprovante de pagamento'
  loop
    perform private.sync_order_payment_proofs_to_finance_v1(order_rec.organization_id,order_rec.service_order_id);
  end loop;
end;
$migration$;

commit;
