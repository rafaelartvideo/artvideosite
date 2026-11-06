-- Comentários do orçamento: conversas encadeadas, curtidas e anexos privados.
-- Preserva todos os comentários existentes e respeita o isolamento da OS/empresa.

alter table public.service_order_quote_comments
  add column if not exists parent_id uuid;

create unique index if not exists service_order_quote_comments_tenant_reference
  on public.service_order_quote_comments (id, organization_id, service_order_id);

alter table public.service_order_quote_comments
  add constraint service_order_quote_comments_not_self_reply
  check (parent_id is null or parent_id <> id);

alter table public.service_order_quote_comments
  add constraint service_order_quote_comments_parent_same_order
  foreign key (parent_id, organization_id, service_order_id)
  references public.service_order_quote_comments (id, organization_id, service_order_id)
  on delete cascade;

create index if not exists service_order_quote_comments_parent_idx
  on public.service_order_quote_comments (parent_id, created_at);

create table if not exists public.service_order_quote_comment_likes (
  comment_id uuid not null,
  organization_id uuid not null,
  service_order_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id),
  foreign key (comment_id, organization_id, service_order_id)
    references public.service_order_quote_comments (id, organization_id, service_order_id)
    on delete cascade
);
create index if not exists service_order_quote_comment_likes_by_order
  on public.service_order_quote_comment_likes (organization_id, service_order_id, comment_id);
alter table public.service_order_quote_comment_likes enable row level security;

create policy order_quote_comment_likes_read
on public.service_order_quote_comment_likes for select to authenticated
using (
  private.is_organization_member(organization_id)
  and private.is_organization_module_enabled(organization_id, 'orders')
  and private.has_effective_organization_permission(organization_id, 'orders.view')
  and private.can_view_service_order(service_order_id)
);
create policy order_quote_comment_likes_insert
on public.service_order_quote_comment_likes for insert to authenticated
with check (
  user_id = (select auth.uid())
  and private.is_organization_member(organization_id)
  and private.is_organization_module_enabled(organization_id, 'orders')
  and private.can_view_service_order(service_order_id)
  and (private.has_effective_organization_permission(organization_id, 'orders.edit')
    or private.has_effective_organization_permission(organization_id, 'orders.update'))
);
create policy order_quote_comment_likes_delete
on public.service_order_quote_comment_likes for delete to authenticated
using (
  user_id = (select auth.uid())
  and private.can_view_service_order(service_order_id)
);
grant select, insert, delete on public.service_order_quote_comment_likes to authenticated;

create table if not exists public.service_order_quote_comment_attachments (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null,
  organization_id uuid not null,
  service_order_id uuid not null,
  media_id uuid not null references public.media (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, media_id),
  foreign key (comment_id, organization_id, service_order_id)
    references public.service_order_quote_comments (id, organization_id, service_order_id)
    on delete cascade
);
create index if not exists service_order_quote_comment_attachments_by_order
  on public.service_order_quote_comment_attachments (organization_id, service_order_id, comment_id);
alter table public.service_order_quote_comment_attachments enable row level security;

create policy order_quote_comment_attachments_read
on public.service_order_quote_comment_attachments for select to authenticated
using (
  private.is_organization_member(organization_id)
  and private.is_organization_module_enabled(organization_id, 'orders')
  and private.has_effective_organization_permission(organization_id, 'orders.view')
  and private.can_view_service_order(service_order_id)
);

create policy order_quote_comment_attachments_insert
on public.service_order_quote_comment_attachments for insert to authenticated
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
      and media.file_size between 1 and 20971520
      and (
        media.mime_type like 'image/%'
        or media.mime_type in ('application/pdf', 'text/plain', 'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      )
  )
);
grant select, insert on public.service_order_quote_comment_attachments to authenticated;

-- Uma única transação: comentário e vínculos dos anexos são criados juntos.
-- SECURITY INVOKER mantém todas as políticas RLS.
create or replace function public.add_service_order_quote_comment_v2(
  p_organization_id uuid,
  p_order_id uuid,
  p_body text,
  p_parent_id uuid default null,
  p_media_ids uuid[] default '{}'::uuid[]
) returns uuid
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_comment_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if (select auth.uid()) is null then
    raise exception 'Faça login para comentar.' using errcode = '42501';
  end if;
  if cardinality(coalesce(p_media_ids, '{}'::uuid[])) > 3 then
    raise exception 'Selecione no máximo 3 anexos.' using errcode = '22023';
  end if;
  if v_body = '' and cardinality(coalesce(p_media_ids, '{}'::uuid[])) = 0 then
    raise exception 'Digite um comentário ou escolha um anexo.' using errcode = '22023';
  end if;
  if length(v_body) > 4000 then
    raise exception 'O comentário deve ter no máximo 4.000 caracteres.' using errcode = '22023';
  end if;

  insert into public.service_order_quote_comments
    (organization_id, service_order_id, author_id, body, parent_id)
  values
    (p_organization_id, p_order_id, (select auth.uid()),
     case when v_body = '' then '📎 Anexo' else v_body end, p_parent_id)
  returning id into v_comment_id;

  insert into public.service_order_quote_comment_attachments
    (comment_id, organization_id, service_order_id, media_id)
  select v_comment_id, p_organization_id, p_order_id, unnest(p_media_ids);

  return v_comment_id;
end;
$$;
revoke all on function public.add_service_order_quote_comment_v2(uuid,uuid,text,uuid,uuid[]) from public, anon;
grant execute on function public.add_service_order_quote_comment_v2(uuid,uuid,text,uuid,uuid[]) to authenticated;
