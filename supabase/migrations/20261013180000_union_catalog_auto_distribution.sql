-- Catálogo oficial da Union: distribuição automática e idempotente por segmento.
-- Não altera registros legados existentes, não exclui itens ao remover segmentos,
-- não cria modelos e mantém IDs referenciados por OS.

create table if not exists public.organization_catalog_sync_issues (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 issue_key text not null,
 details text not null,
 occurred_at timestamptz not null default now(),
 primary key (organization_id,issue_key)
);
alter table public.organization_catalog_sync_issues enable row level security;
revoke all on public.organization_catalog_sync_issues from public,anon,authenticated;

create or replace function private.sync_union_catalog_for_organization(p_organization_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
 v_type record;
 v_brand record;
 v_local_type uuid;
 v_local_brand uuid;
 v_existing_link uuid;
 v_error_key text;
begin
 if not exists (
   select 1 from public.organizations o
   join public.organization_segments os on os.organization_id=o.id
   where o.id=p_organization_id and o.status='active'
     and coalesce(o.settings->>'is_platform_operator','false') <> 'true'
 ) then
   return;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('union-catalog-org:'||p_organization_id::text,0));

 for v_type in
   select distinct t.id,t.name,t.sort_order from public.catalog_equipment_types t
   join public.segment_equipment_types se on se.equipment_type_id=t.id
   join public.organization_segments os on os.segment_id=se.segment_id
     and os.organization_id=p_organization_id
   join public.business_segments s on s.id=os.segment_id
   where t.is_active and t.is_published and s.is_active
   order by t.name,t.id
 loop
   v_error_key:='equipment:'||v_type.id::text;
   v_local_type:=null;
   select l.equipment_type_id into v_local_type
   from public.organization_catalog_equipment_links l
   where l.organization_id=p_organization_id and l.catalog_equipment_type_id=v_type.id;

   if v_local_type is null then
     select t.id into v_local_type from public.equipment_types t
       where t.organization_id=p_organization_id
       and lower(public.normalize_visual_text(t.name))=lower(public.normalize_visual_text(v_type.name))
       limit 1;

     if v_local_type is null then
       insert into public.equipment_types(organization_id,name,slug,is_active,sort_order)
       values(p_organization_id,v_type.name,
          'union-'||replace(v_type.id::text,'-',''),true,v_type.sort_order)
       on conflict do nothing returning id into v_local_type;
       if v_local_type is null then
         select t.id into v_local_type from public.equipment_types t
         where t.organization_id=p_organization_id
         and lower(public.normalize_visual_text(t.name))=lower(public.normalize_visual_text(v_type.name))
         limit 1;
       end if;
     end if;
     if v_local_type is null then
       insert into public.organization_catalog_sync_issues(organization_id,issue_key,details)
       values(p_organization_id,v_error_key,'Conflito de nome/slug no equipamento oficial '||v_type.name)
       on conflict (organization_id,issue_key) do update
         set details=excluded.details,occurred_at=now();
       continue;
     end if;

     insert into public.organization_catalog_equipment_links
       (organization_id,catalog_equipment_type_id,equipment_type_id,created_by)
       values(p_organization_id,v_type.id,v_local_type,auth.uid())
       on conflict do nothing;

     select l.equipment_type_id into v_existing_link
     from public.organization_catalog_equipment_links l
     where l.organization_id=p_organization_id and l.catalog_equipment_type_id=v_type.id;
     if v_existing_link is distinct from v_local_type then
       insert into public.organization_catalog_sync_issues(organization_id,issue_key,details)
       values(p_organization_id,v_error_key,'Equipamento local já vinculado a outro item oficial: '||v_type.name)
       on conflict (organization_id,issue_key) do update
         set details=excluded.details,occurred_at=now();
       continue;
     end if;
   end if;
   delete from public.organization_catalog_sync_issues
   where organization_id=p_organization_id and issue_key=v_error_key;

   for v_brand in
     select b.id,b.name from public.catalog_equipment_brands eb
       join public.catalog_brands b on b.id=eb.brand_id
     where eb.equipment_type_id=v_type.id and b.is_active and b.is_published
     order by b.name,b.id
   loop
     v_error_key:='brand:'||v_type.id::text||':'||v_brand.id::text;
     v_local_brand:=null;
     select l.equipment_brand_id into v_local_brand
       from public.organization_catalog_brand_links l
       where l.organization_id=p_organization_id
         and l.catalog_equipment_type_id=v_type.id and l.catalog_brand_id=v_brand.id;

     if v_local_brand is null then
       select b.id into v_local_brand from public.equipment_brands b
       where b.organization_id=p_organization_id and b.equipment_type_id=v_local_type
         and lower(public.normalize_visual_text(b.name))=lower(public.normalize_visual_text(v_brand.name))
       limit 1;

       if v_local_brand is null then
         insert into public.equipment_brands(
           organization_id,equipment_type_id,name,slug,is_active,sort_order
         ) values(
           p_organization_id,v_local_type,v_brand.name,
           'union-'||replace(v_brand.id::text,'-',''),true,0
         ) on conflict do nothing returning id into v_local_brand;

         if v_local_brand is null then
           select b.id into v_local_brand from public.equipment_brands b
             where b.organization_id=p_organization_id and b.equipment_type_id=v_local_type
               and lower(public.normalize_visual_text(b.name))=lower(public.normalize_visual_text(v_brand.name))
             limit 1;
         end if;
       end if;

       if v_local_brand is null then
         insert into public.organization_catalog_sync_issues(organization_id,issue_key,details)
         values(p_organization_id,v_error_key,'Conflito de nome/slug na marca oficial '||v_brand.name)
         on conflict (organization_id,issue_key) do update
           set details=excluded.details,occurred_at=now();
         continue;
       end if;

       insert into public.organization_catalog_brand_links
         (organization_id,catalog_equipment_type_id,catalog_brand_id,equipment_brand_id,created_by)
         values(p_organization_id,v_type.id,v_brand.id,v_local_brand,auth.uid())
         on conflict do nothing;

       select l.equipment_brand_id into v_existing_link
         from public.organization_catalog_brand_links l
         where l.organization_id=p_organization_id
           and l.catalog_equipment_type_id=v_type.id and l.catalog_brand_id=v_brand.id;
       if v_existing_link is distinct from v_local_brand then
         insert into public.organization_catalog_sync_issues(organization_id,issue_key,details)
         values(p_organization_id,v_error_key,'Marca local já vinculada a outro item oficial: '||v_brand.name)
         on conflict (organization_id,issue_key) do update
           set details=excluded.details,occurred_at=now();
         continue;
       end if;
     end if;
     delete from public.organization_catalog_sync_issues
       where organization_id=p_organization_id and issue_key=v_error_key;
   end loop;
 end loop;
end; $$;

-- Executado após cada associação/publicação relevante; não faz polling.
create or replace function private.propagate_union_catalog_publication()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_org uuid;
begin
 if tg_table_name='segment_equipment_types' then
   if tg_op <> 'INSERT' then return coalesce(new,old); end if;
   for v_org in
     select distinct os.organization_id from public.organization_segments os
     where os.segment_id=new.segment_id
   loop
     perform private.sync_union_catalog_for_organization(v_org);
   end loop;
 elsif tg_table_name='catalog_equipment_brands' then
   if tg_op <> 'INSERT' then return coalesce(new,old); end if;
   for v_org in
     select distinct os.organization_id
       from public.organization_segments os
       join public.segment_equipment_types se on se.segment_id=os.segment_id
       where se.equipment_type_id=new.equipment_type_id
   loop
     perform private.sync_union_catalog_for_organization(v_org);
   end loop;
 elsif tg_table_name='catalog_equipment_types' then
   if new.is_active and new.is_published then
     for v_org in
       select distinct os.organization_id
       from public.organization_segments os
       join public.segment_equipment_types se on se.segment_id=os.segment_id
       where se.equipment_type_id=new.id
     loop
       perform private.sync_union_catalog_for_organization(v_org);
     end loop;
   end if;
 elsif tg_table_name='catalog_brands' then
   if new.is_active and new.is_published then
     for v_org in
       select distinct os.organization_id
       from public.organization_segments os
       join public.segment_equipment_types se on se.segment_id=os.segment_id
       join public.catalog_equipment_brands eb on eb.equipment_type_id=se.equipment_type_id
       where eb.brand_id=new.id
     loop
       perform private.sync_union_catalog_for_organization(v_org);
     end loop;
   end if;
 elsif tg_table_name='business_segments' then
   if new.is_active then
     for v_org in
       select distinct os.organization_id
       from public.organization_segments os where os.segment_id=new.id
     loop
       perform private.sync_union_catalog_for_organization(v_org);
     end loop;
   end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;

drop trigger if exists union_auto_segment_equipment on public.segment_equipment_types;
create trigger union_auto_segment_equipment
 after insert on public.segment_equipment_types
 for each row execute function private.propagate_union_catalog_publication();

drop trigger if exists union_auto_equipment_brand on public.catalog_equipment_brands;
create trigger union_auto_equipment_brand
 after insert on public.catalog_equipment_brands
 for each row execute function private.propagate_union_catalog_publication();

drop trigger if exists union_auto_type_publication on public.catalog_equipment_types;
create trigger union_auto_type_publication
 after insert or update of is_active,is_published on public.catalog_equipment_types
 for each row execute function private.propagate_union_catalog_publication();

drop trigger if exists union_auto_brand_publication on public.catalog_brands;
create trigger union_auto_brand_publication
 after insert or update of is_active,is_published on public.catalog_brands
 for each row execute function private.propagate_union_catalog_publication();

drop trigger if exists union_auto_segment_activation on public.business_segments;
create trigger union_auto_segment_activation
 after update of is_active on public.business_segments
 for each row execute function private.propagate_union_catalog_publication();

-- O proprietário define segmentos uma vez; o sistema faz a distribuição no final da transação.
create or replace function public.save_company_segments_v1(
  p_organization_id uuid,
  p_primary_code text,
  p_additional_codes text[] default '{}'::text[]
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_codes text[];
  v_requested_count integer;
  v_available_count integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid() and m.status = 'active' and m.is_owner = true
  ) then
    raise exception 'Apenas o proprietário pode definir os segmentos.' using errcode = '42501';
  end if;

  select array_agg(distinct code) into v_codes from (
    select unnest(array[p_primary_code] || coalesce(p_additional_codes, '{}'::text[])) as code
  ) requested where code is not null and code <> '';

  v_requested_count := coalesce(array_length(v_codes,1),0);
  if p_primary_code is null or p_primary_code = '' or v_requested_count = 0 or v_requested_count > 7 then
    raise exception 'Selecione um segmento principal válido.' using errcode = '22023';
  end if;
  select count(*) into v_available_count
    from public.business_segments s
    where s.code = any(v_codes) and s.is_active;
  if v_available_count <> v_requested_count then
    raise exception 'Há segmentos inválidos ou desativados.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':segments', 0));
  delete from public.organization_segments where organization_id = p_organization_id;
  insert into public.organization_segments(organization_id, segment_id, is_primary, created_by)
    select p_organization_id, s.id, s.code = p_primary_code, auth.uid()
      from public.business_segments s where s.code = any(v_codes);

  -- Após configurar todos os segmentos, distribuir os itens já publicados, uma vez.
  perform private.sync_union_catalog_for_organization(p_organization_id);
end;
$$;

-- Para diagnóstico administrativo: contas afetadas e eventuais conflitos, sem expor dados às parceiras.
create or replace function public.load_union_catalog_distribution_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.has_platform_permission('platform.catalog.view') then
   raise exception 'Sem permissão para consultar a distribuição do catálogo.' using errcode='42501';
 end if;
 return jsonb_build_object(
   'companies',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',o.id,'name',o.name,
        'equipment_count',(select count(*) from public.organization_catalog_equipment_links x where x.organization_id=o.id),
        'brand_count',(select count(*) from public.organization_catalog_brand_links x where x.organization_id=o.id),
        'issues',(select count(*) from public.organization_catalog_sync_issues i where i.organization_id=o.id)
      ) order by o.name)
      from public.organizations o
      where coalesce(o.settings->>'is_platform_operator','false') <> 'true' and o.status='active'
   ),'[]'::jsonb),
   'pending_issues',coalesce((
      select jsonb_agg(jsonb_build_object('organization_id',i.organization_id,'issue_key',i.issue_key,'details',i.details)
      order by i.organization_id,i.issue_key)
      from public.organization_catalog_sync_issues i
   ),'[]'::jsonb)
 );
end; $$;
revoke all on function public.load_union_catalog_distribution_v1() from public,anon;
grant execute on function public.load_union_catalog_distribution_v1() to authenticated;
