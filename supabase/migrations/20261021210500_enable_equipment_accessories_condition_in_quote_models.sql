begin;
-- Todos os modelos de orçamento terão as três opções solicitadas,
-- sem exigir campos vazios no resultado impresso.
insert into public.print_template_fields(template_section_id,field_key,label,sort_order,is_enabled)
select s.id, options.field_key,options.label,options.sort_order,true
from public.print_template_sections s
join public.print_templates t on t.id=s.template_id
cross join (values
  ('equipment.accessories','Acessórios',1),
  ('equipment.condition','Condição do equipamento',2)
) as options(field_key,label,sort_order)
where t.document_type='ORCAMENTO' and s.section_key='equipment'
and not exists (
  select 1 from public.print_template_fields f
  where f.template_section_id=s.id and f.field_key=options.field_key
);
commit;