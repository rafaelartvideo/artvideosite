-- Campos extras dos equipamentos aceitam texto livre (letras, números e símbolos).
-- Atualiza campos já existentes e modelos oficiais sem excluir respostas das OS.
begin;

-- Primeiro campos locais: a sincronização automática dos templates da Union
-- compara os tipos locais com os oficiais.
update public.technical_fields
   set field_type = 'text'
 where field_type <> 'text';

-- Modelos oficiais passam a produzir apenas campos de texto livre.
update public.catalog_technical_field_templates
   set field_type = 'text'
 where field_type <> 'text';

-- Preserva os números antigos, inclusive valores decimais, como texto editável.
-- Em um único UPDATE, satisfaz o check que exige value_number nulo para 'text'.
update public.service_order_technical_values
   set field_type_snapshot = 'text',
       value_text = coalesce(value_text, value_number::text),
       value_number = null
 where field_type_snapshot <> 'text' or value_number is not null;

commit;
