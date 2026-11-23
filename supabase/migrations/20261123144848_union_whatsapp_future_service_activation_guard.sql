-- Limita a sinalizacao automatica ao contexto que tem permissao no WhatsApp.
-- Nunca impedir a ativacao de um servico no catalogo por falta dessa permissao.
CREATE OR REPLACE FUNCTION private.union_wa_future_service_available()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Ativar o catalogo nunca pode falhar porque o usuario nao tem permissao no WhatsApp.
  if new.is_active
     and (tg_op='INSERT' or old.is_active is distinct from true)
     and (select auth.uid()) is not null
     and private.has_effective_organization_permission(new.organization_id,'whatsapp.inbox.send') then
    update public.union_whatsapp_future_opportunities o
      set status='available',service_type_id=new.id,updated_at=now()
    where o.organization_id=new.organization_id and o.status='waiting'
      and lower(btrim(o.service_interest))=lower(btrim(new.title));
  end if;
  return new;
end $function$
;
