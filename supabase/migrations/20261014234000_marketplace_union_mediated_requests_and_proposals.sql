-- Marketplace: Union World intermedeia tanto a liberacao das solicitacoes
-- quanto a apresentacao, aceite e confirmacao de todas as propostas.
begin;

alter table public.marketplace_service_requests
  drop constraint if exists marketplace_service_requests_status_check;
alter table public.marketplace_service_requests
  add constraint marketplace_service_requests_status_check
  check (status in ('pending_union','open','rejected','cancelled','closed'));
alter table public.marketplace_service_requests alter column status set default 'pending_union';

drop policy if exists marketplace_requests_owner_or_staff_select on public.marketplace_service_requests;
create policy marketplace_requests_mediated_read on public.marketplace_service_requests
 for select to authenticated using (
   (select auth.uid()) = buyer_id
   or private.has_platform_permission('platform.marketplace.manage')
   or (status='open' and private.marketplace_can_view_request(state))
 );
drop policy if exists marketplace_requests_owner_insert on public.marketplace_service_requests;
create policy marketplace_requests_owner_insert on public.marketplace_service_requests
 for insert to authenticated with check (
   (select auth.uid())=buyer_id and status='pending_union'
 );
drop policy if exists marketplace_requests_owner_update on public.marketplace_service_requests;
create policy marketplace_requests_owner_or_union_update on public.marketplace_service_requests
 for update to authenticated using (
   (select auth.uid())=buyer_id or private.has_platform_permission('platform.marketplace.manage')
 ) with check (
   (select auth.uid())=buyer_id or private.has_platform_permission('platform.marketplace.manage')
 );

create or replace function private.marketplace_request_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare is_union boolean;
begin
  if tg_op='INSERT' then
    if new.status <> 'pending_union' then
      raise exception 'Solicitacoes devem ser enviadas para analise da Union.' using errcode='42501';
    end if;
    if new.listing_id is not null and not exists (
      select 1 from public.marketplace_listings l
      where l.id=new.listing_id and l.status='approved' and l.source_kind='service'
        and private.marketplace_is_public(l.organization_id)
    ) then
      raise exception 'O anuncio informado nao esta disponivel.' using errcode='23514';
    end if;
  else
    if to_jsonb(new)-'status'-'updated_at' is distinct from to_jsonb(old)-'status'-'updated_at' then
      raise exception 'O conteudo de uma solicitacao publicada nao pode ser alterado.' using errcode='42501';
    end if;
    is_union := private.has_platform_permission('platform.marketplace.manage');
    if is_union then
      if not (
        (old.status='pending_union' and new.status in ('open','rejected'))
        or (old.status='open' and new.status in ('closed','rejected'))
      ) then
        raise exception 'Transicao de analise nao permitida.' using errcode='42501';
      end if;
    elsif old.buyer_id=(select auth.uid()) then
      if not (old.status in ('pending_union','open') and new.status='cancelled') then
        raise exception 'O contratante so pode cancelar solicitacoes pendentes ou abertas.' using errcode='42501';
      end if;
    else
      raise exception 'Operacao nao autorizada.' using errcode='42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create table public.marketplace_service_proposals (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.marketplace_service_requests(id) on delete restrict,
 organization_id uuid not null references public.marketplace_stores(organization_id) on delete restrict,
 submitted_by uuid not null references auth.users(id) on delete restrict,
 description text not null check (char_length(btrim(description)) between 20 and 2500),
 amount numeric(12,2) check (amount >= 0),
 estimated_days integer check (estimated_days between 1 and 365),
 status text not null default 'submitted'
    check (status in ('submitted','rejected','presented','accepted','declined','confirmed','withdrawn')),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 buyer_replied_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (request_id, organization_id)
);
create index marketplace_proposals_organization_created_idx
 on public.marketplace_service_proposals(organization_id,created_at desc);
create index marketplace_proposals_request_created_idx
 on public.marketplace_service_proposals(request_id,created_at desc);
create index marketplace_proposals_status_created_idx
 on public.marketplace_service_proposals(status,created_at desc);

alter table public.marketplace_service_proposals enable row level security;
revoke all on public.marketplace_service_proposals from anon;
grant select,insert,update on public.marketplace_service_proposals to authenticated;

create policy marketplace_proposal_read on public.marketplace_service_proposals
 for select to authenticated using (
    private.has_platform_permission('platform.marketplace.manage')
    or private.has_tenant_module_permission(organization_id,'marketplace','marketplace.listings.manage')
    or (
      status in ('presented','accepted','declined','confirmed','withdrawn')
      and exists (select 1 from public.marketplace_service_requests r
        where r.id=request_id and r.buyer_id=(select auth.uid()))
    )
 );

create policy marketplace_proposal_partner_submit on public.marketplace_service_proposals
 for insert to authenticated with check (
   submitted_by=(select auth.uid())
   and status='submitted'
   and reviewed_at is null and reviewed_by is null and buyer_replied_at is null
   and exists (
     select 1 from public.marketplace_service_requests r
     join public.marketplace_stores s on s.organization_id=organization_id
     where r.id=request_id
       and r.status='open'
       and upper(r.state)=upper(s.state)
       and s.status='approved'
       and private.marketplace_org_enabled(organization_id)
       and private.has_tenant_module_permission(
          organization_id,'marketplace','marketplace.listings.manage')
   )
 );

create policy marketplace_proposal_union_or_buyer_update on public.marketplace_service_proposals
 for update to authenticated using (
    private.has_platform_permission('platform.marketplace.manage')
    or (
      status='presented' and exists (
        select 1 from public.marketplace_service_requests r
        where r.id=request_id and r.buyer_id=(select auth.uid())
      )
    )
 ) with check (
    private.has_platform_permission('platform.marketplace.manage')
    or exists (
      select 1 from public.marketplace_service_requests r
      where r.id=request_id and r.buyer_id=(select auth.uid())
    )
 );

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

create trigger marketplace_proposal_guard
before insert or update on public.marketplace_service_proposals
for each row execute function private.marketplace_proposal_guard();

create or replace function private.marketplace_proposal_confirm_request()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='confirmed' and old.status is distinct from 'confirmed' then
    update public.marketplace_service_requests
       set status='closed'
     where id=new.request_id and status='open';
  end if;
  return null;
end;
$$;
create trigger marketplace_proposal_confirm_request
after update on public.marketplace_service_proposals
for each row execute function private.marketplace_proposal_confirm_request();

commit;
