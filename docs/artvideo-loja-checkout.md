# Loja própria da Artvideo — preparação para pagamentos

Implementação exclusiva do site público da Eletrônica Artvideo. **Não é marketplace da Union.**

## Publicação com segurança

1. No projeto Supabase do CRM (não o da Fila), execute **na ordem** no SQL Editor:
   - `supabase/migrations/20261016151500_artvideo_public_product_storefront.sql`
   - `supabase/migrations/20261016152500_artvideo_store_checkout_orders.sql`
2. Publique as três Edge Functions no mesmo projeto:
   - `artvideo-store-shipping`
   - `artvideo-store-checkout`
   - `artvideo-store-webhook`
   Configure `verify_jwt=false`, como em `supabase/config.toml`. Cada função valida suas entradas, e o webhook valida a assinatura.
3. Configure os **Secrets das Edge Functions** (nunca no React, repositório, print ou chat):
   - `MERCADO_PAGO_ACCESS_TOKEN`: token privado do vendedor Artvideo.
   - `MERCADO_PAGO_COLLECTOR_ID`: identificação da conta recebedora para verificar webhooks.
   - `MERCADO_PAGO_WEBHOOK_SECRET`: segredo da assinatura configurado no painel Mercado Pago.
   - `MELHOR_ENVIO_TOKEN`: token da conta que fará a cotação de transportadoras.
   - `ARTVIDEO_SHIPPING_ORIGIN_CEP`: CEP de origem do estoque com 8 dígitos.
   - `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`: fornecidos pelo ambiente Supabase; nunca expor publicamente.
4. No painel Mercado Pago, habilite o webhook do evento **payment**:
   `https://<PROJECT_REF>.supabase.co/functions/v1/artvideo-store-webhook`.
5. Teste em homologação com pedidos reais de baixo valor (ou ambiente de testes do provedor) e **não ative vendas públicas** antes de validar:
   - várias compras simultâneas para o último item em estoque;
   - troca de frete e preço enquanto a página está aberta;
   - pagamentos aprovados, rejeitados, pendentes, expirados;
   - webhook duplicado/reentregue e recibos;
   - divergência de pagamento e reconciliação manual;
   - movimento de estoque e relatórios de caixa/finanças;
   - cotação do Melhor Envio com itens volumosos e prazos.

## Regras de integração

- Preços, quantidade disponível e cotações são recalculados no servidor.
- Pedido reserva saldo disponível por até 20 min. O estoque físico só é baixado com pagamento confirmado no Mercado Pago.
- A baixa e o registro de movimento de estoque ocorrem na mesma transação SQL.
- Se um pagamento for confirmado quando não há estoque, ou o valor não conferir, ele ficará em `manual_review`; a equipe deverá analisar e **reembolsar quando necessário**. Não deve ser tratado como venda finalizada.
- Não existe integração automática com emissão de nota fiscal, escolha de etiqueta ou contratação da postagem: essas etapas exigem implementação e testes específicos.
- Avaliações exigem pedido pago, e-mail correspondente e aprovação. Não é correto preencher notas iniciais artificialmente.
- O segredo do gateway deve pertencer à **conta de vendas da Artvideo**, não à conta intermediadora do marketplace.

## Estado da implantação

Código pronto para homologação e revisão. A presença dos arquivos no repositório **não aplica migrações**, **não publica Edge Functions** nem **habilita transações reais**. Não anuncie que o checkout está ativo antes da configuração e dos testes de ponta a ponta.
