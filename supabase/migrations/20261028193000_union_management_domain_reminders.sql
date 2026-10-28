-- Domínios e SSL geram tarefas e lembretes reutilizando o módulo de trabalho da Union.
begin;
alter table public.work_items add column if not exists management_record_id uuid references public.management_records(id) on delete set null;
create unique index if not exists work_items_management_deadline_unique
on public.work_items(management_record_id,category)
where management_record_id is not null and category in ('domain_renewal','ssl_renewal');

create or replace function private.management_safe_local_due(p_date text)
returns timestamptz language plpgsql immutable set search_path='' as $$
declare v_date date;
begin
 if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
 begin v_date:=p_date::date; exception when others then return null; end;
 return ((v_date + time '12:00') at time zone 'America/Sao_Paulo');
end; $$;
revoke all on function private.management_safe_local_due(text) from public,anon,authenticated;

create or replace function private.management_sync_domain_tasks()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_kind text; v_due timestamptz; v_key text; v_title text;
begin
 if new.kind <> 'website' then return new; end if;
 -- A mudança de management_records já passou pela política platform.management.manage.
 v_org:=public.platform_operator_organization_id();
 foreach v_kind in array array['domain_renewal','ssl_renewal'] loop
   v_key:=case when v_kind='domain_renewal' then 'renewal_date' else 'ssl_expires_at' end;
   v_due:=case when new.deleted_at is null then private.management_safe_local_due(new.metadata->>v_key) else null end;
   if v_due is null then
     update public.work_items set status='cancelled'
     where management_record_id=new.id and category=v_kind and status not in ('completed','cancelled');
   else
     v_title:=left((case when v_kind='domain_renewal' then 'Renovar domínio · ' else 'Renovar SSL · ' end)||new.title,180);
     insert into public.work_items(organization_id,management_space_id,management_record_id,kind,title,
       description,status,priority,category,due_at,reminder_minutes,assigned_employee_ids,created_by)
     values(v_org,new.space_id,new.id,'task',v_title,
       'Prazo cadastrado na Central de Gestão da Union World.','pending','high',v_kind,v_due,
       array[43200,10080,1440]::integer[],'{}'::uuid[],(select auth.uid()))
     on conflict(management_record_id,category) where management_record_id is not null and category in ('domain_renewal','ssl_renewal')
     do update set title=excluded.title,due_at=excluded.due_at,
       status=case when public.work_items.due_at is distinct from excluded.due_at
            then 'pending' else public.work_items.status end,
       management_space_id=excluded.management_space_id,reminder_minutes=excluded.reminder_minutes;
   end if;
 end loop;
 return new;
end; $$;
revoke all on function private.management_sync_domain_tasks() from public,anon,authenticated;
create trigger management_domains_work_items after insert or update of title,metadata,deleted_at
on public.management_records for each row execute function private.management_sync_domain_tasks();
commit;