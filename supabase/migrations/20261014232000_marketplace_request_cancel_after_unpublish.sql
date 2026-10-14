create or replace function private.marketplace_request_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
   if new.buyer_id is distinct from old.buyer_id
      or new.listing_id is distinct from old.listing_id then
     raise exception 'Nao e possivel alterar o titular ou anuncio vinculado.' using errcode='42501';
   end if;
   if old.status<>'open' then
     raise exception 'Um pedido encerrado nao pode ser alterado.' using errcode='42501';
   end if;
 end if;
 if tg_op='INSERT' and new.listing_id is not null and not exists(
   select 1 from public.marketplace_listings l
   where l.id=new.listing_id and l.status='approved' and l.source_kind='service'
     and private.marketplace_is_public(l.organization_id)
 ) then
   raise exception 'Este anuncio de servico nao esta disponivel.' using errcode='23514';
 end if;
 if tg_op='INSERT' and new.status <> 'open' then
   raise exception 'Um pedido deve comecar aberto.' using errcode='23514';
 end if;
 new.updated_at=now();
 return new;
end;
$$;
