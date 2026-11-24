begin;
alter table public.order_intake_requests add column bound_customer_id uuid;
comment on column public.order_intake_requests.bound_customer_id is 'Cadastro identificado no servidor no momento da emissão; nunca fornecido pelo formulário público.';
create or replace function private.mark_order_intake_converted()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if exists(select 1 from public.order_intake_requests r where r.id=new.id) then
    update public.order_intake_requests r
       set status='converted', order_id=new.id, converted_at=now(), converted_by=auth.uid()
     where r.id=new.id and r.organization_id=new.organization_id and r.status='received'
       and private.has_effective_organization_permission(new.organization_id,'orders.create')
       and (r.created_by=auth.uid() or private.has_effective_organization_permission(new.organization_id,'orders.view_all'))
       and exists(select 1 from public.customers c where c.id=new.customer_id and c.organization_id=new.organization_id
         and (case when r.bound_customer_id is not null then c.id=r.bound_customer_id
           else regexp_replace(coalesce(case when length(r.payload->>'document')=11 then c.document else c.cnpj end,''),'[^0-9]','','g')=r.payload->>'document' end));
    if not found then raise exception 'Pré-OS indisponível para conversão.' using errcode='23514'; end if;
  end if;
  return new;
end;
$function$;
revoke all on function private.mark_order_intake_converted() from public,anon,authenticated;
commit;