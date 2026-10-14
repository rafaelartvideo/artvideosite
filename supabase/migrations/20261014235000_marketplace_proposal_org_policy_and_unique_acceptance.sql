-- Fixar referencia a organizacao externa em policy: a loja da subconsulta
-- nunca pode substituir silenciosamente a organizacao da proposta.
begin;

drop policy if exists marketplace_proposal_partner_submit on public.marketplace_service_proposals;
create policy marketplace_proposal_partner_submit on public.marketplace_service_proposals
 for insert to authenticated with check (
   submitted_by=(select auth.uid())
   and status='submitted'
   and reviewed_at is null and reviewed_by is null and buyer_replied_at is null
   and exists (
     select 1 from public.marketplace_service_requests r
     join public.marketplace_stores s
       on s.organization_id=marketplace_service_proposals.organization_id
     where r.id=marketplace_service_proposals.request_id
       and r.status='open'
       and upper(r.state)=upper(s.state)
       and s.status='approved'
       and private.marketplace_org_enabled(marketplace_service_proposals.organization_id)
       and private.has_tenant_module_permission(
          marketplace_service_proposals.organization_id,'marketplace','marketplace.listings.manage')
   )
 );

-- Evita que o mesmo contratante aceite duas ofertas de uma solicitacao.
create or replace function private.marketplace_proposal_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare is_union boolean;
begin
  if tg_op='INSERT' then
    if new.status<>'submitted' or new.reviewed_by is not null
       or new.reviewed_at is not null or new.buyer_replied_at is not null then
      raise exception 'Propostas devem ser enviadas exclusivamente a Union World.' using errcode='42501';
    end if;
  else
    if to_jsonb(new)-'status'-'updated_at'-'reviewed_by'-'reviewed_at'-'buyer_replied_at'
       is distinct from to_jsonb(old)-'status'-'updated_at'-'reviewed_by'-'reviewed_at'-'buyer_replied_at' then
      raise exception 'Os dados comerciais da proposta nao podem ser alterados.' using errcode='42501';
    end if;
    is_union := private.has_platform_permission('platform.marketplace.manage');
    if is_union then
      if not (
        (old.status='submitted' and new.status in ('presented','rejected'))
        or (old.status='presented' and new.status='withdrawn')
        or (old.status='accepted' and new.status in ('confirmed','withdrawn'))
      ) then
        raise exception 'Transicao de proposta nao permitida para a Union.' using errcode='42501';
      end if;
      if new.status in ('presented','confirmed') and not exists (
        select 1 from public.marketplace_service_requests r
        where r.id=new.request_id and r.status='open'
      ) then
        raise exception 'A solicitacao nao esta aberta.' using errcode='23514';
      end if;
      new.reviewed_by := (select auth.uid());
      new.reviewed_at := now();
      new.buyer_replied_at := old.buyer_replied_at;
    elsif exists (
      select 1 from public.marketplace_service_requests r
      where r.id=new.request_id and r.buyer_id=(select auth.uid())
    ) then
      if old.status<>'presented' or new.status not in ('accepted','declined') then
        raise exception 'Somente propostas encaminhadas pela Union podem receber aceite ou recusa.' using errcode='42501';
      end if;
      if not exists (
        select 1 from public.marketplace_service_requests r
        where r.id=new.request_id and r.status='open'
      ) then
        raise exception 'Esta solicitacao nao esta aberta.' using errcode='23514';
      end if;
      if new.status='accepted' and exists (
        select 1 from public.marketplace_service_proposals p
        where p.request_id=new.request_id and p.id<>new.id and p.status in ('accepted','confirmed')
      ) then
        raise exception 'Ja existe uma proposta aceita para esta solicitacao.' using errcode='23505';
      end if;
      new.reviewed_by := old.reviewed_by;
      new.reviewed_at := old.reviewed_at;
      new.buyer_replied_at := now();
    else
      raise exception 'Somente a Union pode intermediar propostas.' using errcode='42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create unique index if not exists marketplace_one_accepted_proposal_per_request
 on public.marketplace_service_proposals(request_id)
 where status in ('accepted','confirmed');

commit;
