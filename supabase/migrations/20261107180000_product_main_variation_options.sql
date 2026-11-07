-- Permite cadastrar apenas a opção existente (ex.: Cor: Vermelho) sem criar um
-- produto fictício e acrescentar outras variações mais tarde.
begin;

create table if not exists public.product_variation_configs (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_product_id uuid not null references public.products(id) on delete cascade,
  options jsonb not null default '[]'::jsonb
    check (jsonb_typeof(options) = 'array'),
  updated_at timestamptz not null default now(),
  primary key (organization_id, parent_product_id)
);
alter table public.product_variation_configs enable row level security;
revoke all on public.product_variation_configs from public, anon, authenticated;

create or replace function public.list_product_variation_options_v1(
  p_organization_id uuid,
  p_product_id uuid
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
declare v_options jsonb;
begin
  if (select auth.uid()) is null
    or not (
      private.has_tenant_module_permission(p_organization_id,'products','products.view')
      or private.has_tenant_module_permission(p_organization_id,'products','products.details.view')
      or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.details.view')
    )
    or not exists (
      select 1 from public.products
      where organization_id = p_organization_id and id = p_product_id
    )
  then
    raise exception 'Sem permissão para consultar atributos de variações.' using errcode = '42501';
  end if;

  select options into v_options
  from public.product_variation_configs
  where organization_id = p_organization_id and parent_product_id = p_product_id;
  return coalesce(v_options, '[]'::jsonb);
end;
$function$;
revoke all on function public.list_product_variation_options_v1(uuid,uuid) from public,anon;
grant execute on function public.list_product_variation_options_v1(uuid,uuid) to authenticated;

create or replace function public.replace_product_variation_options_v1(
  p_organization_id uuid,
  p_parent_product_id uuid,
  p_options jsonb
) returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  v_item jsonb;
  v_name text;
  v_raw text;
  v_values text[];
  v_value text;
  v_names text[] := '{}';
  v_combinations integer := 1;
  v_first jsonb := '{}'::jsonb;
  v_previous jsonb := '[]'::jsonb;
  v_previous_first jsonb := '{}'::jsonb;
begin
  if (select auth.uid()) is null
    or not (
      private.has_tenant_module_permission(p_organization_id,'products','products.update')
      or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.update')
    )
  then
    raise exception 'Sem permissão para alterar os atributos de variações.' using errcode = '42501';
  end if;

  perform 1 from public.products
  where organization_id = p_organization_id and id = p_parent_product_id for update;
  if not found then
    raise exception 'Produto principal não encontrado.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.product_variation_links
    where organization_id = p_organization_id and variation_product_id = p_parent_product_id
  ) then
    raise exception 'Atributos devem ser configurados no produto principal.' using errcode = '22023';
  end if;

  if p_options is null or jsonb_typeof(p_options) <> 'array'
     or jsonb_array_length(p_options) > 5 then
    raise exception 'Informe até cinco atributos de variação.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||p_parent_product_id::text,0));
  for v_item in select value from jsonb_array_elements(p_options) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Atributo inválido.' using errcode = '22023';
    end if;
    v_name := btrim(coalesce(v_item->>'name',''));
    v_raw := coalesce(v_item->>'values','');
    if length(v_name) not between 1 and 40
       or lower(v_name) = any(v_names)
       or length(v_raw) > 4096 then
      raise exception 'Nome ou valores de atributo inválidos ou repetidos.' using errcode = '22023';
    end if;
    v_names := array_append(v_names,lower(v_name));
    v_values := array(
      select distinct btrim(piece)
      from regexp_split_to_table(v_raw, E'[,;\n]') as piece
      where btrim(piece) <> ''
    );
    if cardinality(v_values) < 1 or cardinality(v_values) > 200 then
      raise exception 'Informe pelo menos um valor para cada atributo.' using errcode = '22023';
    end if;
    foreach v_value in array v_values loop
      if length(v_value) > 100 then
        raise exception 'Valor de atributo excede 100 caracteres.' using errcode = '22023';
      end if;
    end loop;
    -- A primeira opção é representada pelo estoque do produto principal.
    -- Usar o primeiro valor digitado, não a ordenação do array de validação.
    v_first := v_first || jsonb_build_object(
      v_name, btrim((regexp_split_to_array(v_raw, E'[,;\n]'))[1])
    );
    v_combinations := v_combinations * cardinality(v_values);
    if v_combinations > 200 then
      raise exception 'Limite de 200 combinações excedido.' using errcode = '22023';
    end if;
  end loop;

  select options into v_previous
  from public.product_variation_configs
  where organization_id = p_organization_id and parent_product_id = p_parent_product_id;
  v_previous := coalesce(v_previous, '[]'::jsonb);

  -- A cor atribuída ao principal não pode mudar silenciosamente quando
  -- outros SKUs já foram criados. Isso evitaria reclassificar o estoque.
  if exists (
    select 1 from public.product_variation_links
    where organization_id = p_organization_id and parent_product_id = p_parent_product_id
  ) then
    if jsonb_array_length(p_options) = 0 then
      raise exception 'Não remova os atributos enquanto houver variações vinculadas.' using errcode = '22023';
    end if;
    if jsonb_array_length(v_previous) > 0 then
      for v_item in select value from jsonb_array_elements(v_previous) loop
        v_name := btrim(coalesce(v_item->>'name',''));
        v_raw := coalesce(v_item->>'values','');
        v_previous_first := v_previous_first || jsonb_build_object(
          v_name, btrim((regexp_split_to_array(v_raw, E'[,;\n]'))[1])
        );
      end loop;
      if v_first <> v_previous_first then
        raise exception 'Mantenha os primeiros valores dos atributos do produto principal.' using errcode = '22023';
      end if;
    end if;
  end if;

  insert into public.product_variation_configs (organization_id,parent_product_id,options)
  values (p_organization_id,p_parent_product_id,p_options)
  on conflict (organization_id,parent_product_id)
  do update set options = excluded.options, updated_at = now();
end;
$function$;
revoke all on function public.replace_product_variation_options_v1(uuid,uuid,jsonb) from public,anon;
grant execute on function public.replace_product_variation_options_v1(uuid,uuid,jsonb) to authenticated;

commit;
