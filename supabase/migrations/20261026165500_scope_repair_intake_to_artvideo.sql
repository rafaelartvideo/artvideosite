begin;
-- A escolha feita no site já define a fila logística inicial do conserto.
-- Não exigir que um funcionário repita o clique de "aguardar entrega".
create or replace function private.classify_site_quote_request_v1()
returns trigger language plpgsql set search_path='' as $fn$
declare v_current text; v_target text;
begin
 if new.origin='site' then
   if new.site_request_kind is null then
     new.site_request_kind:=case
       when new.customer_message ilike '%Tipo de solicitação: Conserto / manutenção de equipamento%'
         then 'repair' else 'service' end;
   end if;
   if new.site_request_kind='repair' and new.organization_id=public.artvideo_organization_id() then
     select s.slug into v_current from public.request_statuses s
      where s.id=new.status_id and s.organization_id=new.organization_id;
     if v_current='PENDENTE' then
       v_target:=case
         when new.customer_message ilike '%Atendimento solicitado: Coletar o equipamento%'
            then 'COLETA_PENDENTE'
         when new.customer_message ilike '%Atendimento solicitado: Levar o equipamento%'
            then 'AGUARDANDO_ENTREGA'
         else null end;
       if v_target is not null then
         select s.id into new.status_id from public.request_statuses s
          where s.organization_id=new.organization_id and s.slug=v_target
          limit 1;
         if new.status_id is null then
           raise exception 'Situação inicial do conserto indisponível.';
         end if;
       end if;
     end if;
   end if;
 end if;
 return new;
end
$fn$;
commit;
