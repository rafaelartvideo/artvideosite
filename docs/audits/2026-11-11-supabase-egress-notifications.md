# Auditoria de Egress e notificações — 11/11/2026

## Prioridades e limites

1. **P0 — Egress PostgREST / SAC:** o dashboard apresentou 71–80% de tráfego PostgREST nos dias 16 e 20/10. Uma consulta pontual em produção (somente leitura) para até 1000 protocolos abertos e 400 finalizados retornou 1006 protocolos e aproximadamente **1282 kB** somente de `sac_digital_contacts.avatar_url`. Esta é uma oportunidade mensurável, não uma afirmação de que a SAC responde por todo o tráfego.
2. **P1 — notificações:** `load_admin_notifications_v1` possui ~50 mil chamadas históricas, média histórica ~830 ms no snapshot anterior. O frontend mantinha polling de 60 s mesmo com canal Realtime conectado. Ajustado para 5 minutos **somente com canal confirmado**; sem conexão mantém 60 s, com erro mantém 120 s e em reconexão/retorno de aba longa revalida.
3. **P2 — logs:** o volume faturado de Logs Query é leitura/varredura da plataforma (dashboards, ferramentas e integrações). Logs Ingestion mede novos registros produzidos pelos serviços. **Não limpar/alterar retenção para tentar reduzir a métrica histórica do ciclo.** Priorizar filtros e janelas pequenas, evitar consultas repetitivas automatizadas e revisar verbosity de Edge Functions.
4. **P3 — Disk I/O:** alerta de orçamento de burst de IO da instância Nano. Não se confunde com as cotas de egress. `pg_stat_database.temp_bytes` ~721 GB desde reset de 24/07/2026 é uma **métrica histórica cumulativa, não ocupação atual nem consumo do ciclo**. Necessita medição por intervalo e inspeção de consultas com materialização pesada; nenhuma modificação de banco será feita apenas com base nesse total.
5. **P4 — escalar infraestrutura/backup:** avaliar after before/after e proteção de dados. Plano Free continua vulnerável a limitação; verificar cópia externa restaurável.

## Mudanças de código neste commit

- A lista de protocolos SAC lê os mesmos campos funcionais. **Primeira abertura** carrega avatares normalmente. Atualizações posteriores usam apenas os dados da conversa e a versão `contact.updated_at`; fotos são reaproveitadas da memória, isoladas por **empresa e usuário**, com validade máxima de 15 minutos.
- Contatos novos ou modificados têm avatares buscados em lote (60 IDs por consulta; 4 consultas paralelas no máximo). Sem acesso ou falha pontual, mantém a interface e fotos já conhecidas, sem abrir o escopo de permissões.
- A cache não persiste no armazenamento local e guarda no máximo 4 escopos, sem novos endpoints privilegiados, sem mudanças no servidor de SAC.
- A caixa de notificações mantém Realtime, fallback de 60s quando desconectado, backoff de 120s em erro, reconciliação após reconexão e retorno de janela oculta longa.

## Evidência de validação exigida

Acompanhar pelo painel Supabase Egress (PostgREST), chamadas da RPC de notificações, erros no SAC e número de protocolos ativos em períodos comparáveis. **Não há percentual de economia faturada confirmado**; os benefícios são reduzir transferência repetitiva de avatares e polling conectado, não alterar os dados persistidos.

## Não alterado

Sem SQL/DDL/limpeza, exclusão de arquivos, ajustes de RLS, mudanças em filas/serviços de terceiros, redução de qualidade de fotos ou aumento de conta/compute. A publicação pelo GitHub Actions deve passar testes e build antes de considerar a entrega concluída.
