begin;
-- Editor avulso de orçamento retirado: manter registro legado mas encerrar criação.
drop function if exists public.save_internal_quote_v1(uuid,uuid,jsonb,jsonb,text);
revoke insert,update,delete on public.quote_commercial_items from authenticated;
do $$
begin
  if exists(select 1 from public.quote_comments limit 1)
    or exists(select 1 from public.quote_media limit 1)
    or exists(select 1 from storage.objects where bucket_id='quote-images' limit 1)
  then raise exception 'Há dados de mídia ou comentários do fluxo antigo; interrompendo limpeza'; end if;
end;
$$;
drop table if exists public.quote_comments;
drop table if exists public.quote_media;
drop policy if exists quote_images_read on storage.objects;
drop policy if exists quote_images_insert on storage.objects;
drop policy if exists quote_images_delete on storage.objects;
-- O bucket vazio deve ser removido pela Storage API; exclusão SQL é proibida.
commit;