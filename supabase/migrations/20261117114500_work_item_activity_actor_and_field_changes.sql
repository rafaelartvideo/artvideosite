-- Histórico auditável de compromissos e tarefas: autor e diferenças de campos.
ALTER TABLE public.work_item_activity
  ADD COLUMN IF NOT EXISTS actor_name_snapshot text;
ALTER TABLE public.work_item_activity
  ADD COLUMN IF NOT EXISTS changes jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE OR REPLACE FUNCTION private.work_item_audit_value(
  p_organization_id uuid,p_field text,p_value jsonb)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE
  v_text text;
BEGIN
  IF p_value IS NULL OR p_value='null'::jsonb THEN RETURN 'Não informado'; END IF;
  IF p_field='assigned_employee_ids' THEN
    SELECT string_agg(e.full_name,', ' ORDER BY e.full_name) INTO v_text
    FROM public.employees e
    WHERE e.organization_id=p_organization_id
      AND e.id IN (
        SELECT val::uuid FROM jsonb_array_elements_text(p_value) AS entries(val)
      );
    RETURN COALESCE(NULLIF(v_text,''),'Nenhum responsável');
  ELSIF p_field='reminder_minutes' THEN
    SELECT string_agg(
      CASE WHEN val::integer=0 THEN 'No vencimento'
           WHEN val::integer=30 THEN '30 minutos antes'
           WHEN val::integer=60 THEN '1 hora antes'
           WHEN val::integer=1440 THEN '1 dia antes'
           WHEN val::integer=10080 THEN '7 dias antes'
           WHEN val::integer%1440=0 THEN (val::integer/1440)::text||' dias antes'
           WHEN val::integer%60=0 THEN (val::integer/60)::text||' horas antes'
           ELSE val||' minutos antes'
      END,', ' ORDER BY ord
    ) INTO v_text FROM jsonb_array_elements_text(p_value) WITH ORDINALITY AS entries(val,ord);
    RETURN COALESCE(v_text,'Nenhum lembrete');
  ELSIF p_field='customer_id' THEN
    SELECT COALESCE(NULLIF(btrim(c.trade_name),''),c.full_name)
       INTO v_text
    FROM public.customers c
    WHERE c.id=(p_value #>> '{}')::uuid AND c.organization_id=p_organization_id;
    RETURN COALESCE(v_text,'Cliente não encontrado');
  ELSIF p_field='service_order_id' THEN
    SELECT 'OS '||so.os_number INTO v_text
    FROM public.service_orders so
    WHERE so.id=(p_value #>> '{}')::uuid AND so.organization_id=p_organization_id;
    RETURN COALESCE(v_text,'OS não encontrada');
  END IF;
  RETURN NULLIF(p_value #>> '{}','');
END;
$function$;
REVOKE ALL ON FUNCTION private.work_item_audit_value(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.work_item_activity_actor_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
  IF new.actor_user_id IS NOT NULL THEN
    SELECT COALESCE(
      (SELECT NULLIF(btrim(p.full_name),'') FROM public.profiles p WHERE p.id=new.actor_user_id),
      (SELECT NULLIF(btrim(e.full_name),'') FROM public.employees e
         WHERE e.organization_id=new.organization_id AND e.profile_id=new.actor_user_id
         ORDER BY e.id LIMIT 1)
    ) INTO new.actor_name_snapshot;
  END IF;
  RETURN new;
END;
$function$;
REVOKE ALL ON FUNCTION private.work_item_activity_actor_snapshot() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS work_item_activity_actor_snapshot ON public.work_item_activity;
CREATE TRIGGER work_item_activity_actor_snapshot
BEFORE INSERT ON public.work_item_activity
FOR EACH ROW EXECUTE FUNCTION private.work_item_activity_actor_snapshot();
-- Eventos anteriores já possuem o ID do autor; preencher apenas o nome.
-- Alterações antigas não podem ser reconstruídas sem o snapshot original.
UPDATE public.work_item_activity a
SET actor_name_snapshot=COALESCE(
    (SELECT NULLIF(btrim(p.full_name),'') FROM public.profiles p WHERE p.id=a.actor_user_id),
    (SELECT NULLIF(btrim(e.full_name),'') FROM public.employees e
      WHERE e.organization_id=a.organization_id AND e.profile_id=a.actor_user_id
      ORDER BY e.id LIMIT 1)
)
WHERE a.actor_user_id IS NOT NULL AND a.actor_name_snapshot IS NULL;

CREATE OR REPLACE FUNCTION private.work_item_after_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_employee uuid;
  v_profile uuid;
  v_minutes int;
  v_changes jsonb := '[]'::jsonb;
  v_old jsonb;
  v_new jsonb;
  v_field text;
begin
  -- Todas as mudanças do mesmo salvamento entram em um único evento.
  -- Campos técnicos (updated_at, completed_at, completed_by) não geram ruído.
  if tg_op='UPDATE' then
    foreach v_field in array array[
      'kind','title','description','status','outcome','priority','category',
      'starts_at','due_at','reminder_minutes','assigned_employee_ids',
      'customer_id','service_order_id'
    ] loop
      v_old := to_jsonb(old)->v_field;
      v_new := to_jsonb(new)->v_field;
      if v_old is distinct from v_new then
        v_changes := v_changes || jsonb_build_array(jsonb_build_object(
          'field',v_field,
          'old',private.work_item_audit_value(old.organization_id,v_field,v_old),
          'new',private.work_item_audit_value(new.organization_id,v_field,v_new)
        ));
      end if;
    end loop;
  end if;

  if tg_op='INSERT' or jsonb_array_length(v_changes)>0 then
    insert into public.work_item_activity(organization_id,work_item_id,actor_user_id,action,note,changes)
    values(new.organization_id,new.id,auth.uid(),
      case when tg_op='INSERT' then 'created'
      when new.status is distinct from old.status then 'status:'||new.status
      when new.due_at is distinct from old.due_at then 'rescheduled'
      when new.assigned_employee_ids is distinct from old.assigned_employee_ids then 'assigned'
      else 'updated' end,
      case when new.kind='commitment' and new.status='completed' then new.outcome else null end,
      v_changes);
  end if;

  if new.due_at is null or new.status in ('completed','cancelled') then
    delete from public.work_item_reminders where work_item_id=new.id and sent_at is null;
  elsif tg_op='INSERT' or new.due_at is distinct from old.due_at
    or new.reminder_minutes is distinct from old.reminder_minutes
    or new.status is distinct from old.status then
    delete from public.work_item_reminders where work_item_id=new.id and sent_at is null;
    foreach v_minutes in array new.reminder_minutes loop
      insert into public.work_item_reminders(organization_id,work_item_id,remind_at)
      values(new.organization_id,new.id,new.due_at-make_interval(mins=>v_minutes))
      on conflict(work_item_id,remind_at) do nothing;
    end loop;
  end if;

  if tg_op='INSERT' or new.assigned_employee_ids is distinct from old.assigned_employee_ids then
    foreach v_employee in array new.assigned_employee_ids loop
      if tg_op='INSERT' or not (v_employee=any(old.assigned_employee_ids)) then
        select e.profile_id into v_profile from public.employees e where e.id=v_employee and e.organization_id=new.organization_id;
        if v_profile is not null and v_profile is distinct from auth.uid() then
          insert into public.organization_notifications
            (organization_id,recipient_user_id,actor_user_id,module_key,event_type,entity_type,entity_id,title,message,route,visibility_permissions)
          values(new.organization_id,v_profile,auth.uid(),'workItems','created','work_item',new.id::text,
            'Nova atividade atribuida',new.title,'/admin/work-items?item='||new.id::text,array['work_items.view']);
        end if;
      end if;
    end loop;
  end if;

  -- Notifica os envolvidos quando o andamento muda, sem duplicar o alerta para quem alterou.
  if tg_op='UPDATE' and new.status is distinct from old.status then
    for v_profile in
      select distinct participants.user_id
      from (
        select new.created_by as user_id
        union all
        select e.profile_id from public.employees e
        where e.organization_id=new.organization_id
          and e.id=any(new.assigned_employee_ids)
      ) participants
      where participants.user_id is not null and participants.user_id is distinct from auth.uid()
    loop
      insert into public.organization_notifications
        (organization_id,recipient_user_id,actor_user_id,module_key,event_type,entity_type,entity_id,
         title,message,route,visibility_permissions)
      values (new.organization_id,v_profile,auth.uid(),'workItems','updated','work_item',new.id::text,
        'Andamento atualizado',new.title,'/admin/work-items?item='||new.id::text,array['work_items.view']);
    end loop;
  end if;
  return new;
end;
$function$;
REVOKE ALL ON FUNCTION private.work_item_after_write() FROM PUBLIC,anon,authenticated;
