begin;
do $$
declare
  v_org record;
  v_template_id uuid;
  v_section_id uuid;
  v_section record;
  v_field record;
  v_base public.print_templates%rowtype;
begin
  for v_org in
    select distinct organization_id from public.service_types where quote_workflow_enabled=true
  loop
    select id into v_template_id from public.print_templates
      where organization_id=v_org.organization_id and document_type='ORCAMENTO'
        and name='Orçamento técnico' limit 1;
    if v_template_id is null then
      select * into v_base from public.print_templates
        where organization_id=v_org.organization_id and document_type='ENTRADA'
        order by is_active desc,created_at limit 1;
      insert into public.print_templates(
        organization_id,name,description,document_type,is_active,paper_size,orientation,
        margin_top,margin_right,margin_bottom,margin_left,show_logo,show_company_info,
        show_page_number,show_printed_at,header_text,footer_text,settings
      ) values(
        v_org.organization_id,'Orçamento técnico',
        'Proposta com diagnóstico, solução, produtos, serviços, descontos e validade vinculada à OS.',
        'ORCAMENTO',true,'A4',
        coalesce(v_base.orientation,'portrait'),
        greatest(6,coalesce(v_base.margin_top,12)),greatest(6,coalesce(v_base.margin_right,12)),
        greatest(6,coalesce(v_base.margin_bottom,12)),greatest(6,coalesce(v_base.margin_left,12)),
        coalesce(v_base.show_logo,true),coalesce(v_base.show_company_info,true),
        coalesce(v_base.show_page_number,false),coalesce(v_base.show_printed_at,true),
        null,'Proposta válida mediante aprovação do cliente.',
        coalesce(v_base.settings,'{"font_family":"Arial","body_font_size":10,"label_font_size":8,"section_title_font_size":9,"line_height":1.2,"section_spacing":4,"field_spacing":2,"section_style":"lines","show_section_borders":true,"show_field_borders":false}'::jsonb)
      ) returning id into v_template_id;
      for v_section in
        select * from (values
          ('customer','Cliente',0,3,ARRAY['customer.full_name','customer.document','customer.phone']::text[]),
          ('equipment','Equipamento',1,3,ARRAY['equipment.type','equipment.brand','equipment.model','equipment.serial_number']::text[]),
          ('order','Informações da OS',2,2,ARRAY['order.customer_notes','order.created_at']::text[]),
          ('quote','Orçamento',3,2,ARRAY['quote.version','quote.status','quote.diagnosis','quote.proposed_solution','quote.valid_until','quote.products_total','quote.services_total','quote.subtotal','quote.discount_amount','quote.total']::text[]),
          ('quote_items','Produtos e serviços do orçamento',4,1,ARRAY['quote_items.title','quote_items.quantity','quote_items.unit_price','quote_items.total']::text[])
        ) as s(section_key,title,sort_order,columns,fields)
      loop
        insert into public.print_template_sections(
          organization_id,template_id,section_key,title,sort_order,columns,is_enabled
        ) values (
          v_org.organization_id,v_template_id,v_section.section_key,v_section.title,
          v_section.sort_order,v_section.columns,true
        ) returning id into v_section_id;
        for v_field in select field_key, ordinality-1 as pos
          from unnest(v_section.fields) with ordinality as f(field_key,ordinality)
        loop
          insert into public.print_template_fields(template_section_id,field_key,label,sort_order,is_enabled)
          values(
            v_section_id,v_field.field_key,
            case v_field.field_key
              when 'customer.full_name' then 'Nome'
              when 'customer.document' then 'CPF / CNPJ'
              when 'customer.phone' then 'Telefone'
              when 'equipment.type' then 'Equipamento'
              when 'equipment.brand' then 'Marca'
              when 'equipment.model' then 'Modelo'
              when 'equipment.serial_number' then 'Número de série'
              when 'order.customer_notes' then 'Problema relatado'
              when 'order.created_at' then 'Data de entrada'
              when 'quote.version' then 'Versão da proposta'
              when 'quote.status' then 'Situação'
              when 'quote.diagnosis' then 'Diagnóstico'
              when 'quote.proposed_solution' then 'Solução proposta'
              when 'quote.valid_until' then 'Validade da proposta'
              when 'quote.products_total' then 'Total produtos'
              when 'quote.services_total' then 'Total serviços'
              when 'quote.subtotal' then 'Subtotal'
              when 'quote.discount_amount' then 'Desconto'
              when 'quote.total' then 'Total do orçamento'
              when 'quote_items.title' then 'Produto / Serviço'
              when 'quote_items.quantity' then 'Qtd.'
              when 'quote_items.unit_price' then 'Valor unitário'
              when 'quote_items.total' then 'Subtotal'
              else v_field.field_key
            end,
            v_field.pos,true
          );
        end loop;
      end loop;
    end if;
  end loop;
end;
$$;
commit;