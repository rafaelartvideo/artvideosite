begin;

-- Clientes: o mesmo CPF/CNPJ pode existir em empresas diferentes,
-- mas não pode duplicar dentro da mesma organização.
drop index if exists public.customers_document_unique_idx;
drop index if exists public.customers_cnpj_unique_idx;

create unique index if not exists customers_organization_document_unique_idx
  on public.customers (organization_id, document)
  where document is not null and btrim(document) <> '';

create unique index if not exists customers_organization_cnpj_unique_idx
  on public.customers (organization_id, cnpj)
  where cnpj is not null and btrim(cnpj) <> '';

-- Situações da agenda passam a ser próprias por organização.
alter table public.appointment_situations
  drop constraint if exists appointment_situations_name_key;

create unique index if not exists appointment_situations_organization_name_uidx
  on public.appointment_situations (organization_id, name);

-- Status de orçamento passam a ser próprios por organização.
alter table public.request_statuses
  drop constraint if exists request_statuses_name_key;
alter table public.request_statuses
  drop constraint if exists request_statuses_slug_key;

create unique index if not exists request_statuses_organization_name_uidx
  on public.request_statuses (organization_id, name);
create unique index if not exists request_statuses_organization_slug_uidx
  on public.request_statuses (organization_id, slug);

-- Defaults de módulos operacionais por tenant.
create or replace function private.ensure_organization_module_defaults(
  p_organization_id uuid,
  p_module_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_organization_id is null then
    return;
  end if;

  if p_module_key = 'agenda' then
    insert into public.appointment_situations (
      organization_id, name, color, is_active, sort_order
    )
    values
      (p_organization_id, 'Agendado', '#0057e7', true, 1),
      (p_organization_id, 'Confirmado', '#7c3aed', true, 2),
      (p_organization_id, 'Em Andamento', '#f59e0b', true, 3),
      (p_organization_id, 'Concluído', '#16a34a', true, 4),
      (p_organization_id, 'Cancelado', '#dc2626', true, 5)
    on conflict (organization_id, name) do nothing;
  elsif p_module_key = 'quotes' then
    insert into public.request_statuses (
      organization_id, name, slug, color, sort_order, is_final
    )
    values
      (p_organization_id, 'Pendente', 'PENDENTE', '#F59E0B', 1, false),
      (p_organization_id, 'Em Análise', 'EM_ANALISE', '#3B82F6', 2, false),
      (p_organization_id, 'Aguardando Cliente', 'AGUARDANDO_CLIENTE', '#F59E0B', 3, false),
      (p_organization_id, 'Aprovado', 'APROVADO', '#22C55E', 4, false),
      (p_organization_id, 'Agendado', 'AGENDADO', '#3B82F6', 5, false),
      (p_organization_id, 'Concluído', 'CONCLUIDO', '#22C55E', 6, true),
      (p_organization_id, 'Cancelado', 'CANCELADO', '#EF4444', 7, true)
    on conflict (organization_id, slug) do nothing;
  end if;
end;
$$;

revoke all on function private.ensure_organization_module_defaults(uuid,text) from public;

create or replace function private.provision_organization_module_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_enabled
     and new.module_key in ('agenda','quotes')
     and (
       tg_op = 'INSERT'
       or old.is_enabled is distinct from new.is_enabled
       or old.module_key is distinct from new.module_key
     ) then
    perform private.ensure_organization_module_defaults(
      new.organization_id,
      new.module_key
    );
  end if;
  return new;
end;
$$;

revoke all on function private.provision_organization_module_defaults() from public;

drop trigger if exists provision_organization_module_defaults
  on public.organization_modules;
create trigger provision_organization_module_defaults
after insert or update of is_enabled, module_key
on public.organization_modules
for each row
execute function private.provision_organization_module_defaults();

do $$
declare
  module_row record;
begin
  for module_row in
    select organization_id, module_key
    from public.organization_modules
    where is_enabled
      and module_key in ('agenda','quotes')
  loop
    perform private.ensure_organization_module_defaults(
      module_row.organization_id,
      module_row.module_key
    );
  end loop;
end;
$$;

-- Validação tenant da Agenda.
create or replace function private.validate_appointment_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id is null then
    raise exception 'A empresa do agendamento é obrigatória.'
      using errcode = '23502';
  end if;

  if not exists (
    select 1
    from public.customers customer
    where customer.id = new.customer_id
      and customer.organization_id = new.organization_id
  ) then
    raise exception 'O cliente do agendamento não pertence à empresa selecionada.'
      using errcode = '42501';
  end if;

  if new.customer_address_id is not null
     and not exists (
       select 1
       from public.customer_addresses address
       where address.id = new.customer_address_id
         and address.customer_id = new.customer_id
         and address.organization_id = new.organization_id
     ) then
    raise exception 'O endereço selecionado não pertence ao cliente desta empresa.'
      using errcode = '42501';
  end if;

  if new.situation_id is not null
     and not exists (
       select 1
       from public.appointment_situations situation
       where situation.id = new.situation_id
         and situation.organization_id = new.organization_id
     ) then
    raise exception 'A situação do agendamento pertence a outra empresa.'
      using errcode = '42501';
  end if;

  if new.service_order_id is not null
     and not exists (
       select 1
       from public.service_orders service_order
       where service_order.id = new.service_order_id
         and service_order.organization_id = new.organization_id
         and service_order.customer_id = new.customer_id
     ) then
    raise exception 'A OS selecionada não pertence ao cliente e à empresa do agendamento.'
      using errcode = '42501';
  end if;

  if new.created_by is not null
     and not exists (
       select 1
       from public.organization_members member
       where member.organization_id = new.organization_id
         and member.user_id = new.created_by
         and member.status = 'active'
     ) then
    raise exception 'O usuário criador não pertence à empresa do agendamento.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_appointment_tenant() from public;

drop trigger if exists appointments_validate_tenant
  on public.appointments;
create trigger appointments_validate_tenant
before insert or update of organization_id, customer_id, customer_address_id,
  situation_id, service_order_id, created_by
on public.appointments
for each row
execute function private.validate_appointment_tenant();

create or replace function private.inherit_appointment_technician_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select appointment.organization_id
    into v_organization_id
  from public.appointments appointment
  where appointment.id = new.appointment_id;

  if v_organization_id is null then
    raise exception 'Agendamento não encontrado.'
      using errcode = '23503';
  end if;

  if not exists (
    select 1
    from public.employees employee
    where employee.id = new.employee_id
      and employee.organization_id = v_organization_id
      and employee.is_active
  ) then
    raise exception 'O técnico selecionado não pertence à empresa do agendamento.'
      using errcode = '42501';
  end if;

  new.organization_id := v_organization_id;
  return new;
end;
$$;

revoke all on function private.inherit_appointment_technician_organization() from public;

drop trigger if exists appointment_technicians_inherit_organization
  on public.appointment_technicians;
create trigger appointment_technicians_inherit_organization
before insert or update of appointment_id, employee_id
on public.appointment_technicians
for each row
execute function private.inherit_appointment_technician_organization();

create or replace function private.can_view_appointment(
  p_appointment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.appointments appointment
    where appointment.id = p_appointment_id
      and private.is_organization_module_enabled(
        appointment.organization_id,
        'agenda'
      )
      and private.can_access_shared_organization_resource(
        appointment.organization_id,
        'agenda',
        'read'
      )
      and private.has_effective_organization_permission(
        appointment.organization_id,
        'agenda.view'
      )
      and (
        private.has_effective_organization_permission(
          appointment.organization_id,
          'agenda.view_others'
        )
        or appointment.created_by = (select auth.uid())
        or exists (
          select 1
          from public.appointment_technicians technician_link
          join public.employees employee
            on employee.id = technician_link.employee_id
           and employee.organization_id = appointment.organization_id
          where technician_link.appointment_id = appointment.id
            and technician_link.organization_id = appointment.organization_id
            and employee.profile_id = (select auth.uid())
        )
      )
  );
$$;

revoke all on function private.can_view_appointment(uuid) from public;
grant execute on function private.can_view_appointment(uuid) to authenticated;

create or replace function private.can_manage_appointment(
  p_appointment_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.appointments appointment
    where appointment.id = p_appointment_id
      and private.is_organization_module_enabled(
        appointment.organization_id,
        'agenda'
      )
      and private.can_access_shared_organization_resource(
        appointment.organization_id,
        'agenda',
        'manage'
      )
      and private.has_effective_organization_permission(
        appointment.organization_id,
        p_permission_key
      )
  );
$$;

revoke all on function private.can_manage_appointment(uuid,text) from public;
grant execute on function private.can_manage_appointment(uuid,text) to authenticated;

drop policy if exists authenticated_manage_appointments on public.appointments;
drop policy if exists appointments_select_tenant on public.appointments;
drop policy if exists appointments_insert_tenant on public.appointments;
drop policy if exists appointments_update_tenant on public.appointments;
drop policy if exists appointments_delete_tenant on public.appointments;

create policy appointments_select_tenant
on public.appointments
for select to authenticated
using (private.can_view_appointment(id));

create policy appointments_insert_tenant
on public.appointments
for insert to authenticated
with check (
  private.is_organization_module_enabled(organization_id, 'agenda')
  and private.can_access_shared_organization_resource(
    organization_id, 'agenda', 'manage'
  )
  and private.has_effective_organization_permission(
    organization_id, 'agenda.create'
  )
);

create policy appointments_update_tenant
on public.appointments
for update to authenticated
using (
  private.can_manage_appointment(id, 'agenda.edit')
  or private.can_manage_appointment(id, 'agenda.reschedule')
)
with check (
  private.is_organization_module_enabled(organization_id, 'agenda')
  and private.can_access_shared_organization_resource(
    organization_id, 'agenda', 'manage'
  )
  and (
    private.has_effective_organization_permission(
      organization_id, 'agenda.edit'
    )
    or private.has_effective_organization_permission(
      organization_id, 'agenda.reschedule'
    )
  )
);

create policy appointments_delete_tenant
on public.appointments
for delete to authenticated
using (private.can_manage_appointment(id, 'agenda.delete'));

drop policy if exists authenticated_manage_appointment_technicians
  on public.appointment_technicians;
drop policy if exists appointment_technicians_select_tenant
  on public.appointment_technicians;
drop policy if exists appointment_technicians_insert_tenant
  on public.appointment_technicians;
drop policy if exists appointment_technicians_update_tenant
  on public.appointment_technicians;
drop policy if exists appointment_technicians_delete_tenant
  on public.appointment_technicians;

create policy appointment_technicians_select_tenant
on public.appointment_technicians
for select to authenticated
using (private.can_view_appointment(appointment_id));

create policy appointment_technicians_insert_tenant
on public.appointment_technicians
for insert to authenticated
with check (
  private.can_manage_appointment(appointment_id, 'agenda.edit')
  or private.can_manage_appointment(appointment_id, 'agenda.create')
);

create policy appointment_technicians_update_tenant
on public.appointment_technicians
for update to authenticated
using (private.can_manage_appointment(appointment_id, 'agenda.edit'))
with check (private.can_manage_appointment(appointment_id, 'agenda.edit'));

create policy appointment_technicians_delete_tenant
on public.appointment_technicians
for delete to authenticated
using (private.can_manage_appointment(appointment_id, 'agenda.edit'));

drop policy if exists authenticated_manage_appointment_situations
  on public.appointment_situations;
drop policy if exists appointment_situations_select_tenant
  on public.appointment_situations;
drop policy if exists appointment_situations_insert_tenant
  on public.appointment_situations;
drop policy if exists appointment_situations_update_tenant
  on public.appointment_situations;
drop policy if exists appointment_situations_delete_tenant
  on public.appointment_situations;

create policy appointment_situations_select_tenant
on public.appointment_situations
for select to authenticated
using (
  private.is_organization_module_enabled(organization_id, 'agenda')
  and private.can_access_shared_organization_resource(
    organization_id, 'agenda', 'read'
  )
  and private.has_effective_organization_permission(
    organization_id, 'agenda.view'
  )
);

create policy appointment_situations_insert_tenant
on public.appointment_situations
for insert to authenticated
with check (
  private.is_organization_module_enabled(organization_id, 'agenda')
  and private.can_access_shared_organization_resource(
    organization_id, 'agenda', 'manage'
  )
  and private.has_effective_organization_permission(
    organization_id, 'agenda.edit'
  )
);

create policy appointment_situations_update_tenant
on public.appointment_situations
for update to authenticated
using (
  private.is_organization_module_enabled(organization_id, 'agenda')
  and private.can_access_shared_organization_resource(
    organization_id, 'agenda', 'manage'
  )
  and private.has_effective_organization_permission(
    organization_id, 'agenda.edit'
  )
)
with check (
  private.is_organization_module_enabled(organization_id, 'agenda')
  and private.can_access_shared_organization_resource(
    organization_id, 'agenda', 'manage'
  )
  and private.has_effective_organization_permission(
    organization_id, 'agenda.edit'
  )
);

create policy appointment_situations_delete_tenant
on public.appointment_situations
for delete to authenticated
using (
  private.is_organization_module_enabled(organization_id, 'agenda')
  and private.can_access_shared_organization_resource(
    organization_id, 'agenda', 'manage'
  )
  and private.has_effective_organization_permission(
    organization_id, 'agenda.delete'
  )
);

-- Quotes: relações devem pertencer ao mesmo tenant.
create or replace function private.validate_quote_request_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id is null then
    raise exception 'A empresa do orçamento é obrigatória.'
      using errcode = '23502';
  end if;

  if not exists (
    select 1
    from public.customers customer
    where customer.id = new.customer_id
      and customer.organization_id = new.organization_id
  ) then
    raise exception 'O cliente do orçamento pertence a outra empresa.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.request_statuses status
    where status.id = new.status_id
      and status.organization_id = new.organization_id
  ) then
    raise exception 'O status do orçamento pertence a outra empresa.'
      using errcode = '42501';
  end if;

  if new.service_id is not null
     and not exists (
       select 1 from public.services service
       where service.id = new.service_id
         and service.organization_id = new.organization_id
     ) then
    raise exception 'O serviço do orçamento pertence a outra empresa.'
      using errcode = '42501';
  end if;

  if new.product_id is not null
     and not exists (
       select 1 from public.products product
       where product.id = new.product_id
         and product.organization_id = new.organization_id
     ) then
    raise exception 'O produto do orçamento pertence a outra empresa.'
      using errcode = '42501';
  end if;

  if new.brand_id is not null
     and not exists (
       select 1 from public.brands brand
       where brand.id = new.brand_id
         and brand.organization_id = new.organization_id
     ) then
    raise exception 'A marca do orçamento pertence a outra empresa.'
      using errcode = '42501';
  end if;

  if new.assigned_to is not null
     and not exists (
       select 1
       from public.organization_members member
       where member.organization_id = new.organization_id
         and member.user_id = new.assigned_to
         and member.status = 'active'
     ) then
    raise exception 'O responsável do orçamento pertence a outra empresa.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_quote_request_tenant() from public;

drop trigger if exists quote_requests_validate_tenant
  on public.quote_requests;
create trigger quote_requests_validate_tenant
before insert or update of organization_id, customer_id, status_id, service_id,
  product_id, brand_id, assigned_to
on public.quote_requests
for each row
execute function private.validate_quote_request_tenant();

create or replace function private.inherit_quote_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select quote.organization_id
    into v_organization_id
  from public.quote_requests quote
  where quote.id = new.quote_request_id;

  if v_organization_id is null then
    raise exception 'Orçamento não encontrado.'
      using errcode = '23503';
  end if;

  new.organization_id := v_organization_id;
  return new;
end;
$$;

revoke all on function private.inherit_quote_organization() from public;

drop trigger if exists quote_request_items_inherit_organization
  on public.quote_request_items;
create trigger quote_request_items_inherit_organization
before insert or update of quote_request_id
on public.quote_request_items
for each row
execute function private.inherit_quote_organization();

drop trigger if exists quote_status_history_inherit_organization
  on public.quote_status_history;
create trigger quote_status_history_inherit_organization
before insert or update of quote_request_id
on public.quote_status_history
for each row
execute function private.inherit_quote_organization();

create or replace function private.record_quote_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status_id is distinct from old.status_id then
    insert into public.quote_status_history (
      quote_request_id,
      organization_id,
      from_status_id,
      to_status_id,
      changed_by
    )
    values (
      new.id,
      new.organization_id,
      old.status_id,
      new.status_id,
      (select auth.uid())
    );
  end if;
  return new;
end;
$$;

revoke all on function private.record_quote_status_change() from public;

-- Remove policies legadas de orçamento e recria tenant-scoped.
drop policy if exists quote_requests_delete on public.quote_requests;
drop policy if exists quote_requests_create on public.quote_requests;
drop policy if exists "Authorized users can view quotes" on public.quote_requests;
drop policy if exists quote_requests_view on public.quote_requests;
drop policy if exists "Authorized users can update quotes" on public.quote_requests;
drop policy if exists quote_requests_update on public.quote_requests;

drop policy if exists quote_requests_select_tenant on public.quote_requests;
drop policy if exists quote_requests_insert_tenant on public.quote_requests;
drop policy if exists quote_requests_update_tenant on public.quote_requests;

create policy quote_requests_select_tenant
on public.quote_requests
for select to authenticated
using (
  private.is_organization_module_enabled(organization_id, 'quotes')
  and private.can_access_shared_organization_resource(
    organization_id, 'quotes', 'read'
  )
  and private.has_effective_organization_permission(
    organization_id, 'quotes.view'
  )
);

create policy quote_requests_insert_tenant
on public.quote_requests
for insert to authenticated
with check (
  private.is_organization_module_enabled(organization_id, 'quotes')
  and private.can_access_shared_organization_resource(
    organization_id, 'quotes', 'manage'
  )
  and private.has_effective_organization_permission(
    organization_id, 'quotes.create'
  )
);

create policy quote_requests_update_tenant
on public.quote_requests
for update to authenticated
using (
  private.is_organization_module_enabled(organization_id, 'quotes')
  and private.can_access_shared_organization_resource(
    organization_id, 'quotes', 'manage'
  )
  and (
    private.has_effective_organization_permission(
      organization_id, 'quotes.update'
    )
    or private.has_effective_organization_permission(
      organization_id, 'quotes.edit'
    )
    or private.has_effective_organization_permission(
      organization_id, 'quotes.status.change'
    )
  )
)
with check (
  private.is_organization_module_enabled(organization_id, 'quotes')
  and private.can_access_shared_organization_resource(
    organization_id, 'quotes', 'manage'
  )
  and (
    private.has_effective_organization_permission(
      organization_id, 'quotes.update'
    )
    or private.has_effective_organization_permission(
      organization_id, 'quotes.edit'
    )
    or private.has_effective_organization_permission(
      organization_id, 'quotes.status.change'
    )
  )
);

-- Não há policy DELETE: orçamentos são registros de negócio não destrutivos.

drop policy if exists "Authorized users can view quote items"
  on public.quote_request_items;
drop policy if exists quote_request_items_select_tenant
  on public.quote_request_items;
create policy quote_request_items_select_tenant
on public.quote_request_items
for select to authenticated
using (
  private.is_organization_module_enabled(organization_id, 'quotes')
  and private.can_access_shared_organization_resource(
    organization_id, 'quotes', 'read'
  )
  and private.has_effective_organization_permission(
    organization_id, 'quotes.view'
  )
);

drop policy if exists quote_status_history_create
  on public.quote_status_history;
drop policy if exists "Authorized users can view quote history"
  on public.quote_status_history;
drop policy if exists quote_status_history_view
  on public.quote_status_history;
drop policy if exists quote_status_history_select_tenant
  on public.quote_status_history;
drop policy if exists quote_status_history_insert_tenant
  on public.quote_status_history;

create policy quote_status_history_select_tenant
on public.quote_status_history
for select to authenticated
using (
  private.is_organization_module_enabled(organization_id, 'quotes')
  and private.can_access_shared_organization_resource(
    organization_id, 'quotes', 'read'
  )
  and private.has_effective_organization_permission(
    organization_id, 'quotes.view'
  )
);

create policy quote_status_history_insert_tenant
on public.quote_status_history
for insert to authenticated
with check (
  private.is_organization_module_enabled(organization_id, 'quotes')
  and private.can_access_shared_organization_resource(
    organization_id, 'quotes', 'manage'
  )
  and (
    private.has_effective_organization_permission(
      organization_id, 'quotes.update'
    )
    or private.has_effective_organization_permission(
      organization_id, 'quotes.edit'
    )
    or private.has_effective_organization_permission(
      organization_id, 'quotes.status.change'
    )
  )
);

drop policy if exists request_statuses_view
  on public.request_statuses;
drop policy if exists request_statuses_select_tenant
  on public.request_statuses;
create policy request_statuses_select_tenant
on public.request_statuses
for select to authenticated
using (
  private.is_organization_module_enabled(organization_id, 'quotes')
  and private.can_access_shared_organization_resource(
    organization_id, 'quotes', 'read'
  )
  and private.has_effective_organization_permission(
    organization_id, 'quotes.view'
  )
);

-- Filhos da OS: elimina policies legadas sem escopo de empresa.
drop policy if exists "Authorized users can manage order items"
  on public.service_order_items;
drop policy if exists "Authorized users can view order items"
  on public.service_order_items;
drop policy if exists service_order_items_select_tenant
  on public.service_order_items;
drop policy if exists service_order_items_insert_tenant
  on public.service_order_items;
drop policy if exists service_order_items_update_tenant
  on public.service_order_items;
drop policy if exists service_order_items_delete_tenant
  on public.service_order_items;

create policy service_order_items_select_tenant
on public.service_order_items
for select to authenticated
using (private.can_view_service_order(service_order_id));

create policy service_order_items_insert_tenant
on public.service_order_items
for insert to authenticated
with check (
  private.can_access_service_order_child(
    service_order_id, 'orders.edit', 'manage'
  )
  or private.can_access_service_order_child(
    service_order_id, 'orders.update', 'manage'
  )
);

create policy service_order_items_update_tenant
on public.service_order_items
for update to authenticated
using (
  private.can_access_service_order_child(
    service_order_id, 'orders.edit', 'manage'
  )
  or private.can_access_service_order_child(
    service_order_id, 'orders.update', 'manage'
  )
)
with check (
  private.can_access_service_order_child(
    service_order_id, 'orders.edit', 'manage'
  )
  or private.can_access_service_order_child(
    service_order_id, 'orders.update', 'manage'
  )
);

create policy service_order_items_delete_tenant
on public.service_order_items
for delete to authenticated
using (
  private.can_access_service_order_child(
    service_order_id, 'orders.edit', 'manage'
  )
  or private.can_access_service_order_child(
    service_order_id, 'orders.update', 'manage'
  )
);

drop policy if exists "Authorized users can create order notes"
  on public.service_order_notes;
drop policy if exists "Authorized users can view order notes"
  on public.service_order_notes;
drop policy if exists "Authorized users can update order notes"
  on public.service_order_notes;
drop policy if exists service_order_notes_select_tenant
  on public.service_order_notes;
drop policy if exists service_order_notes_insert_tenant
  on public.service_order_notes;
drop policy if exists service_order_notes_update_tenant
  on public.service_order_notes;

create policy service_order_notes_select_tenant
on public.service_order_notes
for select to authenticated
using (private.can_view_service_order(service_order_id));

create policy service_order_notes_insert_tenant
on public.service_order_notes
for insert to authenticated
with check (
  private.can_access_service_order_child(
    service_order_id, 'orders.edit', 'manage'
  )
  or private.can_access_service_order_child(
    service_order_id, 'orders.update', 'manage'
  )
  or private.can_access_service_order_child(
    service_order_id, 'orders.history.create', 'manage'
  )
);

create policy service_order_notes_update_tenant
on public.service_order_notes
for update to authenticated
using (
  private.can_access_service_order_child(
    service_order_id, 'orders.edit', 'manage'
  )
  or private.can_access_service_order_child(
    service_order_id, 'orders.update', 'manage'
  )
)
with check (
  private.can_access_service_order_child(
    service_order_id, 'orders.edit', 'manage'
  )
  or private.can_access_service_order_child(
    service_order_id, 'orders.update', 'manage'
  )
);

commit;
