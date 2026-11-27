-- Devolução sem reparo: decisão e entrega física são eventos distintos.
begin;
create table private.order_unrepaired_return_attempts (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 service_order_id uuid not null references public.service_orders(id),
 prior_situation_id uuid not null references public.os_situations(id),
 waiting_situation_id uuid not null references public.os_situations(id),
 reason text not null check(length(btrim(reason))>=8),
 reason_category text not null,
 observations text not null default '',
 started_by uuid not null references auth.users(id),
 started_at timestamptz not null default now(),
 notified_at timestamptz,
 notified_by uuid references auth.users(id),
 notification_message_id uuid references public.union_whatsapp_messages(id),
 cancelled_by uuid references auth.users(id),
 cancelled_at timestamptz,
 completed_at timestamptz
);
alter table private.order_unrepaired_return_attempts enable row level security;
revoke all on private.order_unrepaired_return_attempts from public,anon,authenticated;
create unique index order_unrepaired_return_active_idx on private.order_unrepaired_return_attempts(service_order_id)
 where cancelled_at is null and completed_at is null;

create function private.ensure_unrepaired_waiting_situation(p_org uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 insert into public.os_situations(organization_id,name,slug,color,sort_order,is_active)
 values(p_org,'Aguardando retirada sem reparo','aguardando-retirada-sem-reparo','#d97706',
 coalesce((select max(sort_order)+1 from public.os_situations where organization_id=p_org),100),true)
 on conflict(organization_id,slug) do nothing;
 select id into sid from public.os_situations where organization_id=p_org and slug='aguardando-retirada-sem-reparo' and is_active;
 if sid is null then raise exception 'Ative a situação Aguardando retirada sem reparo.'; end if;
 insert into public.service_type_situations(organization_id,service_type_id,situation_id,use_default_hours,sla_hours,sort_order)
 select st.organization_id,st.id,sid,true,null,
 coalesce((select max(sort_order)+1 from public.service_type_situations ss where ss.service_type_id=st.id),100)
 from public.service_types st where st.organization_id=p_org
 and not exists(select 1 from public.service_type_situations ss where ss.service_type_id=st.id and ss.situation_id=sid)
 on conflict do nothing;
 return sid;
end; $$;
revoke all on function private.ensure_unrepaired_waiting_situation(uuid) from public,anon,authenticated;

do $$ declare o record; begin
 for o in select id from public.organizations loop
  perform private.ensure_unrepaired_waiting_situation(o.id);
 end loop;
end; $$;

create function public.get_order_unrepaired_return_v1(p_organization_id uuid,p_order_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not private.is_organization_member(p_organization_id)
 or not private.has_effective_organization_permission(p_organization_id,'orders.complete')
 then raise exception 'Sem permissão para devolver esta OS.' using errcode='42501'; end if;
 select to_jsonb(a) into result from private.order_unrepaired_return_attempts a
 where a.organization_id=p_organization_id and a.service_order_id=p_order_id
 and a.cancelled_at is null and a.completed_at is null;
 return result;
end; $$;

create function public.start_order_unrepaired_return_v1(p_organization_id uuid,p_order_id uuid,p_category text,p_observations text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.service_orders%rowtype; a private.order_unrepaired_return_attempts%rowtype; sid uuid; reason text;
begin
 if auth.uid() is null or not private.is_organization_member(p_organization_id)
 or not private.has_effective_organization_permission(p_organization_id,'orders.complete')
 then raise exception 'Sem permissão para devolver esta OS.' using errcode='42501'; end if;
 select * into o from public.service_orders where id=p_order_id and organization_id=p_organization_id for update;
 if not found or o.completed_at is not null or o.cancelled_at is not null
 then raise exception 'OS inexistente ou encerrada.'; end if;
 if p_category is null or p_category not in ('Impossibilidade técnica','Peça indisponível','Orçamento reprovado','Desistência do cliente','Equipamento sem defeito constatado','Reparo economicamente inviável','Outros')
 then raise exception 'Selecione o motivo da devolução.'; end if;
 if p_category='Outros' and length(btrim(coalesce(p_observations,'')))<8 then raise exception 'Descreva o motivo da devolução.'; end if;
 if exists(select 1 from public.service_order_quote_proposals q where q.organization_id=p_organization_id and q.service_order_id=p_order_id and q.applied_at is not null)
 or exists(select 1 from public.financial_entries f where f.organization_id=p_organization_id and f.origin_type='service_order' and f.origin_reference=p_order_id::text and f.approval_status is distinct from 'cancelled' and f.approval_status is distinct from 'reversed')
 then raise exception 'Regularize o orçamento aplicado ou os títulos financeiros antes de iniciar a devolução.'; end if;
 if exists(select 1 from public.service_order_terminal_closures c where c.service_order_id=p_order_id)
 then raise exception 'Esta OS já possui encerramento registrado.'; end if;
 select * into a from private.order_unrepaired_return_attempts where service_order_id=p_order_id and cancelled_at is null and completed_at is null;
 if found then return to_jsonb(a); end if;
 sid:=private.ensure_unrepaired_waiting_situation(p_organization_id);
 reason:=p_category||case when btrim(coalesce(p_observations,''))='' then '' else ': '||btrim(p_observations) end;
 insert into private.order_unrepaired_return_attempts(organization_id,service_order_id,prior_situation_id,waiting_situation_id,reason,reason_category,observations,started_by)
 values(p_organization_id,p_order_id,o.situation_id,sid,reason,p_category,btrim(coalesce(p_observations,'')),auth.uid()) returning * into a;
 perform set_config('app.unrepaired_return_transition','true',true);
 update public.service_orders set situation_id=sid,updated_at=now() where id=p_order_id and organization_id=p_organization_id;
 perform set_config('app.unrepaired_return_transition','false',true);
 return to_jsonb(a);
end; $$;

create function public.cancel_order_unrepaired_return_v1(p_organization_id uuid,p_order_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare o public.service_orders%rowtype; a private.order_unrepaired_return_attempts%rowtype;
begin
 if auth.uid() is null or not private.is_organization_member(p_organization_id)
 or not private.has_effective_organization_permission(p_organization_id,'orders.complete')
 then raise exception 'Sem permissão para cancelar a devolução.' using errcode='42501'; end if;
 select * into o from public.service_orders where id=p_order_id and organization_id=p_organization_id for update;
 if not found or o.completed_at is not null or o.cancelled_at is not null then raise exception 'OS inexistente ou encerrada.'; end if;
 select * into a from private.order_unrepaired_return_attempts where organization_id=p_organization_id and service_order_id=p_order_id and cancelled_at is null and completed_at is null;
 if not found then raise exception 'Não existe devolução pendente.'; end if;
 if exists(select 1 from public.document_signature_requests r join public.print_templates t on t.id=r.print_template_id and t.organization_id=r.organization_id
 where r.organization_id=p_organization_id and r.service_order_id=p_order_id and t.document_type='TERMO_DEVOLUCAO_SEM_REPARO'
 and r.created_at>=a.started_at and r.status='signed')
 then raise exception 'O termo de recebimento já foi assinado. Regularize a entrega antes de cancelar.'; end if;
 perform set_config('app.unrepaired_return_transition','true',true);
 update public.service_orders set situation_id=a.prior_situation_id,updated_at=now() where id=p_order_id and organization_id=p_organization_id;
 update private.order_unrepaired_return_attempts set cancelled_at=now(),cancelled_by=auth.uid() where id=a.id;
 perform set_config('app.unrepaired_return_transition','false',true);
end; $$;

-- Protege também Kanban, alterações diretas e versões antigas do frontend.
create function private.guard_unrepaired_return_transition() returns trigger
language plpgsql security definer set search_path='' as $$
declare a private.order_unrepaired_return_attempts%rowtype; waiting boolean;
begin
 waiting:=exists(select 1 from public.os_situations s where s.id=new.situation_id and s.organization_id=new.organization_id and s.slug='aguardando-retirada-sem-reparo');
 if tg_op='INSERT' then
  if waiting then raise exception 'Inicie a devolução pelo fluxo da OS.'; end if;
  return new;
 end if;
 if current_setting('app.unrepaired_return_transition',true)='true' then return new; end if;
 select * into a from private.order_unrepaired_return_attempts where service_order_id=old.id and cancelled_at is null and completed_at is null;
 if found then
  if new.completed_at is not null and old.completed_at is null and new.closure_outcome='returned_unrepaired'
    and current_setting('app.special_order_exit',true)='true' then
   if not exists(select 1 from public.service_order_terminal_closures c join public.document_signature_requests r on r.id=c.signature_request_id
   where c.service_order_id=old.id and c.organization_id=old.organization_id and c.outcome='returned_unrepaired'
   and c.reason=a.reason and r.created_at>=a.started_at and r.signed_at>=a.started_at
   and exists(select 1 from public.service_order_situation_media m where m.organization_id=old.organization_id and m.service_order_id=old.id and m.media_id=c.evidence_media_id and m.created_at>=a.started_at))
   then raise exception 'Confirme o termo e a evidência da devolução atual.'; end if;
   update private.order_unrepaired_return_attempts set completed_at=new.completed_at where id=a.id;
   return new;
  end if;
  if new.situation_id is distinct from old.situation_id or new.completed_at is distinct from old.completed_at
  or new.cancelled_at is distinct from old.cancelled_at or new.status_id is distinct from old.status_id
  or new.is_solved is distinct from old.is_solved or new.closure_outcome is distinct from old.closure_outcome
  then raise exception 'Confirme ou cancele a devolução pendente pelo modal.'; end if;
 elsif waiting or (new.closure_outcome='returned_unrepaired' and old.completed_at is null and new.completed_at is not null) then
  raise exception 'Inicie a devolução antes de confirmar a entrega.';
 end if;
 return new;
end; $$;
create trigger trg_guard_unrepaired_return_transition before insert or update of situation_id,completed_at,cancelled_at,status_id,is_solved,closure_outcome
on public.service_orders for each row execute function private.guard_unrepaired_return_transition();
revoke all on function private.guard_unrepaired_return_transition() from public,anon,authenticated;
revoke all on function public.get_order_unrepaired_return_v1(uuid,uuid),public.start_order_unrepaired_return_v1(uuid,uuid,text,text),public.cancel_order_unrepaired_return_v1(uuid,uuid) from public,anon;
grant execute on function public.get_order_unrepaired_return_v1(uuid,uuid),public.start_order_unrepaired_return_v1(uuid,uuid,text,text),public.cancel_order_unrepaired_return_v1(uuid,uuid) to authenticated;
-- Confirma apenas mensagem de saída persistida pelo WhatsApp, do operador e cliente desta OS.
create function public.mark_order_unrepaired_return_notified_v1(p_organization_id uuid,p_order_id uuid,p_attempt_id uuid,p_conversation_id uuid,p_provider_message_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.order_unrepaired_return_attempts%rowtype; o public.service_orders%rowtype; m public.union_whatsapp_messages%rowtype; phone text;
begin
 if auth.uid() is null or not private.is_organization_member(p_organization_id)
 or not private.has_effective_organization_permission(p_organization_id,'orders.complete')
 or not private.has_effective_organization_permission(p_organization_id,'whatsapp.inbox.send')
 then raise exception 'Sem permissão para registrar a notificação.' using errcode='42501'; end if;
 select * into o from public.service_orders where organization_id=p_organization_id and id=p_order_id for update;
 if not found then raise exception 'OS não encontrada.'; end if;
 select * into a from private.order_unrepaired_return_attempts where id=p_attempt_id and organization_id=p_organization_id and service_order_id=p_order_id and cancelled_at is null and completed_at is null for update;
 if not found then raise exception 'Devolução pendente não encontrada.'; end if;
 select msg.* into m from public.union_whatsapp_messages msg
 where msg.organization_id=p_organization_id and msg.conversation_id=p_conversation_id
 and msg.provider_message_id=p_provider_message_id and msg.direction='outgoing'
 and msg.message_type='text' and msg.sender_user_id=auth.uid() and msg.origin='union'
 and msg.sent_at>=a.started_at and msg.delivery_status in ('sent','delivered','read')
 order by msg.sent_at desc limit 1;
 if not found then raise exception 'Envio da mensagem ainda não confirmado.'; end if;
 select regexp_replace(coalesce(c.contact_phone,''),'[^0-9]','','g') into phone
 from public.union_whatsapp_conversations c where c.organization_id=p_organization_id and c.id=p_conversation_id
 and c.channel_id=m.channel_id and c.account_phone=m.account_phone;
 if not found or phone !~ '^55[1-9][0-9]{9,10}$' then raise exception 'Conversa não encontrada ou telefone inválido.'; end if;
 if not (
  exists(select 1 from public.customers c cross join lateral unnest(array[c.phone,c.whatsapp]) n(value)
   where c.organization_id=p_organization_id and c.id=o.customer_id
   and regexp_replace(coalesce(n.value,''),'[^0-9]','','g') in (phone,substring(phone from 3)))
  or exists(select 1 from public.union_whatsapp_order_contacts l where l.organization_id=p_organization_id and l.service_order_id=p_order_id and l.conversation_id=p_conversation_id and l.channel_id=m.channel_id and l.account_phone=m.account_phone)
  or ((private.has_effective_organization_permission(p_organization_id,'registrations.contacts.view') or private.has_effective_organization_permission(p_organization_id,'registrations.contacts.manage'))
   and exists(select 1 from public.entities e join public.entity_contacts ec on ec.entity_id=e.id and ec.organization_id=e.organization_id
    cross join lateral unnest(array[ec.phone,ec.whatsapp]) n(value)
    where e.organization_id=p_organization_id and e.legacy_customer_id=o.customer_id and ec.is_active
    and regexp_replace(coalesce(n.value,''),'[^0-9]','','g') in (phone,substring(phone from 3))))
 ) then raise exception 'Mensagem não pertence a um contato desta OS.' using errcode='42501'; end if;
 -- Mantém a primeira notificação confirmada; abrir ou reenviar não apaga o registro.
 if a.notified_at is null then
  update private.order_unrepaired_return_attempts set notified_at=m.sent_at,notified_by=auth.uid(),notification_message_id=m.id where id=a.id returning * into a;
 end if;
 return to_jsonb(a);
end; $$;
revoke all on function public.mark_order_unrepaired_return_notified_v1(uuid,uuid,uuid,uuid,text) from public,anon;
grant execute on function public.mark_order_unrepaired_return_notified_v1(uuid,uuid,uuid,uuid,text) to authenticated;

commit;
