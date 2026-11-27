# Union World — teste de carga isolado (somente leitura)

## Objetivo e limites

Ferramenta para testar latência HTTP p50/p95/p99, taxa de erros (incluindo 402/429/5xx), timeouts, RPS e requisições efetivamente concorrentes. **Não identifica todos os defeitos do CRM** e não executa operações de escrita, telefonia, WhatsApp nem transações financeiras.

Nenhuma execução deve tocar `unionworld.com.br` ou o Supabase de produção. O script rejeita esses hosts e exige autorização explícita para ambiente isolado. Mesmo com 1.000 *workers*, o número de requisições simultâneas pode ser muito menor devido ao limite de requisições/segundo; o relatório fornece `peak_in_flight`. Todos os workers compartilham um token: não representam 1.000 operadores distintos nem testam a autenticação de 1.000 sessões.

## Teste inicial, totalmente offline

```bash
LOAD_TEST_USERS=1000 LOAD_TEST_RPS=100 LOAD_TEST_SECONDS=3 \
LOAD_TEST_OUTPUT=load-test-selftest.json \
node scripts/performance/staging-readonly-load.mjs
```

Se `LOAD_TEST_TARGET` estiver vazio, o script sobe um pequeno mock HTTP em `127.0.0.1`. Ele insere um erro 503 sintético a cada 101 respostas e uma resposta lenta a cada 59 respostas. **Resultados desse modo são somente validação do instrumento, jamais desempenho real do Union World.**

## Como executar em staging isolado

É necessário criar um ambiente separado com dados, contas, Auth, banco, Edge Functions e integrações de teste, comprovadamente desconectado do ambiente real. Uma cópia do frontend que aponte para o Supabase de produção **não é isolamento**.

Exemplo de `staging-scenarios.json` (verificar assinatura e parâmetros no ambiente de staging):

```json
[
  {"name":"permissoes","method":"POST","path":"/rest/v1/rpc/my_organization_permissions","body":{},"weight":1}
]
```

```bash
LOAD_TEST_TARGET=https://staging.example.test/ \
LOAD_TEST_ALLOWED_HOST=staging.example.test \
LOAD_TEST_STAGING_APPROVED=SIM LOAD_TEST_DATA_ISOLATED=SIM \
LOAD_TEST_SCENARIOS_FILE=staging-scenarios.json \
LOAD_TEST_AUTH_TOKEN="$STAGING_USER_JWT" \
LOAD_TEST_ANON_KEY="$STAGING_ANON_KEY" \
LOAD_TEST_USERS=10 LOAD_TEST_RPS=10 LOAD_TEST_SECONDS=30 \
LOAD_TEST_OUTPUT=staging-10.json \
node scripts/performance/staging-readonly-load.mjs
```

A origem remota deve ser HTTPS, hostname `staging.`, `homolog.`, `qa.`, `test.` ou `sandbox.`, estar na allowlist exata e ser confirmada com ambas as variáveis `SIM`. São permitidas apenas RPCs explicitamente listadas no código como de leitura. Não versionar JWT ou chaves.

## Progressão e critério de interrupção

- Aumentar as fases para 10, 50, 100, 250, 500 e 1.000 workers **somente se cada fase continuar estável no ambiente isolado**.
- Limites rígidos por execução: até 100 requisições por segundo, 1.000 workers, 5 minutos e 10 mil requisições por padrão. Cada chamada expira em até 6 segundos por padrão.
- Um erro HTTP 402 interrompe; a taxa de falhas acima de 5% após pelo menos 100 requisições programadas interrompe; também revisar 429/503/504.
- Verificar no **staging** CPU, conexões, filas, lock waits, memória, WAL, egress, I/O, tempos por RPC e regressões de autorização/RLS com telemetria leve.
- A taxa em requisições/segundo e o pico de requisições simultâneas são **métricas diferentes**.
- Testes com 1.000 identidades distintas, cargas de escrita, WebSocket/Realtimes, WuzAPI e PABX exigem outra suíte, contas e serviços sintéticos, e isolamento adicional.

O relatório não inclui corpos de resposta, tokens ou parâmetros individuais e não faz upload automático. Compare p50/p95/p99, RPS, erros e `peak_in_flight` entre fases equivalentes. Tempos são de HTTP completo, não de renderização React, SQL isolado ou jornada de usuário.
