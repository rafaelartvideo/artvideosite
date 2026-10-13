-- Catálogo Inteligente Union World: administração central sem importar itens.
-- Acesso separado em visualização e gerenciamento, exclusivo à operadora.

insert into public.permissions (key, label, description, module_name, sort_order)
values
 ('platform.catalog.view','Visualizar Catálogo Inteligente','Permite consultar segmentos, tipos de equipamento e marcas centrais da Union.','Ferramentas — Catálogo Inteligente',5050),
 ('platform.catalog.manage','Gerenciar Catálogo Inteligente','Permite cadastrar, editar, ativar e relacionar segmentos, equipamentos e marcas oficiais.','Ferramentas — Catálogo Inteligente',5051)
on conflict(key) do update set
 label=excluded.label, description=excluded.description, module_name=excluded.module_name, sort_order=excluded.sort_order;

insert into public.role_permissions (role_id,permission_id)
select r.id,p.id
from public.roles r
join public.organizations o on o.id=r.organization_id
join public.permissions p on p.key in ('platform.catalog.view','platform.catalog.manage')
where o.status='active'
  and coalesce(o.settings->>'is_platform_operator','false')='true'
  and exists (
    select 1 from public.role_permissions rp
    join public.permissions existing_permission on existing_permission.id=rp.permission_id
    where rp.role_id=r.id and existing_permission.key='organizations.view'
  )
on conflict(role_id,permission_id) do nothing;

create or replace function public.load_union_catalog_admin_v1()
returns jsonb
language plpgsql stable security definer
set search_path=''
as $$
begin
  if auth.uid() is null
     or not private.has_platform_permission('platform.catalog.view')
  then
    raise exception 'Sem permissão para consultar o Catálogo Inteligente da Union.' using errcode='42501';
  end if;

  return jsonb_build_object(
    'segments', coalesce((
      select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code,'name',s.name,
        'description',s.description,'icon_name',s.icon_name,'sort_order',s.sort_order,
        'is_active',s.is_active) order by s.sort_order,s.name)
      from public.business_segments s
    ),'[]'::jsonb),
    'equipmentTypes', coalesce((
      select jsonb_agg(jsonb_build_object('id',t.id,'code',t.code,'name',t.name,
        'sort_order',t.sort_order,'is_active',t.is_active) order by t.sort_order,t.name)
      from public.catalog_equipment_types t
    ),'[]'::jsonb),
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,
        'is_active',b.is_active) order by b.name)
      from public.catalog_brands b
    ),'[]'::jsonb),
    'segmentEquipment', coalesce((
      select jsonb_agg(jsonb_build_object('segment_id',x.segment_id,'equipment_type_id',x.equipment_type_id))
      from public.segment_equipment_types x
    ),'[]'::jsonb),
    'equipmentBrands', coalesce((
      select jsonb_agg(jsonb_build_object('equipment_type_id',x.equipment_type_id,'brand_id',x.brand_id))
      from public.catalog_equipment_brands x
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.save_union_catalog_item_v1(
  p_kind text,
  p_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql security definer
set search_path=''
as $$
declare
 v_id uuid;
 v_name text;
 v_code text;
 v_description text;
 v_icon text;
 v_sort integer;
 v_active boolean;
begin
 if auth.uid() is null
    or not private.has_platform_permission('platform.catalog.manage')
 then
   raise exception 'Sem permissão para gerenciar o Catálogo Inteligente.' using errcode='42501';
 end if;
 if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
   raise exception 'Dados inválidos.' using errcode='22023';
 end if;

 v_name:=btrim(coalesce(p_payload->>'name',''));
 v_code:=lower(btrim(coalesce(p_payload->>'code','')));
 v_description:=btrim(coalesce(p_payload->>'description',''));
 v_icon:=btrim(coalesce(p_payload->>'icon_name','briefcase-business'));
 v_sort:=coalesce((p_payload->>'sort_order')::integer,0);
 v_active:=coalesce((p_payload->>'is_active')::boolean,true);

 if length(v_name) < 2 or length(v_name) > 120 then
   raise exception 'Informe um nome com 2 a 120 caracteres.' using errcode='22023';
 end if;
 if v_sort < 0 or v_sort > 1000000 then
   raise exception 'A ordem deve estar entre 0 e 1.000.000.' using errcode='22023';
 end if;

 if p_kind = 'segment' then
   if length(v_description) > 350 or length(v_icon) > 60 or v_icon !~ '^[a-z0-9-]+$' then
     raise exception 'Descrição ou ícone inválidos.' using errcode='22023';
   end if;
   if p_id is null then
     if v_code !~ '^[a-z0-9-]{2,60}$' then
       raise exception 'Código de segmento inválido. Use letras minúsculas, números ou hífens.' using errcode='22023';
     end if;
     insert into public.business_segments(code,name,description,icon_name,sort_order,is_active)
       values(v_code,v_name,v_description,v_icon,v_sort,v_active)
       returning id into v_id;
   else
     if not v_active and exists (
       select 1 from public.organization_segments os where os.segment_id=p_id
     ) then
       raise exception 'Não é possível desativar um segmento selecionado por empresas.' using errcode='23503';
     end if;
     update public.business_segments
       set name=v_name,description=v_description,icon_name=v_icon,
           sort_order=v_sort,is_active=v_active,updated_at=now()
       where id=p_id returning id into v_id;
   end if;
 elsif p_kind = 'equipment' then
   if p_id is null then
     if v_code !~ '^[a-z0-9-]{2,60}$' then
       raise exception 'Código de equipamento inválido. Use letras minúsculas, números ou hífens.' using errcode='22023';
     end if;
     insert into public.catalog_equipment_types(code,name,sort_order,is_active)
       values(v_code,v_name,v_sort,v_active)
       returning id into v_id;
   else
     update public.catalog_equipment_types
       set name=v_name,sort_order=v_sort,is_active=v_active,updated_at=now()
       where id=p_id returning id into v_id;
   end if;
 elsif p_kind = 'brand' then
   if p_id is null then
     insert into public.catalog_brands(name,normalized_name,is_active)
       values(v_name,lower(public.normalize_visual_text(v_name)),v_active)
       returning id into v_id;
   else
     update public.catalog_brands
       set name=v_name,normalized_name=lower(public.normalize_visual_text(v_name)),
           is_active=v_active,updated_at=now()
       where id=p_id returning id into v_id;
   end if;
 else
   raise exception 'Tipo de cadastro inválido.' using errcode='22023';
 end if;

 if v_id is null then
   raise exception 'Cadastro não encontrado.' using errcode='P0002';
 end if;
 return v_id;
exception
 when unique_violation then
   raise exception 'Já existe um cadastro com este código ou nome.' using errcode='23505';
end;
$$;

create or replace function public.set_union_catalog_link_v1(
 p_kind text,
 p_left_id uuid,
 p_right_id uuid,
 p_enabled boolean
)
returns void
language plpgsql security definer
set search_path=''
as $$
begin
 if auth.uid() is null
    or not private.has_platform_permission('platform.catalog.manage')
 then
   raise exception 'Sem permissão para alterar vínculos do Catálogo Inteligente.' using errcode='42501';
 end if;
 if p_left_id is null or p_right_id is null or p_enabled is null then
   raise exception 'Associação inválida.' using errcode='22023';
 end if;

 if p_kind='segment_equipment' then
   if p_enabled then
     if not exists (select 1 from public.business_segments where id=p_left_id)
        or not exists(select 1 from public.catalog_equipment_types where id=p_right_id) then
       raise exception 'Segmento ou equipamento não encontrado.' using errcode='P0002';
     end if;
     insert into public.segment_equipment_types(segment_id,equipment_type_id)
       values(p_left_id,p_right_id) on conflict do nothing;
   else
     delete from public.segment_equipment_types
       where segment_id=p_left_id and equipment_type_id=p_right_id;
   end if;
 elsif p_kind='equipment_brand' then
   if p_enabled then
     if not exists(select 1 from public.catalog_equipment_types where id=p_left_id)
        or not exists(select 1 from public.catalog_brands where id=p_right_id) then
       raise exception 'Equipamento ou marca não encontrado.' using errcode='P0002';
     end if;
     insert into public.catalog_equipment_brands(equipment_type_id,brand_id)
       values(p_left_id,p_right_id) on conflict do nothing;
   else
     if exists (select 1 from public.catalog_models where equipment_type_id=p_left_id and brand_id=p_right_id) then
       raise exception 'O vínculo possui modelos cadastrados e não pode ser removido.' using errcode='23503';
     end if;
     delete from public.catalog_equipment_brands
       where equipment_type_id=p_left_id and brand_id=p_right_id;
   end if;
 else
   raise exception 'Tipo de vínculo inválido.' using errcode='22023';
 end if;
end;
$$;

revoke all on function public.load_union_catalog_admin_v1() from public,anon;
revoke all on function public.save_union_catalog_item_v1(text,uuid,jsonb) from public,anon;
revoke all on function public.set_union_catalog_link_v1(text,uuid,uuid,boolean) from public,anon;
grant execute on function public.load_union_catalog_admin_v1() to authenticated;
grant execute on function public.save_union_catalog_item_v1(text,uuid,jsonb) to authenticated;
grant execute on function public.set_union_catalog_link_v1(text,uuid,uuid,boolean) to authenticated;

comment on function public.load_union_catalog_admin_v1() is
  'Retorna o catálogo oficial e seus vínculos; disponível somente a perfis autorizados da Union.';
comment on function public.save_union_catalog_item_v1(text,uuid,jsonb) is
  'Cria ou edita segmento, equipamento ou marca sem sincronizar dados operacionais das empresas.';
comment on function public.set_union_catalog_link_v1(text,uuid,uuid,boolean) is
  'Vincula ou desvincula equipamento/segmento e equipamento/marca no catálogo central.';
