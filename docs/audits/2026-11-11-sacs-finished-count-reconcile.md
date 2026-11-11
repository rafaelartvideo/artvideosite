# Union World — Reconciliação da contagem de protocolos finalizados (11/11/2026)

## Motivo
A caixa da SAC Digital já mantém no máximo 1000 protocolos ativos e 400 finalizados, mas a função `loadProtocols` efetuava um novo `COUNT(*)` de todos os protocolos finalizados em cada refresh iniciado por mensagens, protocolo, retorno de tela ou ações do operador. A maioria desses eventos não muda o total de finalizados.

## Mudança conservadora
- O `COUNT(*)` exato continua usando a mesma API e **a mesma RLS**: sem funções SQL novas ou privilégios.
- Uma sessão de tela reutiliza o último total por até 30 segundos, com escopo **empresa + usuário** e somente memória.
- Operações com `fresh=true` (ações explícitas) ignoram o cache e atualizam o número imediatamente.
- Listagem, mensagens, estados do protocolo e notificações continuam seguindo os respectivos fluxos Realtime, sem atraso programado.
- A promessa é reduzir o número de consultas extras de contagem sob rajadas; **não há evidência de ganho em velocidade de login, Disk IO Budget ou volume total de Egress ainda**.

## Validação
Node tests verificam expiração, bypass de ações explícitas, isolamento de usuário e escopo e a consulta com RLS em `sac_digital_protocols`. Medir chamadas reais em períodos comparáveis para confirmar redução. Não retirar cron, index ou dados antes de backup e migração da SAC.
