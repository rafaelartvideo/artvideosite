# Correções incrementais dos timeouts — 24/11/2026

**Objetivo:** recuperar sincronizações após lentidão e reduzir trabalho SQL comprovadamente repetido, sem ampliar limites, permissões ou tempo de espera.

Evidência inicial: 57014 em duas janelas, respostas API até92,7s, falhas cron de inicialização, Realtime e monitoramento também afetados. Postgres sem reinício desde11/11; snapshotposterior38/60conexões, sem espera porlocks. CPU/RAM/disco históricos não foram confirmados pelas ferramentas disponíveis; não atribuir causa física sem dados.

1. PABX: relatório rejeitado por prova expirada não deve impedir uma nova consulta integral autorizada. Manter assinatura, sequência, empresa, prazo e rejeição do relatório antigo. Teste reproduzido e revisão independente sem bloqueadores.
2. Painel técnico: usar as definições de produção como base; calcular cada permissão idêntica uma vez por chamada, mantendo filtros e campos. Executar SQL isolado e medir antes/depois.
3. Notificações: plano real mostra custo de políticas repetidas; índices relevantes já existem, JIT estádesligado. Não publicar alternativas que regressam caixas pequenas. Investigar alterações apenas com ganho mensurado e equivalência de acesso.
4. Validar cada lote, integrar na main, aplicar migração/função separadamente e verificar publicação/estado. Informar ao usuário cada ajuste efetivamentevalidado/implantado.

Sem aumento do plano ou limites de conexões, reinício do Asterisk, criação de chamadas reais, mudanças de RLS ou remoção de dados.
