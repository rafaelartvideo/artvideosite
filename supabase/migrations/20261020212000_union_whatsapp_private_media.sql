begin;
insert into storage.buckets (id,name,public,file_size_limit)
values ('union-whatsapp-media','union-whatsapp-media',false,5242880)
on conflict(id) do update set public=false,file_size_limit=5242880;
alter table public.union_whatsapp_messages
  add column if not exists media_path text,
  add column if not exists media_name text,
  add column if not exists media_mime text;
-- Deliberately no storage.objects RLS policies: only the authenticated
-- Edge Function service-role uploads and generates short-lived signed URLs.
commit;