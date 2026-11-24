# Correções incrementais dos timeouts — 24/11/2026

**Objetivo:** recuperar sincronizações após lentidão e reduzir trabalho SQL comprovadamente repetido, sem ampliar limites, permissões ou tempo de espera.

Evidência inicial: 57014 em duas janelas, respostas API até92,7s, falhas cron de inicialização, Realtime e monitoramento também afetados. Postgres sem reinício desde11/11; snapshotposterior38/60conexões, sem espera porlocks. CPU/RAM/disco históricos não foram confirmados pelas ferramentas disponíveis; não atribuir causa física sem dados.

1. PABX: relatório rejeitado por prova expirada não deve impedir uma nova consulta integral autorizada. Manter assinatura, sequência, empresa, prazo e rejeição do relatório antigo. Teste reproduzido e revisão independente sem bloqueadores.
2. Painel técnico: usar as definições de produção como base; calcular cada permissão idêntica uma vez por chamada, mantendo filtros e campos. Executar SQL isolado e medir antes/depois.
3. Notificações: plano real mostra custo de políticas repetidas; índices relevantes já existem, JIT estádesligado. Não publicar alternativas que regressam caixas pequenas. Investigar alterações apenas com ganho mensurado e equivalência de acesso.
4. Validar cada lote, integrar na main, aplicar migração/função separadamente e verificar publicação/estado. Informar ao usuário cada ajuste efetivamentevalidado/implantado.

Sem aumento do plano ou limites de conexões, reinício do Asterisk, criação de chamadas reais, mudanças de RLS ou remoção de dados.

## Aplicado e verificado

- PABX: commit `f1d5e133439f363bdf202d0c2aa45e8fafbaad0f`, Edge `union-pbx-agent` versão18 ativa. Union e Artvideo voltaram a reportar configuração aplicada sem erro. A prova vencida continua rejeitada; somente uma nova consulta autenticada é permitida no caminho específico de expiração.
- Painel técnico: migration `20261124125650_optimize_technician_permission_evaluation.sql` aplicada pelo CLI, após cópia das definições anteriores e dry-run limitado a esse arquivo. Uma publicação concorrente acrescentou duas migrations; a primeira tentativa foi bloqueada sem alteração e o histórico foi atualizado antes de repetir a conferência. Nenhum reparo/remoção de histórico foi executado.
- Preservados proprietário, grants, `STABLE`, `SECURITY DEFINER` existente e `search_path` vazio de ambas as funções. Guard de hash impede sobrescrever definições divergentes. Não muda filtros de atribuição/empresa ou campos retornados; mantém inclusive a diferença preexistente entre a lista live e a versão histórica do repositório que acrescentava `order_services_completed`.
- Fixture SQL descartável:616 comparações em22 cenários, com JSON ou SQLSTATE idênticos; helper real de atribuição, dependências inferiores sintéticas. Detalhe21→11 chamadas ao helper de acesso; lista com três tarefas34→9 verificações efetivas. Ver `supabase/tests/technician-permission-cache.md` para reprodução e limites.
- Amostra autenticada, somente leitura, no mesmo usuário/empresa/OS de produção: lista1797,919→276,075ms; detalhe402,466→210,252ms. Os dois hashes dos resultados antes/depois coincidiram. São amostras pontuais, com caches/carga variáveis, não benchmark controlado nem garantia de latência. IDs e dados pessoais não fazem parte deste relatório.
- Testes locais:51 regressões técnicas, qualidade8 e suíte `test:ci` completa passaram; os dois builds passaram. A integração com mudanças concorrentes recebeu teste focal adicional52/52 e nova compilação. A publicação HostGator deve ser confirmada no workflow final, separadamente da aplicação SQL/Edge.

## Limite da conclusão

Os timeouts simultâneos de API, Realtime, monitoramento e cron indicam um episódio amplo de indisponibilidade/lentidão. Não há métricas históricas suficientes de CPU/RAM/disco para atribuir a causa física. As correções acima reduzem consultas repetidas e melhoram a recuperação, mas não provam que um novo episódio amplo seja impossível.

Notificações: índices já atendem os filtros e JIT já estava desligado. Alternativas de materialização têm regressões medidas em caixas pequenas e não foram publicadas. Não aumentar timeouts/conexões ou remover verificações de acesso para mascarar esse custo.
