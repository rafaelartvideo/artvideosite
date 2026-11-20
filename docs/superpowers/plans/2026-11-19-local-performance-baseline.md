# Linha de base local e consumo agregado

Abordagem escolhida pelo proprietário: coleta local sem custo adicional. Desenho: instrumentação passiva, opt-in, com limite de tempo e memória; nenhum envio, polling adicional, payload, token, URL de filtro ou identidade real no arquivo exportado. Contextos separados por versão, aliases locais de usuário/empresa, sessão, rede e cache declarado. HTTP até cabeçalhos e consumo do corpo são métricas distintas. Falhas, abortos, navegação interrompida e timeout permanecem no denominador; não entram como respostas bem-sucedidas rápidas.

Percentis empíricos nearest-rank: p50 com pelo menos 30 sucessos, p95 com 200, p99 com 1.000 por estrato. São mínimos operacionais exploratórios, não garantia de precisão estatística. Não produzir p99 representativo usando milhares de chamadas artificiais. A coleta natural continuará após esta entrega; amostras insuficientes ficam explicitamente indisponíveis. Comparações exigem estratos equivalentes e avaliação da janela/variabilidade.

1. Testar coletor puro: opt-in, quantis, estratos, limites, privacidade, falhas e consumo real de Response.
2. Integrar fetch do Supabase e observador de navegação do CRM, com critérios explícitos de conteúdo para telas suportadas e primeira pintura separada.
3. Capturar duas amostras pequenas de pg_stat_database/pg_stat_wal/pg_stat_statements/pg_stat_io, sem reset, EXPLAIN ANALYZE ou varredura de tabelas/logs. Calcular deltas respeitando stats_reset e tempos distintos.
4. Consultar Usage/Billing agregado se houver sessão do painel; não estimar cobrança a partir de WAL, cache hit ou temp_bytes. Registrar indisponibilidade de métricas não acessíveis.
5. Executar qualidade, regressões e builds; entregar na main e conferir FTPS. Documentar ativação/exportação e limitações, sem prometer amostra futura já coletada.
