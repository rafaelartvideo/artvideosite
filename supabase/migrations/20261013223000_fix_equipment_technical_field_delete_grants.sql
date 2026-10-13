-- As políticas RLS já autorizam a remoção somente a quem pode gerenciar
-- campos técnicos na empresa. O privilégio SQL DELETE estava ausente,
-- bloqueando o fluxo mesmo para usuários autorizados.
-- Não modifica RLS, permissões funcionais ou escopo de empresas.
grant delete on table public.equipment_type_technical_fields to authenticated;
grant delete on table public.technical_fields to authenticated;
