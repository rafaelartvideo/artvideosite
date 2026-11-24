-- Rascunho: converter em migration oficial após teste em ambiente isolado.
-- Nenhuma concessão automática: atribuir explicitamente aos perfis autorizados.
begin;
insert into public.permissions(key,label,description,module_name,sort_order) values
('whatsapp.history_import.view','Visualizar importações de histórico','Consultar pacotes e progresso da própria empresa.','Canais de Atendimento',5090),
('whatsapp.history_import.start','Iniciar importações de histórico','Preparar e iniciar lote para uma conta da própria empresa.','Canais de Atendimento',5091),
('whatsapp.history_import.manage','Gerenciar importações de histórico','Pausar, retomar e interromper importações.','Canais de Atendimento',5092),
('whatsapp.history_import.rollback','Desfazer importações de histórico','Desativar o vínculo histórico sem apagar mensagens atuais.','Canais de Atendimento',5093)
on conflict(key) do nothing;
commit;
