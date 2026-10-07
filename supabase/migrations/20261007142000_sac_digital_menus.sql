begin;
create table if not exists public.sac_digital_menu_settings (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 enabled boolean not null default false,text text not null default '',choices jsonb not null default '[]',
 source text not null default 'static' check(source in ('static','service_order_status')),
 updated_at timestamptz not null default now(),check(length(text)<=4000),check(jsonb_typeof(choices)='array' and jsonb_array_length(choices)<=10)
);
alter table public.sac_digital_menu_settings enable row level security;
revoke all on public.sac_digital_menu_settings from public,anon,authenticated;
grant all on public.sac_digital_menu_settings to service_role;
create or replace function public.get_sac_digital_menu_settings(p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb;begin
 if not public.has_sac_digital_permission(p_organization_id,'sac_digital.settings.manage') then raise exception 'permission_denied' using errcode='42501';end if;
 select jsonb_build_object('enabled',enabled,'text',text,'choices',choices,'source',source) into v from public.sac_digital_menu_settings where organization_id=p_organization_id;
 return coalesce(v,'{"enabled":false,"text":"","choices":[],"source":"static"}'::jsonb);end $$;
create or replace function public.configure_sac_digital_menu(p_organization_id uuid,p_enabled boolean,p_text text,p_choices jsonb,p_source text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.has_sac_digital_permission(p_organization_id,'sac_digital.settings.manage') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_enabled is null or p_source not in ('static','service_order_status') or p_text is null or length(p_text)>4000 or p_choices is null or jsonb_typeof(p_choices)<>'array' or jsonb_array_length(p_choices)>10 then raise exception 'invalid_menu';end if;
 if exists(select 1 from jsonb_array_elements(p_choices) c where coalesce(c->>'tag','')!~'^[a-zA-Z0-9_-]{1,40}$' or coalesce(c->>'text','')='' or length(c->>'text')>100) or (select count(*) from jsonb_array_elements(p_choices))<>(select count(distinct c->>'tag') from jsonb_array_elements(p_choices)c) then raise exception 'invalid_menu_choices';end if;
 insert into public.sac_digital_menu_settings(organization_id,enabled,text,choices,source) values(p_organization_id,p_enabled,p_text,p_choices,p_source) on conflict(organization_id)do update set enabled=excluded.enabled,text=excluded.text,choices=excluded.choices,source=excluded.source,updated_at=now();
 return public.get_sac_digital_menu_settings(p_organization_id);end $$;
revoke all on function public.get_sac_digital_menu_settings(uuid),public.configure_sac_digital_menu(uuid,boolean,text,jsonb,text) from public,anon;
grant execute on function public.get_sac_digital_menu_settings(uuid),public.configure_sac_digital_menu(uuid,boolean,text,jsonb,text) to authenticated;
commit;
