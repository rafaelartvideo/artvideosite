# Linha de base de desempenho e consumo — 19/11/2026

## Atualização de fechamento — 20/11/2026

Usage agregado consultado novamente às 11:31 America/Sao_Paulo (14:31 UTC), mesma organização, todos os projetos e ciclo 13/11–13/12. Sem abrir histórico de logs:

| Item | Leitura 19/11 | Leitura 20/11 | Diferença observada |
|---|---:|---:|---:|
| Log Query | 145,975 GB | 149,664 GB / 100 GB | +3,689 GB |
| Log Ingestion | 1,114 GB | 1,286 GB / 1 GB | +0,172 GB |
| Egress sem cache | 2,000 GB | 2,309 GB / 5 GB | +0,309 GB |
| Egress de cache | 0,110 GB | 0,116 GB | +0,006 GB |
| Edge invocations | 71.805 | 81.203 | +9.398 |
| Realtime messages | 22.026 | 27.899 | +5.873 |

O painel mantém o aviso de carência por egress do ciclo anterior até 12/12. As diferenças são entre leituras sujeitas a atraso de atualização: não são taxas exatas de 24h, não identificam origem/usuário e não foram atribuídas à auditoria. Log Query e Ingestion continuam acima da franquia; o egress do ciclo atual está em 46%. As medições SQL/infraestrutura abaixo continuam identificadas como amostras de 19/11, sem serem apresentadas como instantâneas de 20/11.

## Resultados de consumo verificados

Fontes: Supabase Dashboard > organização > Usage/Billing (todos os projetos) e Observability/Database do projeto wmjmtcjpunmzvonlkjcu. Leitura em 19/11, aproximadamente 11:10–11:17 America/Sao_Paulo. Uso pode levar até uma hora para atualizar. Não foram consultados históricos de logs. As amostras brutas e timestamps SQL estão em `2026-11-19-baseline-counters.json`.

| Item | Uso do ciclo 13/11–13/12 | Franquia | Observação |
|---|---:|---:|---|
| Log Query | 145,975 GB | 100 GB | 146%; volume varrido acumulado, não valor de fatura |
| Log Ingestion | 1,114 GB | 1 GB | 111%; painel anuncia cobrança após carência no início de 2027 |
| Egress sem cache | 2,00 GB | 5 GB | 40%; não excedido no ciclo atual |
| Egress de cache | 0,11 GB | 5 GB | separado do egress sem cache |
| Storage médio | 0,496 GB | 1 GB | 50% |
| Banco | 0,246 GB | 0,5 GB | resumo; tamanho do relatório 234,55 MB |
| Edge Functions | 71.805 chamadas | 500.000 | 14% |
| Realtime | 22.026 mensagens / pico 13 conexões | 2 milhões / 200 | 1% / 7% |
| MAU | 6 | 50.000 | menor que 1% |

Plano Free confirmado. As duas faturas antigas disponíveis são de US$ 0,00; isso não é uma estimativa de fatura futura. O painel informa que Log Query não é cobrado diretamente e que a organização não é faturada por overages no plano atual. Não se multiplicou uso por preço hipotético. Nenhuma assinatura, plano ou configuração de cobrança foi alterada.

**Aviso existente do provedor:** a organização excedeu egress no ciclo anterior e está em carência até 12/12/2026. O painel prevê resposta 402 se restrições forem aplicadas após esse prazo e o excesso persistir. Não é evidência de restrição atual e não explica, por si só, os timeouts atuais. Os excessos de Log Query/Ingestion e o aviso por egress anterior são fatos distintos. A leitura de Usage não identificou quem gerou a varredura histórica de logs; não se atribui esse volume à sessão de auditoria.

Links das fontes autenticadas: [Usage](https://supabase.com/dashboard/org/mcjatwuoryjmcfnegbue/usage), [Billing](https://supabase.com/dashboard/org/mcjatwuoryjmcfnegbue/billing), [Database](https://supabase.com/dashboard/project/wmjmtcjpunmzvonlkjcu/observability/database). Referências de interpretação: [uso e cobrança](https://supabase.com/docs/guides/platform/manage-your-usage), [Metrics API](https://supabase.com/docs/guides/observability/metrics).

## Infraestrutura e erros

Nano, 28/60 conexões na visão inicial. Relatório de 60 minutos: memória usada 424 MB, memória comprometida 1,45 GB com aviso Severe, CPU 26,70%. Após uma atualização manual: 429,59 MB usados, 1,48 GB comprometidos, CPU 23,47%. Comprometimento não é memória residente e esses valores não provam vazamento, OOM ou causalidade dos timeouts.

Network throughput, IOPS, Disk throughput, conexões e Disk Usage falharam ao carregar mesmo após uma atualização. Não se registraram zeros, nem se estimou IO Budget a partir de temp_bytes. O endpoint de métricas exige autenticação específica; nenhuma credencial foi extraída do navegador ou incorporada ao aplicativo.

Overview, janela 10:11–11:10 local: 10.950 requests, 99,2% de sucesso; cartões apontavam 49 erros Postgres, 25 API Gateway e 5 Realtime, zero nos cartões Auth/Edge/Storage. São contadores agregados de serviços, sujeitos a sobreposição e atraso; não se somam como incidentes únicos nem se conclui que todos são timeout.

## Deltas econômicos no PostgreSQL

Sem reset de estatísticas, EXPLAIN ANALYZE, varreduras operacionais ou polling novo. Duas leituras de pg_stat_database/pg_stat_wal, separadas por 324,842 segundos, com stats_reset iguais:

- WAL: +1.406.322 bytes, aproximadamente 4.329 bytes/s, escopo do cluster; não é egress.
- Temporários: +31.170.041 bytes, aproximadamente 95.954 bytes/s; não é I/O físico nem IO Budget.
- Commits: +3.526 (10,85/s); rollbacks: +19 (0,058/s). Rollbacks não equivalem à contagem de erros HTTP.
- Leituras de blocos do banco: +2; blocos de 8.192 bytes. Leituras de buffer PostgreSQL podem ser atendidas pelo cache do sistema operacional.
- Deadlocks: delta zero, sem concluir que erros não aconteceram.
- wal_buffers_full: +4.479 (13,79/s), sinal descritivo a acompanhar, sem inferência de causa ou ajuste automático.

track_io_timing e track_wal_io_timing estão off: tempo de leitura/escrita igual a zero não significa I/O sem latência. pg_stat_io foi lido de forma limitada por backend/contexto; é uma amostra acumulada e não mede o budget físico do provedor.

Janela independente de RPCs 14:13:47–14:17:53 UTC, delta de pg_stat_statements, somente consultas PostgREST dos nomes selecionados, queryid preservado como texto:

| RPC | Chamadas no intervalo | Chamadas/min | Média SQL no intervalo |
|---|---:|---:|---:|
| load_admin_notifications_v1 | 9 | 2,20 | 2.037,39 ms |
| union_whatsapp_inbox_counts | 13 | 3,17 | 737,34 ms |
| my_organization_permissions | 61 | 14,88 | 116,18 ms |
| load_orders_reference_data_v1 | 3 | 0,73 | 919,59 ms |
| load_auth_access_v1 | 0 | 0 | indisponível |

Não são percentis, tempo do navegador ou comparação antes/depois. A janela agrega usuários e cargas diferentes. Chamadas que falham não são integralmente representadas por estas estatísticas. A média de notificações torna essa RPC candidata prioritária para a coleta passiva; não autoriza uma reescrita de RLS sem equivalência e planos seguros.

Reprodução offline dos deltas, sem qualquer consulta de rede:

```powershell
node scripts/performance/report-baseline.mjs docs/audits/2026-11-19-baseline-counters.json
```

## Coleta local de telas e RPCs

A escolha aprovada foi coleta local sem custo de serviço adicional. Não há upload automático, persistência no Supabase, leitura de payloads, tokens, query strings, IDs reais exportados, novos intervalos de rede ou chamadas sintéticas para produzir amostras. A observação permanece desligada até o operador iniciar. Limites: oito horas, 25.000 registros e 512 spans simultâneos; descartes são informados. O custo de CPU/memória do navegador é limitado, mas não é literalmente zero.

No CRM, **Ctrl+Alt+M** abre o painel separado de medição. Ele não aparece na navegação nem altera telas de negócio.

1. Prepare usuário, organização, versão, período de trabalho, rede e condição de cache. Não misture operadores, troca de rede, login novo, navegação inicial e revisitas.
2. Escolha cache Não controlado, Frio ou Aquecido e clique **Iniciar nova coleta local**. A declaração não limpa nem aquece caches: a preparação deve ser real. Se não estiver seguro, use Não controlado e não trate a comparação como controlada.
3. Feche o painel e trabalhe normalmente. Não repita consultas artificialmente para completar n.
4. Abra o painel, use **Atualizar resumo** e **Exportar arquivo local**. **Parar coleta** encerra spans pendentes como interrompidos. Recarregar ou fechar a aba apaga a memória; exporte antes. Nova coleta também apaga a anterior.

Os aliases de usuário/empresa são locais à coleta e não permitem relacionar pessoas entre arquivos. O identificador da sessão impede reunir silenciosamente sessões diferentes. Rede inclui os indicadores disponíveis no navegador (effectiveType, RTT estimado, downlink estimado e online); são aproximações e podem estar indisponíveis. Build, usuário/empresa, sessão, tela, rede, cache declarado, visibilidade e tipo de visita compõem o estrato. RPCs capturam a tela atual no momento de envio. Comparações entre versões exigem pareamento explícito dos demais fatores; nunca agrupar todo mundo como uma distribuição única.

Também é necessário manter filtros, paginação, período e ações equivalentes. O payload não é capturado e o coletor não certifica sozinho essa equivalência. Cada registro inclui offset monotônico em milissegundos relativo ao startedAt da coleta para localizar a janela temporal sem gravar conteúdo da operação.

Métricas distintas:

- `rpc_headers`: do início do fetch aos cabeçalhos, incluindo falhas de transporte. Não é tempo isolado de SQL.
- `rpc_body`: do início do fetch até o consumo do corpo pelo cliente existente. Não clona nem baixa de novo a resposta; corpo não consumido fica censurado. Resposta lida por stream/clone não é instrumentada como conclusão do corpo original.
- `screen_paint`: commit da rota até dois requestAnimationFrame em primeiro plano. É um proxy de apresentação, **não FCP/Web Vitals nem clique até conteúdo pronto**. Inclui a marca collection_start/context_change separada de navegação.
- `screen_ready`: critério de conteúdo principal para **Home, lista de OS, resumo Financeiro e Estoque**. Regras são títulos e marcadores específicos; não medem conclusão de todos os widgets. Observação de mudanças é limitada a essas telas, com verificação agrupada em até 250 ms e prazo de 30 s. Abas ocultas e navegações interrompidas são censuradas. Subrotas e detalhes não são confundidos com o overview: recebem somente o proxy de dois quadros, sem inventar readiness. Essa é a cobertura inicial; não se declara toda tela pronta com base em uma pintura.

IDs de registros são removidos dos nomes de tela; subrotas não mapeadas são agrupadas como detail/other e não devem ser comparadas como uma tela específica. O coletor não separa erro de domínio devolvido em HTTP 200 sem ler payload: estes aparecem como sucesso de transporte. HTTP 4xx/5xx, inclusive 402/504, falha de rede, abortos, timeout e falha de leitura são preservados como outcomes, sem conteúdo do erro.

## Critério de amostra e honestidade dos percentis

Quantil nearest-rank de **durações bem-sucedidas**, com erros/censuras/outcomes no mesmo resumo. p50 requer pelo menos 30 sucessos por estrato, p95 200, p99 1.000. São mínimos operacionais exploratórios: n=1.000 deixa apenas ~10 observações na cauda de 1%, não garante estabilidade estatística ou intervalo estreito. Reportar sempre n, janela, erros e interrupções; usar vários períodos equivalentes e avaliar estabilidade/intervalos antes de concluir ganho.

O relatório devolve null/“Amostra insuficiente” abaixo desses limites. Não se fabricou p95/p99 a partir de cinco navegações ou de média/máximo SQL. Coletas com descartes, rede/cache não controlados ou contexto anônimo devem ser rotuladas como exploratórias. Não reunir exportações de sessões/operadores distintos apenas para ultrapassar o mínimo. Ainda é necessário acumular uso natural adequado; a implantação do coletor não é uma amostra pronta nem comprovação de melhora dos timeouts.

Nenhum banco, RLS, cron, plano, serviço VPS ou configuração de logs foi alterado para esta medição. O trabalho entrega a coleta verificável e uma primeira referência de consumo, preservando as limitações acima.

Validação de integração em 20/11: 1.022 testes, 1.020 aprovados, zero falhas e dois ignorados por limitações locais já registradas (FFmpeg e ordenação ICU nativa no motor SQL local). Qualidade e builds site/CRM passaram. As atualizações recentes de sessão, diálogos e WhatsApp da main foram preservadas; a instrumentação de métricas não requer publicação de função, migração ou serviço VPS.
