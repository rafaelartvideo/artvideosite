-- 40 itens fictícios de homologação. Escopo estrito: empresa Teste.
-- Imagens ilustrativas por SKU em public/homolog-sales/HML26-XX.svg.
begin;
do $seed$
declare
 v_org constant uuid:='5bcd7ec7-38f0-4dda-a84c-10429bd46b23';
 v_cat record;
 v_item record;
 v_id uuid;
 v_category_id uuid;
 v_brand_id uuid;
 v_parent uuid;
 v_a uuid;
 v_b uuid;
 v_label text;
 v_type text;
 v_model text;
 v_brand text;
 v_variation_name text;
 v_attribute text;
 v_options jsonb;
begin
 if (select name from public.organizations where id=v_org) is distinct from 'Teste' then
   raise exception 'Homologação só é permitida na empresa Teste.' using errcode='42501';
 end if;
 if exists(select 1 from public.products p where p.organization_id=v_org
   and p.sku like 'HML26-%' and p.slug not like 'homolog-vendas-2026-%') then
   raise exception 'Há SKU de homologação ocupado por outro cadastro.' using errcode='23505'; end if;
 for v_cat in select * from (values
(1,'Controles remotos','homolog-vendas-controles-remotos','DemoTec','homolog-vendas-demotec'),
(2,'Fontes e carregadores','homolog-vendas-fontes-carregadores','Voltx Demo','homolog-vendas-voltx-demo'),
(3,'Cabos e adaptadores','homolog-vendas-cabos-adaptadores','CaboLab','homolog-vendas-cabolab'),
(4,'Placas e componentes','homolog-vendas-placas-componentes','PlacaTest','homolog-vendas-placatest'),
(5,'Áudio e acessórios','homolog-vendas-audio-acessorios','AudioLab','homolog-vendas-audiolab'),
(6,'LED e iluminação','homolog-vendas-led-iluminacao','Lumina Demo','homolog-vendas-lumina-demo'),
(7,'Conectores e periféricos','homolog-vendas-conectores-perifericos','ConectorLab','homolog-vendas-conectorlab'),
(8,'Ferramentas e consumíveis','homolog-vendas-ferramentas-consumiveis','Oficina Demo','homolog-vendas-oficina-demo')
 ) as x(n,name,slug,brand_name,brand_slug) loop
   select id into v_category_id from public.product_categories
   where organization_id=v_org and slug=v_cat.slug;
   if v_category_id is null then
     insert into public.product_categories(organization_id,name,slug,description,is_active,sort_order)
     values(v_org,v_cat.name,v_cat.slug,'Categoria exclusiva para homologação do Union Vendas',true,v_cat.n*10)
     returning id into v_category_id;
   end if;
   select id into v_brand_id from public.brands
   where organization_id=v_org and slug=v_cat.brand_slug;
   if v_brand_id is null then
     insert into public.brands(organization_id,name,slug,description,is_active,sort_order)
     values(v_org,v_cat.brand_name,v_cat.brand_slug,'Marca ilustrativa para homologação',true,v_cat.n*10)
     returning id into v_brand_id;
   end if;
 end loop;
 for v_item in select * from (values
(1,1,'HML26-01','HML · Controle remoto Slim preto (Teste)',39.9,14,'new'),
(2,1,'HML26-02','HML · Controle remoto Slim branco (Teste)',42.9,16,'new'),
(3,1,'HML26-03','HML · Controle remoto Slim azul (Teste)',44.9,18,'new'),
(4,1,'HML26-04','HML · Controle remoto Slim vermelho (Teste)',46.9,20,'new'),
(5,1,'HML26-05','HML · Controle remoto Slim cinza (Teste)',49.9,22,'new'),
(6,2,'HML26-06','HML · Fonte bivolt 12V 2A (Teste)',24.9,24,'new'),
(7,2,'HML26-07','HML · Fonte bivolt 12V 3A (Teste)',29.9,26,'used'),
(8,2,'HML26-08','HML · Fonte 19V 3,42A (Teste)',64.9,28,'new'),
(9,2,'HML26-09','HML · Fonte 24V 2A (Teste)',69.9,30,'refurbished'),
(10,2,'HML26-10','HML · Carregador USB-C 65W (Teste)',119.9,0,'new'),
(11,3,'HML26-11','HML · Cabo HDMI 1 metro (Teste)',16.9,34,'new'),
(12,3,'HML26-12','HML · Cabo HDMI 2 metros (Teste)',22.9,36,'new'),
(13,3,'HML26-13','HML · Cabo HDMI 3 metros (Teste)',28.9,38,'new'),
(14,3,'HML26-14','HML · Cabo USB-C 1 metro (Teste)',18.9,40,'used'),
(15,3,'HML26-15','HML · Cabo USB-C 2 metros (Teste)',24.9,42,'new'),
(16,4,'HML26-16','HML · Placa de fonte TV 32 polegadas (Teste)',135,44,'new'),
(17,4,'HML26-17','HML · Placa de fonte TV 40 polegadas (Teste)',189,46,'new'),
(18,4,'HML26-18','HML · Placa de fonte TV 43 polegadas (Teste)',230,48,'refurbished'),
(19,4,'HML26-19','HML · Placa de fonte TV 50 polegadas (Teste)',299,50,'new'),
(20,4,'HML26-20','HML · Placa de fonte TV 55 polegadas (Teste)',379,0,'new'),
(21,5,'HML26-21','HML · Alto-falante 4Ω 5W (Teste)',24,54,'used'),
(22,5,'HML26-22','HML · Alto-falante 4Ω 10W (Teste)',39,56,'new'),
(23,5,'HML26-23','HML · Alto-falante 4Ω 15W (Teste)',54,58,'new'),
(24,5,'HML26-24','HML · Módulo Bluetooth para áudio (Teste)',89,60,'new'),
(25,5,'HML26-25','HML · Cabo de áudio P2 (Teste)',13.9,62,'new'),
(26,6,'HML26-26','HML · Kit barras de LED TV 32 (Teste)',38,64,'new'),
(27,6,'HML26-27','HML · Kit barras de LED TV 40 (Teste)',47,66,'refurbished'),
(28,6,'HML26-28','HML · Kit barras de LED TV 43 (Teste)',59,68,'used'),
(29,6,'HML26-29','HML · Kit barras de LED TV 50 (Teste)',79,70,'new'),
(30,6,'HML26-30','HML · Kit barras de LED TV 55 (Teste)',95,0,'new'),
(31,7,'HML26-31','HML · Conector DC 5,5 mm (Teste)',8.9,74,'new'),
(32,7,'HML26-32','HML · Conector USB-A (Teste)',12.9,76,'new'),
(33,7,'HML26-33','HML · Conector USB-C (Teste)',15.9,78,'new'),
(34,7,'HML26-34','HML · Conector coaxial F (Teste)',9.9,80,'new'),
(35,7,'HML26-35','HML · Conector HDMI (Teste)',19.9,82,'used'),
(36,8,'HML26-36','HML · Pasta térmica 5 g (Teste)',18.5,84,'refurbished'),
(37,8,'HML26-37','HML · Fita Kapton 10 mm (Teste)',11.9,86,'new'),
(38,8,'HML26-38','HML · Fluxo de solda 10 ml (Teste)',16.9,88,'new'),
(39,8,'HML26-39','HML · Álcool isopropílico 100 ml (Teste)',14.9,90,'new'),
(40,8,'HML26-40','HML · Malha dessoldadora 2 mm (Teste)',9.9,0,'new')
 ) as x(n,cat,sku,name,price,qty,condition) loop
   select id into v_category_id from public.product_categories
   where organization_id=v_org and slug='homolog-vendas-'||
     (array['controles-remotos','fontes-carregadores','cabos-adaptadores','placas-componentes','audio-acessorios','led-iluminacao','conectores-perifericos','ferramentas-consumiveis'])[v_item.cat];
   select id into v_brand_id from public.brands where organization_id=v_org
     and slug='homolog-vendas-'||(array['demotec','voltx-demo','cabolab','placatest','audiolab','lumina-demo','conectorlab','oficina-demo'])[v_item.cat];
   select id into v_id from public.products where organization_id=v_org and sku=v_item.sku;
   if v_id is null then
     insert into public.products(
       organization_id,category_id,brand_id,name,slug,sku,price,
       short_description,description,commercial_unit,product_condition,
       show_in_catalog,is_active,is_featured,site_characteristics,model,manufacturer_code
     ) values (
       v_org,v_category_id,v_brand_id,v_item.name,
       'homolog-vendas-2026-'||lpad(v_item.n::text,2,'0'),v_item.sku,
       v_item.price,'Produto fictício exclusivo para testes de Vendas.',
       'Imagem ilustrativa exclusiva de homologação. Item não comercial.',
       'un',v_item.condition,false,true,false,
       jsonb_build_array(
         jsonb_build_object('label','Identificação','value','Produto de teste'),
         jsonb_build_object('label','Linha','value',v_item.cat::text),
         jsonb_build_object('label','Condição de uso','value','Homologação do CRM')
       ),'HML-MODEL-'||lpad(v_item.n::text,2,'0'),'HML-'||lpad(v_item.n::text,3,'0')
     ) returning id into v_id;
   end if;
   if not exists(select 1 from public.inventory_items
     where organization_id=v_org and product_id=v_id) then
     insert into public.inventory_items(
       organization_id,product_id,name,sku,description,unit,quantity,min_quantity,
       sale_price,purchase_price,average_cost,is_active,conversion_factor,
       storage_shelf,storage_level,storage_compartment
     ) values(
       v_org,v_id,v_item.name,v_item.sku,'Estoque fictício para homologação.',
       'un',v_item.qty,4,v_item.price,round(v_item.price*0.43,2),
       round(v_item.price*0.43,2),true,1,
       'HML-'||chr(64+v_item.cat),ceil((v_item.n%5+1)::numeric)::text,
       'C-'||lpad(v_item.n::text,2,'0')
     );
   end if;
   -- Modelos de aparelhos demonstrativos nos itens eletrônicos.
   if v_item.cat in (1,2,4,6) then
     v_type:=case when v_item.cat=2 then 'Fonte e equipamento'
       else 'Televisão' end;
     v_brand:=case when v_item.n%3=0 then 'LG' when v_item.n%3=1 then 'Samsung' else 'TCL' end;
     v_model:=case when v_item.cat=2 then 'DEMO-PWR-'||v_item.n::text
       else 'DEMO-TV-'||(32+v_item.n%24)::text||'-'||lpad(v_item.n::text,2,'0') end;
     insert into public.product_device_compatible_models(
       organization_id,product_id,device_type,brand,model,
       device_type_key,brand_key,model_key
     ) values(v_org,v_id,v_type,v_brand,v_model,
       lower(v_type),lower(v_brand),lower(v_model))
     on conflict(organization_id,product_id,device_type_key,brand_key,model_key) do nothing;
   end if;
   -- Códigos relacionados demonstrativos para buscas por referências cruzadas.
   insert into public.product_related_codes(
     organization_id,product_id,code,relation_type,source,is_verified
   ) values(v_org,v_id,'HML-GROUP-'||lpad(v_item.cat::text,2,'0'),
     'similar','manual',true)
   on conflict(organization_id,product_id,code) do nothing;
 end loop;
 -- Conjuntos reais de variações com SKU individual e atributo.
 for v_cat in select * from (values
   (1,2,5,'Cor'),(11,12,13,'Comprimento'),(21,22,23,'Potência'),(26,27,30,'Tamanho')
 ) as x(parent_first,child_first,child_last,attribute_name) loop
   select id into v_parent from public.products where organization_id=v_org
     and sku='HML26-'||lpad(v_cat.parent_first::text,2,'0');
   if v_parent is null then raise exception 'Produto principal de variação ausente.'; end if;
   v_options:='[]'::jsonb;
   for v_item in select n from generate_series(v_cat.parent_first,v_cat.child_last) n loop
     v_variation_name:=case when v_cat.attribute_name='Cor' then
       (array['Preto','Branco','Azul','Vermelho','Cinza'])[v_item.n]
       when v_cat.attribute_name='Comprimento' then (v_item.n-10)::text||' metro(s)'
       when v_cat.attribute_name='Potência' then (v_item.n-20)::text||'x'
       else (32+(v_item.n-26)*5)::text||' polegadas' end;
     v_options:=v_options||jsonb_build_array(v_variation_name);
     if v_item.n>v_cat.parent_first then
       select id into v_id from public.products where organization_id=v_org
         and sku='HML26-'||lpad(v_item.n::text,2,'0');
       insert into public.product_variation_links(
         organization_id,parent_product_id,variation_product_id,variation_label,variation_attributes
       ) values(v_org,v_parent,v_id,v_variation_name,
         jsonb_build_object(v_cat.attribute_name,v_variation_name))
       on conflict(organization_id,parent_product_id,variation_product_id) do nothing;
     end if;
   end loop;
   insert into public.product_variation_configs(organization_id,parent_product_id,options)
   values(v_org,v_parent,jsonb_build_array(jsonb_build_object(
     'name',v_cat.attribute_name,'values',v_options)))
   on conflict(organization_id,parent_product_id) do nothing;
 end loop;
 -- Relacionamentos de similares e alternativas, sem duplicar pares.
 for v_item in select n from generate_series(1,40) n loop
   select id into v_a from public.products where organization_id=v_org
     and sku='HML26-'||lpad(v_item.n::text,2,'0');
   select id into v_b from public.products where organization_id=v_org
     and sku='HML26-'||lpad((case when v_item.n%5=0 then v_item.n-4 else v_item.n+1 end)::text,2,'0');
   if v_a is distinct from v_b and v_a is not null and v_b is not null then
     insert into public.product_similar_links(organization_id,product_id_a,product_id_b)
     values(v_org,least(v_a,v_b),greatest(v_a,v_b))
     on conflict(organization_id,product_id_a,product_id_b) do nothing;
   end if;
 end loop;
end;$seed$;
commit;