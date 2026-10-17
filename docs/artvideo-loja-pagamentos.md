# Pagamentos intercambiáveis — loja Artvideo

## Decisão atual
A Artvideo **não utiliza Mercado Pago para novas compras**. Pagamentos online permanecem desativados até integrar e homologar um provedor.

A Getnet/Santander oferece modalidades diferentes:
- **GetPay (links):** pode exigir uma API e credenciais próprias para gerar um link exclusivo para cada pedido. Um link estático da maquininha **não** comprova uma compra da loja.
- **Get Checkout (e-commerce):** checkout Getnet para lojas online, com integração/credenciamento específicos.
- **Outro provedor:** futuro adaptador, sem alterar as regras de carrinho, entrega ou estoque.

Referências: https://docs.globalgetnet.com/pt/products/online-payments e https://site.getnet.com.br/getcheckout/

## Configuração pela Union World
Site → Pagamentos: escolha provedor, ambiente de homologação/produção e ativação quando homologada. O banco armazena somente seleção e status, nunca credenciais. A mudança de provedor desativa a cobrança até a nova integração estar habilitada. Históricos mantêm o provedor original.

- `artvideo_store_payment_providers`: registro de provedores e `integration_ready`; sem acesso de escrita para o CRM.
- `artvideo_store_payment_settings`: configuração atual, RLS e trigger de proteção.
- `artvideo_store_payment_status_v1()`: resposta pública segura (sem segredos), usada pelo checkout.
- `artvideo_store_orders.payment_provider`: provedor em cada pedido.
- `artvideo_store_register_checkout_v1()`: registra referência externa e estado aguardando pagamento.

## Backend independente de gateway
`supabase/functions/_shared/artvideo-payment-providers.ts` define o contrato `StorePaymentAdapter`, tipos de valores em centavos, URL de checkout autorizada e normalização de dados. Nenhum adaptador de produção está instalado ainda. `artvideo-store-checkout`:
1. Consulta o provedor ativo e exige adaptador local implementado; se ausente, retorna 503 **antes de reservar qualquer estoque**.
2. Revalida produtos, preço, CEP, frete, comprador e total no servidor.
3. Reserva o pedido por `artvideo_store_begin_multi_v1`, que associa o provedor atual ao pedido.
4. Passa os valores imutáveis do pedido ao adaptador, valida que o checkout retornado usa HTTPS e host permitido especificamente por aquele adaptador.
5. Registra a referência do checkout, gera o link privado de acompanhamento e redireciona.

## Requisitos de cada adaptador novo
- Obter habilitação comercial e credenciais de API específicas para pagamentos web, distintas do uso apenas nas maquininhas quando aplicável.
- Guardar credenciais no gerenciador privado de secrets do Supabase Edge; **nunca** expor segredo no React, site_settings ou tabelas acessíveis ao cliente.
- Implementar `createHostedCheckout` com chave de idempotência baseada no pedido, criação na API oficial, timeout, tratamento seguro de erros e allowlist HTTPS do provedor.
- Implementar endpoint de webhook próprio que verifica assinatura/identidade, consulta a transação diretamente na API autenticada, confere provedor associado ao pedido, moeda e valor antes de chamar a liquidação transacional. **Nunca** considerar o retorno do navegador como pagamento confirmado.
- Garantir que webhooks duplicados, atrasados, expiração e pagamentos aprovados após mudança de provedor sejam tratados pelo adaptador da transação original.
- Homologar em sandbox: pagamento aprovado/pendente/recusado/cancelado, retries, concorrência, indisponibilidade do gateway, divergência do total e baixa de estoque uma única vez.
- Somente então publicar o adaptador na Edge Function, e, por migração auditada de banco, marcar `integration_ready=true` no registro específico. O gestor poderá escolher o conector no CRM e ativar a operação.

## Legado e reembolsos
`artvideo-store-webhook` do Mercado Pago persiste somente para eventos autenticados de pedidos históricos `payment_provider='mercado_pago'`; não pode confirmar pedidos de outros provedores. Nenhum novo checkout usa Mercado Pago. Registros de reembolso aceitam GetPay/Getnet/outro sem efetuar o estorno no provedor. No checkout público, quando não houver provedor ativo, a revisão exibe mensagem clara e não permite continuar para cobrança.

## Itens ainda não realizados
- Contratação e habilitação do produto GetPay link de pagamento ou Get Checkout escolhido.
- Credenciais e API de sandbox da Getnet; documentação do produto habilitado na conta específica da Artvideo.
- Implementação real do adaptador, webhook de pagamentos e homologação ponta a ponta.
- Abertura da operação de cobranças reais somente após testes e aprovação explícita.
