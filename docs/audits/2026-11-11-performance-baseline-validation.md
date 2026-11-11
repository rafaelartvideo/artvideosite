# Union World — baseline de desempenho e carga contínua (11/11/2026)

## Evidências

- Chamadas acumuladas desde reset de estatísticas em 24/07/2026, **não são dados do dia**: notificações ~50.597 (média SQL 836,6 ms), SAC não lidas ~9.933 (média 1.876 ms), OS referências ~7.039 (383 ms), OS v3 ~2.597 (488 ms), OS IDs v5 ~397 (204 ms), login ~4.886 (224 ms), conclusão OS ~128 (859 ms).
- Amostra HTTP gateway antes do novo polling (15:20-15:42 UTC): notificações 22 chamadas, p50 1.328 ms, p95 2.004 ms, 0 respostas 5xx. Amostra posterior de 30 minutos em 15:50 UTC: notificações 29 chamadas, p50 1.286 ms, p95 2.061 ms, 0 respostas 5xx. Ambas são janelas com sobreposição e ainda **não representam comparação de implantação antes/depois**.
- Em 24h: cinco cron jobs SAC fizeram 1.730 execuções, 12 falharam. Projetos ainda utilizam SAC Digital; jobs foram mantidos ativos.
- SELECT/EXPLAIN sem execução: consultas básicas de notificações, protocolos finalizados SAC e listagem de OS usam os índices `organization_notifications_org_date_idx`, `sac_digital_protocols_finished_recent_idx` e `service_orders_org_created_idx`. Nenhum índice adicional criado.
- Ajuste sem alteração de autorização: `load_auth_access_v1` passa de duas invocações de `my_organizations_v2()` para uma CTE materializada compartilhada. SQL anterior salvo em scripts de rollback; migração no banco `20261111154743`, função com SECURITY DEFINER, STABLE e grants conferidos.
- Frontend: fallback de notificações da tela visível passa de 60 para 120 segundos; Realtime de INSERT, leitura, descarte e cache multiempresa não alterados. Estimativa teórica para a parcela periódica da carga: até 50% menos consultas, depende do número de sessões e eventos Realtime.

## Medição independente

Notebook Supabase: https://supabase.com/dashboard/project/wmjmtcjpunmzvonlkjcu/explorer/notebook/0b57672d-801a-415b-8107-a23b2b7bf2fb

Use-o em dois períodos com atividade comparável, após o deploy e sem rodar varreduras de logs repetidas. Medir chamadas, p50, p95, HTTP 500/504, SQL médio e delta de bytes temporários. Tempo de gateway não inclui renderização cliente. Entradas de conclusão OS/financeiro podem estar vazias sem operação real.

Disk IO Budget é métrica de burst do provedor e não pode ser inferida diretamente de `pg_stat_database.temp_bytes`. O Supabase Dashboard > Database Reports e Infrastructure deve confirmar recuperação do budget, bem como uso de CPU/RAM.

## Próximas intervenções condicionais

- Revisar `load_admin_notifications_v1` e `get_sac_digital_unread_counts` com EXPLAIN ANALYZE sob contexto autorizado e baixa carga, verificando planos reais e políticas RLS. Não reescrever SQL sem testes de permissões multiempresa e equivalência.
- Projetar paginação/hidratação incremental da SAC preservando histórico acessível. Não repetir cache de avatar revertido anteriormente.
- Antes de pausar cron, webhooks ou apagar SAC, migrar as dependências para o WhatsApp Union e garantir backup restaurável.
- Avaliar eventual upgrade Pro + Small mediante aprovação do usuário; não foi feita alteração de plano.
