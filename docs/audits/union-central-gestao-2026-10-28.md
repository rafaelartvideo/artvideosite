# Central de Gestão Union — auditoria de implementação (28/10/2026)

## Escopo entregue
- Espaços personalizados (Union, Artvideo, CTI), hierarquia de pastas e arquivos privados existentes.
- Cadastros estruturados: domínios/registradores/hospedagem/renovação/SSL/DNS e campanhas com canal, período, orçamento, situação e resultados.
- Arquivos vinculados a campanhas e histórico de versões preservado em Storage.
- Pesquisa entre pastas e espaços com consulta paginada/limitada e RLS.
- Lixeira reversível para registros e pastas, preservando versões e evitando restaurar itens já excluídos separadamente.
- Trilha de auditoria com ações de criação, alteração, exclusão, restauração e acesso ao cofre.
- Cofre: segredo mantido em Supabase Vault; tabela pública guarda somente ID da referência cifrada; RPC restrita a gestores da plataforma e chamada explícita de revelação; UI esconde resultado após 30 segundos.
- Tarefas do espaço integradas ao módulo Compromissos e Tarefas. Alteração de vencimentos de domínio/SSL gera ou atualiza automaticamente tarefas com avisos em 30, 7 e 1 dia; a rotina do work-items existente está agendada a cada minuto.

## Migrações
1. `20261028190000_union_central_gestao_extended.sql`
2. `20261028193000_union_management_domain_reminders.sql`
3. `20261028194500_union_management_audit_trigger_fix.sql`
4. `20261028200000_union_management_trash_preserve_individual.sql`

Aplicadas ao projeto CRM em 28/10/2026. Não removeram dados. Versionamento retroativo inicial de arquivos existentes.

## Segurança
- RLS ativada em todas as tabelas novas; public.management_credentials não possui políticas e tem privilégios revogados de anon/authenticated intencionalmente. Acesso apenas por funções verificadas.
- As funções do cofre exigem login, permissão `platform.management.manage` para revelar/gravar e registram eventos, sem secret em auditoria.
- Somente metadados de conta (usuário/URL) são salvos em `management_records`; senhas não são persistidas em metadados.
- Não salvar tokens ou senhas em observações. Confirmar configuração de MFA do Supabase Auth antes de exigir AAL2; a versão atual mantém a política de login do CRM, sem forçar segundo fator no cofre.

## Testes realizados
- Migrações executadas com sucesso no Supabase.
- Smoke test transacional (ROLLBACK) confirmou que cadastro de domínio com duas datas gera duas tarefas; nenhum registro de teste persistiu.
- Smoke test transacional identificou e validou correção do gatilho de auditoria em espaços e pastas.
- Cron `work-items-reminders-1min` confirmado ativo.
- Testes de regressão em `src/features/management/domain/management-integrity.test.mjs`, incluídos no script `test:regressions`.
- CI de PR: validar resultado do GitHub Actions antes de considerar publicado.

## Testes manuais após publicação
1. Abrir Central de Gestão como gestor; criar espaço, pasta, subpasta, registro e enviar arquivo; editar e restaurar.
2. Criar conta com senha de teste; confirmar que não aparece na tabela/JSON; revelar apenas com permissão; conferir registro na trilha.
3. Usuário apenas com permissão de visualização: conferir recusa ao revelar/gravar senha, editar ou apagar.
4. Registrar domínio e datas próximas; conferir painel e tarefas geradas; editar data sem duplicar tarefa.
5. Criar campanha e anexar criativos; pesquisar nome em outras pastas e outros espaços.
6. Enviar segunda versão e abrir versão anterior. Confirmar que as logomarcas não expiram durante navegação.

## Limites que exigem decisão futura
- Datas de domínio e SSL são cadastradas manualmente; monitoramento externo DNS/WHOIS/TLS em tempo real não foi ativado.
- O cofre usa permissão de gestor da Union, não tem compartilhamento individual por credencial nem desafio MFA independente. Integrá-los requer definição explícita de modelo de acesso e fluxo de segundo fator.
- Lixeira permite restaurar, não oferece expurgo permanente automático. Mantém backups/arquivos até definição de retenção.
