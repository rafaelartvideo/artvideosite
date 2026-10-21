begin;
-- Atualiza somente modelos de orçamento existentes, sem modificar outros documentos.
update public.print_template_sections s
set sort_order=case s.section_key
  when 'customer' then 0
  when 'order' then 1
  when 'equipment' then 2
  when 'quote_items' then 3
  when 'quote' then 4
  when 'signatures' then 5
  else 20+s.sort_order end,
  columns=case s.section_key
    when 'quote' then 2
    when 'quote_items' then 2
    when 'equipment' then 2
    when 'order' then 2
    else greatest(2,least(3,s.columns)) end
from public.print_templates t
where s.template_id=t.id and t.document_type='ORCAMENTO';

-- Substitui tipo/marca/modelo/série por um único item variável, inclusive
-- preservando acessórios e condição quando já selecionados.
delete from public.print_template_fields f
using public.print_template_sections s, public.print_templates t
where f.template_section_id=s.id and s.template_id=t.id and t.document_type='ORCAMENTO'
and (
  (s.section_key='equipment' and f.field_key in ('equipment.type','equipment.brand','equipment.model','equipment.serial_number'))
  or (s.section_key='quote' and f.field_key in ('quote.version','quote.status'))
);

insert into public.print_template_fields(template_section_id,field_key,label,sort_order,is_enabled)
select s.id,'equipment.general','Equipamento',0,true
from public.print_template_sections s
join public.print_templates t on t.id=s.template_id
where t.document_type='ORCAMENTO' and s.section_key='equipment'
and not exists(select 1 from public.print_template_fields f
  where f.template_section_id=s.id and f.field_key='equipment.general');

-- Em orçamento, agrupa a seleção nesta ordem: diagnóstico/solução,
-- validade, valores em 3 colunas e, por fim, desconto/valor final.
update public.print_template_fields f
set sort_order = case f.field_key
  when 'quote.diagnosis' then 0
  when 'quote.proposed_solution' then 1
  when 'quote.valid_until' then 2
  when 'quote.products_total' then 3
  when 'quote.services_total' then 4
  when 'quote.subtotal' then 5
  when 'quote.discount_amount' then 6
  when 'quote.total' then 7
  else f.sort_order end
from public.print_template_sections s
join public.print_templates t on t.id=s.template_id
where f.template_section_id=s.id and t.document_type='ORCAMENTO'
and s.section_key='quote';
commit;