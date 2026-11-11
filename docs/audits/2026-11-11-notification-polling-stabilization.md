# Union World — redução de polling da caixa de notificações (11/11/2026)

A função `load_admin_notifications_v1` manteve ~836ms de média histórica em 50.588 execuções (contadores desde o reset de estatísticas, não do dia atual). Na amostra HTTP de 15h20–15h42 UTC foram 22 chamadas, p50 de ~1.328ms e p95 de ~2.004ms, sem 5xx; mede tempo de origem da API, não latência total no navegador.

O React Query fazia leitura completa a cada 60s enquanto a aba estava ativa. Mudança conservadora: no máximo uma leitura de contingência a cada 120s, sem polling em segundo plano, mantendo Realtime imediato, fluxo de recibos, invalidações por mudanças, carregamento inicial, cache por empresa/usuário e backoff de erro. Não foi alterada nenhuma regra de entrega ou de visualização. **Não reintroduzir cache de avatares da SAC revertido anteriormente.**

Previsão apenas para a parte periódica: até 50% menos RPCs por sessão visível contínua (não inclui eventos Realtime ou atualizações manuais). Conferir contagens reais, login, alertas pessoais e autorizações após a publicação. O ajuste não prova redução de Disk I/O e não resolve queries lentas individualmente.

Planos de execução (sem ANALYZE) confirmaram `organization_notifications_org_date_idx`, `sac_digital_protocols_finished_recent_idx` e `service_orders_org_created_idx` em consultas representativas. Nenhum índice adicional criado.
