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
