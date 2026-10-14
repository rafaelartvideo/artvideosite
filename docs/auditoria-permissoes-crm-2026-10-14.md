# Union World — Auditoria de autorização e reformulação de Funções e Permissões

Data: 14/10/2026. Ambiente: CRM de produção (Supabase `wmjmtcjpunmzvonlkjcu`).
Objetivo: eliminar divergências entre interface, permissão da função, RLS, Storage e módulo contratado. **Não conceder acesso global e não excluir dados de produção indiscriminadamente.**

## Inventário verificado no banco

| Verificação | Resultado |
| --- | ---: |
| Permissões cadastradas | 427 |
| Funções cadastradas | 20 (5 em cada uma de 4 empresas) |
| Vínculos função/permissão | 3.571 |
| Overrides individuais existentes | 0 |
| Tabelas públicas com RLS desativada | 0 (209 tabelas) |
| Policies públicas após atualização | 358 |
| Policies de Storage inventariadas | 30 |
| Permissões sem label ou módulo ANTES | 30 |
| Permissões sem label ou módulo DEPOIS | 0 |
| Concessões cujo módulo/escopo está indisponível | 392 |
| Permissões de situações inexistentes | 3 (12 vínculos com funções) |
| Membros ativos com funções inativas | 0 |
| Vínculos de empresa duplicados | 0 |
| Erros PostgreSQL 42501 nos logs disponíveis das últimas 24h | 73 |

**Interpretação:** os 392 vínculos fora de escopo incluem permissões de módulos atualmente desativados e outros acessos reservados, portanto NÃO devem ser excluídos automaticamente. A UI e o carregamento de permissões devem mostrar somente os acessos utilizáveis. Os 3 identificadores antigos de situações são incompatíveis com situações atuais, mas seus vínculos foram preservados até saneamento com avaliação do histórico.

## Falhas estruturais encontradas e corrigidas

1. **Duas definições diferentes de escopo:** `listPermissions` e `getUserPermissionAccess` replicavam regras de habilitação/organização no frontend. Substituídas por `list_organization_permission_catalog_v1`, com o mesmo `private.permission_belongs_to_organization` do banco.
2. **Login aceitava concessões de módulos inativos:** `my_organization_permissions` filtrava apenas alguns prefixos, permitindo flags de UI que o backend recusava. Padronizado para usar `private.permission_belongs_to_organization` em todas as chaves.
3. **Salvamento de função não atômico:** executava 1 requisição por permissão nova/removida, com risco de estado parcial. Substituído pela RPC `save_role_permission_selection_v1`, SECURITY INVOKER e transacional. Somente IDs do catálogo apresentado são alterados, preservando permissões de módulos não exibidos.
4. **Salvar sem carregar permissões:** editor bloqueia Salvar até concluir leitura dos vínculos; evita esvaziamento acidental.
5. **Permissões individuais invisíveis eram descartadas no formulário:** preservadas até que o administrador as altere explicitamente.
6. **Alterações feitas por outros navegadores não chegavam automaticamente:** as tabelas de ACL não estão publicadas no Realtime. Adicionada atualização leve ao retornar à aba (no máximo uma verificação a cada 120 segundos), sem refazer bootstrap da interface.
7. **Catálogo visual redundante:** UI com Visualização, Ações e Colunas das tabelas, busca, grupos recolhíveis e indicação de permissões herdadas/individuais. IDs e políticas reais não foram mesclados.
8. **Metadados antigos incompletos:** 30 chaves atualizadas apenas em `label` e `module_name`, sem mudança de privilégios.
9. **Imagem de OS:** banco já tem policy que autoriza o criador da OS a vincular a mídia; o fluxo de edição usa o caminho próprio da OS. Verificação de policy em 14/10 confirmou a correção existente.

## Migrações aplicadas no CRM

- `20261014153000_centralize_role_permission_catalog.sql`
- `20261014155000_atomic_role_permission_save.sql`
- `20261014160000_permission_catalog_labels_cleanup.sql`
- `20261014161500_auth_permissions_module_scope_alignment.sql`

Verificação pós-aplicação: as duas novas RPCs estão presentes, SECURITY INVOKER, `EXECUTE` negado para `anon` e permitido para `authenticated`; `my_organization_permissions` contém o filtro compartilhado; 0 metadados incompletos. Testes de contrato adicionados ao `test:regressions`.

## Segurança — achados NÃO apagados automaticamente

O Security Advisor do Supabase reporta 43 tabelas com RLS ativado e nenhuma policy; várias são internas, usadas exclusivamente por RPC/Edge Functions (ausência de policy pode ser intencional: deny-all). Não criar policies amplas sem análise individual.
Há alertas para funções `SECURITY DEFINER` executáveis por `authenticated` e três executáveis por `anon`, além de extensão `pg_net` em `public`. As funções anônimas incluem acompanhamento público de OS e pedido de orçamento: revogação sem análise do produto quebraria fluxos existentes. Avaliar separadamente controle de parâmetros, permissões, autenticação, rate limit e contratos externos. O Performance Advisor ainda lista FKs sem índice; não criar centenas de índices automaticamente.

Na triagem das policies públicas, não foram encontradas policies literalmente incondicionais (`true`) nem policies de INSERT/UPDATE/ALL sem `WITH CHECK` explícito. Isso NÃO prova ausência de falhas em expressões complexas.

## Limites dos testes e próximos critérios de aceite

- Não foi executada transação de escrita real com sessão de Recepcionista/Técnico/Gestor em produção; consultas administrativas e análise estática não substituem ensaios com cada perfil.
- Sem alterar módulos contratados, conferir, em sessões de teste, criar/editar OS com imagens; Agenda (consultar/criar/remarcar); documentos/assinaturas; permissões de imagens/situações; Estoque, PDV, Financeiro e Painel do Técnico.
- Validar que um cargo sem ação não consiga executar a operação via API e que um cargo autorizado consiga concluir todas as etapas filhas (RLS/Storage).
- Confirmar `build:crm` e suíte `test:regressions` do workflow de deploy após os commits.
- As três permissões de situações órfãs e o inventário de SECURITY DEFINER requerem saneamento posterior individual, sem exclusões automáticas.

**Política de manutenção futura:** nova funcionalidade deve declarar a permissão de visualização, as ações efetivas, os requisitos do backend e a regra de escopo em um único contrato, com teste positivo e negativo em cada papel. Uma ação só deve aparecer como habilitada quando todas as etapas necessárias forem autorizadas.
