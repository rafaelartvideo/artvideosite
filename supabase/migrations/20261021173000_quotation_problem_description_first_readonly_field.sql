begin;
-- A descrição é apresentada no início de Orçamento e vem diretamente da OS.
update public.print_template_fields f
  set sort_order = f.sort_order + 1
from public.print_template_sections s
join public.print_templates t on t.id=s.template_id
where f.template_section_id=s.id
  and s.section_key='quote'
  and t.document_type='ORCAMENTO'
  and f.field_key <> 'quote.problem_description';

insert into public.print_template_fields
  (template_section_id,field_key,label,sort_order,is_enabled)
select s.id,'quote.problem_description','Descrição do problema',0,true
from public.print_template_sections s
join public.print_templates t on t.id=s.template_id
where s.section_key='quote'
  and t.document_type='ORCAMENTO'
  and not exists (
    select 1 from public.print_template_fields f
    where f.template_section_id=s.id
      and f.field_key='quote.problem_description'
  );

update public.print_template_fields f
  set sort_order=0,is_enabled=true,label='Descrição do problema'
from public.print_template_sections s
join public.print_templates t on t.id=s.template_id
where f.template_section_id=s.id
  and s.section_key='quote'
  and t.document_type='ORCAMENTO'
  and f.field_key='quote.problem_description';

-- A mesma descrição não deve ocupar um segundo campo em Informações da OS.
delete from public.print_template_fields f
using public.print_template_sections s,
      public.print_templates t
where f.template_section_id=s.id and s.template_id=t.id
  and t.document_type='ORCAMENTO' and s.section_key='order'
  and f.field_key='order.customer_notes';
commit;