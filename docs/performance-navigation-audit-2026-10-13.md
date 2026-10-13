# Union World — Auditoria de navegação, renderização e consultas

Data: 13/10/2026. Projeto Supabase CRM: `wmjmtcjpunmzvonlkjcu`. Repositório: `rafaelartvideo/artvideosite`. Branch: `main`.

## Sintomas
- Endereço do módulo muda imediatamente, mas conteúdo aparece depois.
- Login inicial espera carregar o painel.
- Flash visual em OS > Documentos > voltar à OS.
- Preocupação com GETs automáticos, uso de Realtime e custo do banco.

## Diagnóstico confirmado no código (antes da revisão)
1. `src/app/Admin.tsx`: Suspense envolvia sidebar, header e todos os módulos lazy. Ao carregar código de rota ainda não baixado, ocultava o painel inteiro.
2. `src/features/orders/presentation/TabOrders.tsx`: detalhes de OS eram bloqueados por `workspaceLoading` do RPC amplo de referências de OS.
3. `src/features/orders/application/useOrderFilters.ts`: query de listagem continuava habilitada em telas de detalhe, edição, documentos e monitoramento somente de detalhe.
4. `src/shared/ui/admin/AdminLayout.tsx`: título de página sincronizado após paint, cleanup apagava indiscriminadamente o header; animação de página introduzia transições perceptíveis.
5. `src/app/Admin.tsx`: reset de scroll inclusive nas mudanças de subpáginas e query string da mesma OS.
6. `src/features/auth/infrastructure/auth.repository.ts`: SELECT de `profiles.is_active` após `username-auth`, que já validava `profiles.is_active` na Edge Function antes de autenticar.
7. `src/infrastructure/query/QueryRealtimeSync.tsx`: duas assinaturas por tabela (INSERT e UPDATE) para tenants, reconsultas de caches de módulos inativos, repetição do clear de cache na troca de empresa e debounce que reiniciava sob eventos contínuos.
8. `src/features/admin-home/presentation/AdminHomePage.tsx`: polling de avisos a cada 15 segundos em paralelo ao mecanismo de atualização por eventos.
9. `src/features/orders/application/useOrdersWorkspace.ts`: atualizava amplamente caches de OS, clientes, estoque, agenda e dashboard depois de ações da OS.
10. `src/app/App.tsx`: importação estática do PublicShell do site público no núcleo comum ao CRM.

## Correções efetuadas no código (commits no main)
- Suspense movido para área de módulo, preservando cabeçalho e menu.
- Pré-carregamento somente dos arquivos JS de módulos em hover/foco; no login antecipa import da Home em paralelo à autenticação. Não realiza consultas ao banco.
- `PublicShell` carregado apenas no caminho do site público.
- OS existente: carrega rota independente do RPC de referências. Listagem paginada desativada enquanto detalhes/documentos/editor são visualizados; cache preservado para volta.
- Scroll não reinicia na alternância entre subpáginas da mesma OS; cabeçalho sincronizado antes do paint; removida animação artificial em detalhes/documentos.
- Retirado GET de perfil redundante do login (validação na Edge Function mantida).
- Realtime: uma assinatura `postgres_changes` wildcard por tabela tenant, preservando filtro por organização. Invalidações agrupadas por chave durante 900 ms (throttle), não reconsulta caches inativos; consultas stale voltam a ser revalidadas em módulo visível.
- Cache de troca de empresa limpo apenas no provedor React Query principal.
- Home: fallback de consulta de avisos reduzido de 15s para 5min, sem atualização periódica em background. Eventos continuam atuando.
- Edição/fluxos de OS: atualização dos caches de outros módulos apenas marca stale; módulo OS permanece atualizado.

## Observações reais de produção
`pg_stat_statements` foi zerado em **13/08/2026** (stats_reset). Contadores abaixo são acumulados desde então e **não** representam chamadas por minuto ou gasto de rede:
- `load_orders_reference_data_v1`: 1.833 calls, 498,2 s de execução total, média 271,8 ms.
- `load_auth_access_v1`: 1.151 calls, 211,9 s de execução total, média 184,1 ms.
- RPC workspace da OS: 877 calls, 175,2 s total, média 199,7 ms.
- Consultas de `service_order_part_requests`: 14.639 calls, 112,6 s total, média 7,7 ms.
- Carga histórica do SAC Digital e da publicação Realtime contribui para o volume do PostgreSQL; já há otimizações específicas em `docs/sac-digital-optimization-ledger.md`.
- O banco possui índices em `service_orders` por organização, abertura e campos de filtragem.
- O Supabase performance advisor reporta 223 FKs sem índice de cobertura (INFO), 105 índices classificados como não usados (INFO), 2 avisos de initplan RLS (WARN) e 3 de políticas permissivas múltiplas (WARN). **Nenhum índice/política foi alterado nesta revisão**; examinar plano de execução e carga antes de mudar.
- Lint documentação: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

## Segurança, limites e verificação
- Nenhuma permissão/RLS enfraquecida, nenhum dado apagado, nenhuma migração de banco realizada neste ciclo.
- Isolamento por empresa mantido no filtro Realtime e chaves de cache existentes.
- Leituras do backend observadas são históricas; sem instrumentação em sessão real, não afirmar melhoria de latência percentual.
- As alterações foram confirmadas nos arquivos do GitHub main. GitHub combined status e workflow runs não retornaram checks associados ao HEAD desta revisão.
- **Pendente:** build Vite/TypeScript completo e testes no navegador com sessão válida de Union e empresa parceira. Conferir login inicial, navegação menu no primeiro hover, OS > Documentos > Voltar, OS edição, lista paginada, notificações Realtime em duas abas, troca de empresa e telas minimizadas.
- Após deploy, medir waterfall Network/Performance, tempos `load_auth_access_v1` e `load_orders_reference_data_v1`, requests/min, render delay e latência percebida. Não resetar `pg_stat_statements` sem janela e coleta prévia.
