-- Run in SQL editor. Every fixture and created request is rolled back.
begin;
do $$
declare
 v_service_id uuid;
 f jsonb;
 a jsonb:='{"zip_code":"49000-001","street":"Rua de teste","number":"100","city":"Aracaju","state":"SE"}';
 sel jsonb:='{"quantity":1}';
 p text:='ORC-TEST-'||gen_random_uuid();
 r jsonb;
begin
 select id into v_service_id from public.services where organization_id='00000000-0000-4000-8000-000000000001' and is_active and show_in_catalog order by created_at limit 1;
 if v_service_id is null then raise exception 'No published service for fixture'; end if;
 update public.services set public_booking='{}' where id=v_service_id;
 -- This fixture uses a standard option if the service has variants.
 select sel||jsonb_build_object('variant_id',id) into sel from public.service_variants where service_variants.service_id=v_service_id and is_active order by sort_order limit 1;
 sel:=coalesce(sel,'{"quantity":1}'::jsonb);
 f:=jsonb_build_object('servico',v_service_id,'customerType','PF','nome','Teste técnico rollback','cpf','52998224725','birthDate','01/01/1990','whatsapp','11999999999','email','teste@example.com','descricao','Teste com espaços   ');
 execute 'set local role anon';
 r:=public.submit_public_service_quote_v1(f,a,sel,p);
 if not coalesce((r->>'success')::boolean,false) then raise exception 'Submission failed: %',r; end if;
 r:=public.submit_public_service_quote_v1(f,a,sel,p);
 if not coalesce((r->>'success')::boolean,false) then raise exception 'Retry failed: %',r; end if;
 r:=public.submit_public_service_quote_v1(f||'{"customerType":"PJ","tradeName":"Empresa teste rollback","cnpj":"11222333000181","birthDate":"32/12/2000"}',a,sel,p||'-pj');
 if not coalesce((r->>'success')::boolean,false) then raise exception 'PJ hidden PF field failed: %',r; end if;
 -- Existing customer requests must capture a distinct address and current callback contact.
 r:=public.submit_public_service_quote_v1(f,a||'{"street":"Outro local de atendimento"}',sel,p||'-other');
 if not coalesce((r->>'success')::boolean,false) then raise exception 'Existing customer failed: %',r; end if;
 execute 'reset role';
 if (select count(*) from public.quote_requests where protocol=p)<>1 then raise exception 'Duplicate request'; end if;
 if not exists(select 1 from public.quote_requests where protocol=p||'-other' and customer_message like '%Outro local de atendimento%' and customer_message like '%teste@example.com%') then raise exception 'Address/contact missing'; end if;
 update public.services set public_booking=jsonb_build_object('coverage_mode','ranges','cep_ranges',jsonb_build_array(jsonb_build_object('start','49000-001','end','49099-999')),'schedule_enabled',true,'weekdays',jsonb_build_array(0,1,2,3,4,5,6),'slots',jsonb_build_array(jsonb_build_object('start','08:00','end','10:00')),'lead_days',1,'horizon_days',30,'blocked_dates',jsonb_build_array()) where id=v_service_id;
 sel:=sel||jsonb_build_object('date',((now() at time zone 'America/Sao_Paulo')::date+1)::text,'slot','08:00–10:00');
 execute 'set local role anon';
 r:=public.submit_public_service_quote_v1(f,a,sel,p||'-schedule');
 if not coalesce((r->>'success')::boolean,false) then raise exception 'Valid schedule failed: %',r; end if;
 r:=public.submit_public_service_quote_v1(f,a||'{"zip_code":"49100-000"}',sel,p||'-out');
 if (r->>'success')::boolean then raise exception 'Outside CEP accepted'; end if;
 r:=public.submit_public_service_quote_v1(f,a,sel||'{"date":"2020-01-01"}',p||'-past');
 if (r->>'success')::boolean then raise exception 'Past date accepted'; end if;
 execute 'reset role';
end $$;
rollback;
select 'PASS: anonymous submission, retry, PF/PJ, address/contact, coverage, calendar; all fixtures rolled back' as result;
