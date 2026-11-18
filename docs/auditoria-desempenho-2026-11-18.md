# Auditoria de desempenho — 18/11/2026 — etapa 1

## Correção comprovada
O sincronizador global criava um temporizador por chave. Quando eventos atingiam uma família e seus detalhes, as invalidações sobrepostas cancelavam/reiniciavam a mesma consulta ativa. Reprodução local com QueryClient/QueryObserver reais: três invalidações sobrepostas iniciavam três execuções; o lote novo inicia uma execução. Isto é uma medição de teste, não uma porcentagem de ganho em produção.

Implementado: janela fixa de 900 ms compartilhada, marcação de caches afetados como desatualizados e um único refetch por consulta ativa no módulo em primeiro plano. Sem novo polling, sem alterar canais, filtros de organização, RLS, aparência ou funcionalidades. Desmontagem cancela o temporizador e descarta a fila.

## Verificação
- Quatro testes novos: reprodução anterior (3 chamadas), correção (1 chamada), módulos inativos/isolamento de clientes e vínculo do temporizador/limpeza.
- npm run test:ci passou (inclui qualidade, telefonia, financeiro, autenticação, OS, WhatsApp, permissões e regressões).
- Builds site e CRM passaram. CRM: index 598,52 kB / gzip 176,18 kB; TabOrders 700,78 kB / gzip 189,59 kB; html2pdf 984,61 kB / gzip 285,64 kB. Sem comparação anterior de bundle: não se alega redução.
- Três leitores de testes passaram a normalizar CRLF: suas verificações permanecem iguais.
- Testes Python locais do agente PABX não são conclusivos no Windows (fcntl ausente; testes de Linux); verificação obrigatória no workflow Linux permanece ativa.

## Diagnóstico econômico Supabase
Projeto wmjmtcjpunmzvonlkjcu: ACTIVE_HEALTHY. Consultas apenas em estatísticas agregadas e catálogo pg_stat_statements (6 linhas), sem logs, dados operacionais, mídias, EXPLAIN ANALYZE ou carga.
Amostra 11:57 UTC: 30 conexões; uma amostra de atividade mostrou 8 ativas e 22 idle. Contadores cumulativos desde 24/07/2026: 8 deadlocks e cerca de 860,8 GB de arquivos temporários. Não são taxas atuais nem atribuíveis à correção.
Top acumulado: realtime.list_changes média 20,31 ms / 5.878.667 chamadas; load_admin_notifications_v1 média 838,93 ms / 54.345; get_sac_digital_unread_counts média 1.875,96 ms / 9.933; my_organization_permissions média 162,10 ms / 31.518; union_whatsapp_inbox_counts média 698,63 ms / 6.320. Estatísticas históricas incluem funcionalidades legadas; não comprovam que todos esses consumidores ainda estejam ativos.

## Cobertura e pendências
Inspecionados cache global, invalidação por rota, isolamento na troca de empresa, notificações, intervalos de WhatsApp/PABX e configuração do deploy. A auditoria completa de cada módulo ainda está pendente. A primeira correção afeta consumidores do sincronizador em OS, estoque, financeiro, PDV, agenda, cadastros e dashboard.
Notificações já usam contingência de 120 s sem polling em segundo plano; não foi aumentado cache de permissões ou dados financeiros. PABX mantém consultas periódicas de autorização; não foram suspensas porque isso exige validar revogação e chamadas ativas. Nenhum serviço reiniciado.
Pendentes: planos SQL das RPCs custosas e índices, comparação atual de latências/p50/p95 e consumo, perfil de renderização por módulo, VPS/WuzAPI/Asterisk e validação completa de fluxos simultâneos. Nenhuma migração ou Edge Function foi modificada ou publicada nesta etapa.
Alterações locais anteriores de diálogos preservadas no stash denominado preserve pending dialog changes before performance audit 2026-11-18; arquivos não rastreados anteriores preservados fora do commit.
