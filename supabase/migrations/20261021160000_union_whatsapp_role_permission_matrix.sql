begin;

-- Catálogo central das permissões de atendimento. Sem acesso direto do cliente.
create table if not exists public.union_whatsapp_permission_definitions (
  key text primary key,
  label text not null,
  category text not null check (category in ('Conversas','Administração')),
  manager_default boolean not null,
  operator_default boolean not null,
  sort_order integer not null
);
alter table public.union_whatsapp_permission_definitions enable row level security;
revoke all on public.union_whatsapp_permission_definitions from anon,authenticated;

insert into public.union_whatsapp_permission_definitions
(key,label,category,manager_default,operator_default,sort_order) values
  ('view_all','Visualizar todas as conversas','Conversas',true,false,1),
  ('view_assigned','Visualizar conversas atribuídas','Conversas',true,true,2),
  ('view_queues','Visualizar filas autorizadas','Conversas',true,true,3),
  ('assume','Assumir atendimentos','Conversas',false,true,4),
  ('start','Iniciar novas conversas','Conversas',false,true,5),
  ('send','Enviar mensagens e anexos','Conversas',false,true,6),
  ('transfer','Encaminhar atendimentos','Conversas',true,true,7),
  ('return_queue','Devolver para a fila','Conversas',true,true,8),
  ('finish','Finalizar atendimentos','Conversas',true,true,9),
  ('reopen','Reabrir atendimentos','Conversas',true,false,10),
  ('manage_operators','Gerenciar operadores e perfis','Administração',true,false,11),
  ('manage_queues','Configurar filas e departamentos','Administração',true,false,12),
  ('view_contacts','Visualizar contatos','Administração',true,true,13),
  ('manage_contacts','Gerenciar contatos','Administração',true,true,14),
  ('import_contacts','Importar contatos','Administração',true,false,15),
  ('view_history','Visualizar histórico do atendimento','Administração',true,false,16),
  ('link_orders','Vincular ordens de serviço','Administração',true,false,17)
on conflict (key) do update set
label=excluded.label,category=excluded.category,
manager_default=excluded.manager_default,operator_default=excluded.operator_default,
sort_order=excluded.sort_order;

-- Alterações por empresa/perfil; ausência de override herda padrão do catálogo.
create table if not exists public.union_whatsapp_role_permissions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  staff_role text not null check (staff_role in ('manager','operator')),
  capability text not null references public.union_whatsapp_permission_definitions(key),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,staff_role,capability)
);
create index if not exists union_whatsapp_role_permissions_lookup
on public.union_whatsapp_role_permissions(organization_id,staff_role);
alter table public.union_whatsapp_role_permissions enable row level security;
revoke all on public.union_whatsapp_role_permissions from anon,authenticated;

-- Executada exclusivamente com a identidade auth.uid() autenticada.
-- Respeita empresa, associação ativa, perfil ativo e permissões CRM.
create or replace function private.union_whatsapp_allowed(
  p_organization uuid,p_capability text
) returns boolean language sql stable security definer
set search_path to 'pg_catalog','public','private'
as $allow$
 select
 private.has_effective_organization_permission(p_organization,'whatsapp.inbox.view')
 and (p_capability not in ('assume','start','send')
      or private.has_effective_organization_permission(p_organization,'whatsapp.inbox.send'))
 and exists (
   select 1
   from public.union_whatsapp_operator_bindings b
   join public.organization_members m
     on m.organization_id=b.organization_id and m.user_id=b.user_id and m.status='active'
   join public.profiles prof on prof.id=b.user_id and prof.is_active=true
   join public.union_whatsapp_permission_definitions def on def.key=p_capability
   left join public.union_whatsapp_role_permissions mgr
     on mgr.organization_id=b.organization_id
       and mgr.staff_role='manager' and mgr.capability=def.key
   left join public.union_whatsapp_role_permissions opr
     on opr.organization_id=b.organization_id
       and opr.staff_role='operator' and opr.capability=def.key
   where b.organization_id=p_organization
     and b.user_id=(select auth.uid()) and b.is_active=true
     and (
        (b.staff_role in ('manager','both') and coalesce(mgr.enabled,def.manager_default))
        or
        (b.staff_role in ('operator','both') and coalesce(opr.enabled,def.operator_default))
     )
 );
$allow$;
revoke all on function private.union_whatsapp_allowed(uuid,text) from public,anon;
grant execute on function private.union_whatsapp_allowed(uuid,text) to authenticated;

-- A listagem é regulada pelas opções de visibilidade definidas para cada perfil.
drop policy if exists union_whatsapp_conversations_read on public.union_whatsapp_conversations;
create policy union_whatsapp_conversations_read
on public.union_whatsapp_conversations for select to authenticated
using (
  (
    private.union_whatsapp_allowed(organization_id,'view_all')
    or (
      assigned_to=(select auth.uid())
      and private.union_whatsapp_allowed(organization_id,'view_assigned')
    )
    or (
      status='waiting' and assigned_to is null
      and private.union_whatsapp_allowed(organization_id,'view_queues')
      and (
        department_id is null
        or exists (
          select 1 from public.union_whatsapp_department_members member
          where member.organization_id=union_whatsapp_conversations.organization_id
            and member.department_id=union_whatsapp_conversations.department_id
            and member.user_id=(select auth.uid())
        )
      )
    )
  )
  and private.union_whatsapp_active_account_visible(
    organization_id,channel_id,account_phone
  )
);

drop policy if exists union_whatsapp_operator_bindings_read on public.union_whatsapp_operator_bindings;
create policy union_whatsapp_operator_bindings_read
on public.union_whatsapp_operator_bindings for select to authenticated
using (
  user_id=(select auth.uid())
  or private.union_whatsapp_allowed(organization_id,'manage_operators')
);
drop policy if exists union_whatsapp_department_members_read on public.union_whatsapp_department_members;
create policy union_whatsapp_department_members_read
on public.union_whatsapp_department_members for select to authenticated
using (
  user_id=(select auth.uid())
  or private.union_whatsapp_allowed(organization_id,'manage_queues')
);

commit;
