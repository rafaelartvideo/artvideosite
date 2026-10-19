-- Validate the selected local weekday and its own intervals at submission time.
-- The service's existing RLS and public RPC permissions remain unchanged.
begin;
create or replace function private.submit_public_service_quote_v1(p_form jsonb,p_address jsonb,p_selection jsonb,p_protocol text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 s public.services%rowtype;
 c jsonb;
 v_variant text;
 v_quantity integer;
 v_date date;
 v_slot text;
 v_weekday text;
 v_day_slots jsonb;
 v_cep text:=regexp_replace(coalesce(p_address->>'zip_code',''),'[^0-9]','','g');
 v_today date:=(now() at time zone 'America/Sao_Paulo')::date;
 v_message text;
 v_result jsonb;
begin
 select * into s from public.services where id=(p_form->>'servico')::uuid
  and organization_id='00000000-0000-4000-8000-000000000001'::uuid and is_active and show_in_catalog;
 if not found then return jsonb_build_object('success',false,'error','Este serviço não está disponível.'); end if;
 c:=s.public_booking;
 if length(v_cep)<>8 or v_cep='00000000' then return jsonb_build_object('success',false,'error','Informe um CEP válido.'); end if;
 if c->>'coverage_mode'='ranges' and jsonb_array_length(coalesce(c->'cep_ranges','[]'))>0 and not exists (
  select 1 from jsonb_array_elements(c->'cep_ranges') r where v_cep between regexp_replace(r->>'start','[^0-9]','','g') and regexp_replace(r->>'end','[^0-9]','','g')
 ) then return jsonb_build_object('success',false,'error','Este CEP está fora da área atendida pelo serviço.'); end if;
 if nullif(btrim(p_address->>'street'),'') is null or nullif(btrim(p_address->>'number'),'') is null or nullif(btrim(p_address->>'city'),'') is null or length(coalesce(p_address->>'state',''))<>2 then
  return jsonb_build_object('success',false,'error','Preencha o endereço completo do atendimento.'); end if;
 v_quantity:=(p_selection->>'quantity')::integer;
 if v_quantity is null or v_quantity<1 or v_quantity>10 then return jsonb_build_object('success',false,'error','Quantidade inválida.'); end if;
 if exists(select 1 from public.service_variants where service_id=s.id and is_active) then
  select title into v_variant from public.service_variants where service_id=s.id and is_active and id=(p_selection->>'variant_id')::uuid;
  if not found then return jsonb_build_object('success',false,'error','Selecione uma opção válida do serviço.'); end if;
 end if;
 if coalesce((c->>'schedule_enabled')::boolean,false) then
  v_date:=(p_selection->>'date')::date; v_slot:=p_selection->>'slot';
  -- For updated services, use intervals belonging to the selected weekday.
  -- Existing public_booking configurations keep their shared legacy slots.
  if v_date is not null then
   v_weekday:=extract(dow from v_date)::integer::text;
   v_day_slots:=case when jsonb_typeof(c->'weekly_slots')='object'
    then coalesce(c->'weekly_slots'->v_weekday,'[]'::jsonb)
    else coalesce(c->'slots','[]'::jsonb) end;
  else
   v_day_slots:='[]'::jsonb;
  end if;
  if v_date is null or v_date<v_today+coalesce((c->>'lead_days')::integer,1) or v_date>=v_today+coalesce((c->>'horizon_days')::integer,30)
   or not coalesce((c->'weekdays') @> to_jsonb(array[extract(dow from v_date)::integer]),false)
   or coalesce((c->'blocked_dates') ? to_char(v_date,'YYYY-MM-DD'),false)
   or not exists(select 1 from jsonb_array_elements(v_day_slots) r
    where (r->>'start')||'–'||(r->>'end')=v_slot and (v_date>v_today or (r->>'start')::time>(now() at time zone 'America/Sao_Paulo')::time)) then
   return jsonb_build_object('success',false,'error','O horário escolhido não está mais disponível. Escolha outra preferência.'); end if;
 end if;
 if length(coalesce(p_protocol,''))>100 or length(coalesce(p_form->>'descricao',''))>5000 then return jsonb_build_object('success',false,'error','Revise os dados informados.'); end if;
 v_message:=concat_ws(E'\n', 'Solicitação pelo site — orçamento sem pagamento antecipado.',
  'Serviço: '||s.title, 'Opção: '||coalesce(v_variant,'Padrão'), 'Quantidade: '||v_quantity,
  case when v_date is not null then 'Preferência de atendimento (a confirmar): '||to_char(v_date,'DD/MM/YYYY')||' · '||v_slot else 'Agendamento: combinar com a equipe.' end,
  'Endereço do atendimento: '||concat_ws(', ',p_address->>'street',p_address->>'number',nullif(p_address->>'complement',''),p_address->>'neighborhood',p_address->>'city',p_address->>'state',v_cep),
  'Contato desta solicitação: '||concat_ws(' · ',coalesce(nullif(p_form->>'nome',''),p_form->>'tradeName'),p_form->>'whatsapp',p_form->>'email'),
  nullif('Modelo: '||nullif(p_form->>'modelo',''),''), nullif(p_form->>'descricao',''));
 v_message:=btrim(v_message);
 if exists(select 1 from public.quote_requests q where q.organization_id=s.organization_id and q.service_id=s.id and q.protocol=p_protocol and q.customer_message=v_message) then
  return jsonb_build_object('success',true,'protocol',p_protocol);
 end if;
 v_result:=public.submit_public_quote_request(
  p_customer_type=>coalesce(p_form->>'customerType','PF'), p_full_name=>p_form->>'nome',
  p_whatsapp=>p_form->>'whatsapp',p_phone=>nullif(p_form->>'phone',''),
  p_birth_date=>case when p_form->>'customerType'='PF' then to_date(nullif(p_form->>'birthDate',''),'DD/MM/YYYY') else null end,p_email=>p_form->>'email',p_document=>p_form->>'cpf',
  p_trade_name=>p_form->>'tradeName',p_legal_name=>p_form->>'legalName',p_cnpj=>p_form->>'cnpj',
  p_service_id=>s.id,p_customer_message=>v_message,p_protocol=>p_protocol,
  p_zip_code=>v_cep,p_street=>p_address->>'street',p_number=>p_address->>'number',p_complement=>p_address->>'complement',p_neighborhood=>p_address->>'neighborhood',p_city=>p_address->>'city',p_state=>p_address->>'state')::jsonb;
 return jsonb_build_object('success',coalesce((v_result->>'success')::boolean,false),'error',v_result->>'error','protocol',v_result->>'protocol');
exception when invalid_text_representation or datetime_field_overflow then
 return jsonb_build_object('success',false,'error','Revise os dados, a data e a opção do serviço.');
end;$$;
commit;
