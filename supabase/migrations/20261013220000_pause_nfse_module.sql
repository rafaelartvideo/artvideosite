-- Pausa temporária da NFS-e. Mantém esquemas, dados, rascunhos,
-- permissões e preferências de cada empresa para reativação futura.
-- A emissão real já estava desativada.
update public.system_modules
   set is_active = false
 where key = 'nfse'
   and is_active is distinct from false;