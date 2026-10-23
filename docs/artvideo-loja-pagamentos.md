# Pagamentos intercambiáveis — loja Artvideo

## Estado em 23/10/2026
O Mercado Pago Checkout Pro voltou a ser o provedor escolhido. GetPay/Getnet
continuam como possibilidades futuras. Carrinho, entrega, estoque e pedidos são
independentes do gateway.

## Implementação
- `artvideo-payment-providers.ts` possui o conector Checkout Pro (Preferences API).
- `artvideo-store-checkout` confirma valores no servidor, reserva estoque e
  gera preferência com itens, frete, external_reference, back_urls e webhook.
- `artvideo-store-webhook` autentica HMAC e busca o pagamento via API privada.
  Só então valida recebedor, ambiente, moeda e total e concilia no SQL.
- Cada pedido registra o ambiente (sandbox/production); pedidos antigos
  sem ambiente registrado são tratados como produção.
- Nenhum status de URL de retorno vale como confirmação de pagamento.
- `integration_ready=false` mantém produção bloqueada. O sandbox pode ser habilitado
  manualmente no painel **após** cadastrar as credenciais de teste. Por padrão,
  `enabled=false` e nenhuma cobrança (mesmo simulada) é iniciada.

## Credenciais secretas (Supabase Edge)
Sandbox: `MERCADO_PAGO_TEST_ACCESS_TOKEN`, `MERCADO_PAGO_TEST_COLLECTOR_ID`,
`MERCADO_PAGO_TEST_WEBHOOK_SECRET`.
Produção: `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_COLLECTOR_ID`,
`MERCADO_PAGO_WEBHOOK_SECRET`.
Nunca colocar segredo no React, banco público ou GitHub.

Webhook de Pagamentos no Mercado Pago:
https://wmjmtcjpunmzvonlkjcu.supabase.co/functions/v1/artvideo-store-webhook

Antes de ativar produção: testar aprovado, recusado, pendente, Pix,
cartão, pedido com vários itens, frete/retirada, expiração, concorrência
por último item, duplicidade e atraso de webhook e conciliação no estoque.
Somente após homologação marcar `mercado_pago.integration_ready=true`
em migração auditada; depois ativar em Site → Pagamentos.

Docs oficiais:
https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/overview
https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications

## Laboratório isolado (23/10/2026)
- Edge Function `artvideo-store-payment-lab`: painel autenticado com permissão de edição do site.
- A validação consulta `GET /users/me` usando token secreto sem expô-lo ao navegador.
- O laboratório cria preferências fictícias de R$ 1,00 numa tabela privada para as credenciais de teste.
- O webhook assinado valida vendedor e valor e grava o resultado apenas em `artvideo_payment_test_runs`.
- Não altera pedidos, estoque, finanças ou relatórios da loja.
- Sandbox não pode ser ativado no checkout público. Use o laboratório; só produção homologada poderá liberar vendas.

## Conciliação de pagamentos de teste
A documentação do Mercado Pago informa que pagamentos criados com credenciais de teste
não enviam notificações automáticas Webhook. O botão Consultar resultado consulta,
com o Access Token de teste no servidor, `GET /v1/payments/search?external_reference=<test-id>`.
Antes de atualizar o status, valida o ID do pagamento, a referência exata, o vendedor,
a moeda BRL, o valor de R$ 1,00, `live_mode=false` e a data do teste.
A transação é registrada via `artvideo_payment_lab_settle_v1`, sem qualquer movimentação
de estoque/caixa. Webhooks de produção continuam exigindo assinatura HMAC.
Referência: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications

## Preparação segura de produção (23/10/2026)
- Edge Function `artvideo-store-payment-lab` também atende `production_diagnose` apenas a usuários autenticados com permissão `site_settings.update`.
- Somente leitura: compara `GET /users/me` da API com o `MERCADO_PAGO_COLLECTOR_ID`, verifica presença do Access Token e do segredo de produção; recusa token igual ao de testes. Nenhuma cobrança é criada.
- Os segredos reais `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_COLLECTOR_ID` e `MERCADO_PAGO_WEBHOOK_SECRET` ficam exclusivamente nas variáveis privadas do Supabase.
- `configurationValid=true` NÃO homologa webhook nem pagamento real. As verificações `webhookValidated` e `livePaymentValidated` permanecem falsas nesta fase.
- `integration_ready=false` e `enabled=false` permanecem inalterados; só ativar vendas após confirmação real da conciliação e do retorno do site.

## Diagnóstico de assinatura webhook de produção (23/10/2026)
- A tabela `public.artvideo_store_webhook_checks` tem RLS ativada, sem permissões para anon/authenticated; apenas service_role escreve/lê.
- Após validar HMAC da notificação de produção, o webhook grava evento mínimo (ambiente, tipo, recurso, data, indicador de simulação). Não armazena tokens, assinaturas ou payload bruto.
- Para simulação manual do painel do Mercado Pago, use evento `payment.updated` e o Data ID reservado `999999999999999`, que só retorna HTTP 200 se o HMAC for válido e o registro for persistido. Nenhum pagamento é criado/liquidado por este teste.
- O painel consulta apenas o último registro autenticado e diferencia simulado de evento real. `webhookValidated=true` significa apenas autenticação da mensagem; NÃO comprova liquidação nem autoriza `integration_ready=true`.
- O checkout público permanece desativado até homologação com transação real, incluindo estoque, pedido, confirmação e eventual estorno.

## Correção: simulação do webhook assinada em sandbox vs produção
- A simulação no painel pode informar `live_mode=false`, inclusive selecionando URL de produção. Isso não indica transação financeira real.
- Após validar HMAC, se o ID de simulação reservado `999999999999999` vier no evento `payment.updated` com `live_mode=false`, o servidor registra o ambiente cuja assinatura foi validada, devolve HTTP 200 e NÃO tenta consultar `/v1/payments/999999999999999`.
- O painel só considera assinatura de **produção** validada se houve evento autenticado pelo segredo de produção. Se somente a assinatura de sandbox foi verificada, mostra aviso, mantendo homologação de produção pendente.
- Outras notificações continuam passando pela verificação de pagamento na API e conciliação do pedido.

## Validação isolada com pagamento REAL de R$ 1,00
- Ambiente público continua DESATIVADO (`integration_ready=false`, `enabled=false`). O operador precisa executar `production_diagnose` e confirmar explicitamente a criação de um checkout de produção de R$ 1,00.
- Valor fixo, 1 link por 10 min e até 3 links por 24h/usuário. O link é gerado pela API de Preferences usando `MERCADO_PAGO_ACCESS_TOKEN`, `init_point` e `external_reference` com UUID único.
- `artvideo_payment_live_checks` é uma tabela privada com RLS e acesso exclusivo do service_role; não cria `artvideo_store_orders`, não baixa estoque nem lança pagamentos no financeiro.
- O webhook exige HMAC validado pela chave de produção e valida o pagamento pelo endpoint autenticado `GET /v1/payments/{id}`, incluindo ID, vendedor, BRL, valor exato, live_mode=true e external_reference. Só então atualiza a homologação com `webhook_received_at`.
- O botão Consultar resultado usa busca autenticada `GET /v1/payments/search` e fallback de merchant orders. A consulta não define `webhook_received_at`.
- O painel mantém histórico e permite reabrir link após atualizar. Mostra pagamento confirmado e webhook autenticado separadamente.
- Não há estorno automático, e o pagamento real pode sofrer taxas. Estornos devem ser avaliados pelo titular no painel Mercado Pago.
- Somente após confirmar pagamento real assinado, e um teste do checkout normal com pedido/estoque, deve-se estudar a ativação pública.

## IPN legado com conciliação autenticada (23/10/2026)
- Checkout Pro envia tanto Webhooks assinados (`data.id`, `type=payment`) quanto notificações IPN (`id`, `topic=payment`).
- O IPN é aceito apenas como **sinal**: o servidor consulta `GET /v1/payments/{id}` utilizando token de PRODUÇÃO e exige correspondência do ID, `collector_id`, `live_mode=true`, moeda BRL, referência UUID e valor contra um pedido ou teste real criado no servidor.
- Não confundir sinais: `legacy_notification_received_at` representa observação IPN + confirmação na API, enquanto `webhook_received_at` representa recebimento HMAC autenticado.
- A transação 185730654834 (teste real R$ 1,00) foi confirmada pela API e o IPN consta nos logs do Supabase às 16:39:10 UTC. Isso foi registrado historicamente, SEM afirmar assinatura HMAC ou liquidação automática na ocasião.
- O IPN é um meio legado em descontinuação. Os Webhooks com assinatura HMAC continuam necessários para a homologação final e são o método principal.
- A integração da loja pública continua desativada; o recebimento histórico do IPN não altera esse bloqueio.
