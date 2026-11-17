-- Situações terminais e resultados especiais só podem ser gravados pelo fluxo
-- transacional que validou assinatura, evidência e peças.
create or replace function private.guard_signed_terminal_order_situation_v1()
returns trigger language plpgsql security definer set search_path=''
as $body$
declare v_terminal boolean;
begin
 v_terminal:=new.situation_id is not null and exists(
   select 1 from public.os_situations s where s.id=new.situation_id
    and s.organization_id=new.organization_id
    and s.slug in ('descarte','equipamento-devolvido-sem-reparo'));
 if tg_op='INSERT' then
   if v_terminal then raise exception
     'Situações de descarte ou devolução são definidas exclusivamente no encerramento confirmado.'
     using errcode='23514'; end if;
   if new.closure_outcome in ('disposal_confirmed','returned_unrepaired') then
    raise exception 'Resultado de encerramento reservado à confirmação assinada.' using errcode='23514'; end if;
   return new;
 end if;
 if current_setting('app.special_order_exit',true)='true' then return new; end if;
 if new.closure_outcome is distinct from old.closure_outcome and
    (new.closure_outcome in ('disposal_confirmed','returned_unrepaired')
     or old.closure_outcome in ('disposal_confirmed','returned_unrepaired')) then
    raise exception 'O resultado de descarte ou devolução exige o termo assinado.' using errcode='23514';
 end if;
 if v_terminal and new.situation_id is distinct from old.situation_id then
    raise exception 'Confirme o termo, a evidência e a conferência de peças para mudar a situação.' using errcode='23514';
 end if;
 return new;
end;
$body$;
drop trigger if exists trg_guard_signed_terminal_order_situation on public.service_orders;
create trigger trg_guard_signed_terminal_order_situation
before insert or update of situation_id,closure_outcome,completed_at
on public.service_orders for each row
execute function private.guard_signed_terminal_order_situation_v1();
