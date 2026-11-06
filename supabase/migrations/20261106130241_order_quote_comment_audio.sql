-- Permite notas de voz nos comentários dos orçamentos, sem flexibilizar o isolamento da OS.
alter policy order_quote_comment_attachments_insert
on public.service_order_quote_comment_attachments
with check (
  private.can_view_service_order(service_order_id)
  and private.is_organization_member(organization_id)
  and private.is_organization_module_enabled(organization_id, 'orders')
  and (private.has_effective_organization_permission(organization_id, 'orders.edit')
    or private.has_effective_organization_permission(organization_id, 'orders.update'))
  and exists (
    select 1 from public.service_order_quote_comments comment
    where comment.id = comment_id
      and comment.organization_id = service_order_quote_comment_attachments.organization_id
      and comment.service_order_id = service_order_quote_comment_attachments.service_order_id
      and comment.author_id = (select auth.uid())
  )
  and exists (
    select 1 from public.media media
    where media.id = media_id
      and media.organization_id = service_order_quote_comment_attachments.organization_id
      and media.uploaded_by = (select auth.uid())
      and media.bucket_id = 'service-images'
      and media.storage_path like 'orders/' || service_order_id::text || '/attachments/quote-comments/%'
      and media.file_size between 1 and 10485760
      and (
        media.mime_type like 'image/%'
        or media.mime_type in ('audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg',
          'application/pdf', 'text/plain', 'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      )
  )
);