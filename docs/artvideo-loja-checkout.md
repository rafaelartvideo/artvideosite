# Loja própria da Artvideo — preparação para pagamentos

Implementação exclusiva do site público da Eletrônica Artvideo. **Não é marketplace da Union.**

## Publicação com segurança

1. No projeto Supabase do CRM (não o da Fila), execute **na ordem** no SQL Editor (migrações abaixo já aplicadas no ambiente atual):
   - `supabase/migrations/20261016151500_artvideo_public_product_storefront.sql`
   - `supabase/migrations/20261016152500_artvideo_store_checkout_orders.sql`
   - `supabase/migrations/20261016172000_artvideo_shipping_postal_zones.sql`
2. Publique as três Edge Functions no mesmo projeto (implantadas no projeto atual, mas dependem de configuração privada):
   - `artvideo-store-shipping`
   - `artvideo-store-checkout`
   - `artvideo-store-webhook`
   Configure `verify_jwt=false`, como em `supabase/config.toml`. Cada função valida suas entradas, e o webhook valida a assinatura.
3. Configure os **Secrets das Edge Functions** (nunca no React, repositório, print ou chat):
   - `MERCADO_PAGO_ACCESS_TOKEN`: token privado do vendedor Artvideo.
   - `MERCADO_PAGO_COLLECTOR_ID`: identificação da conta recebedora para verificar webhooks.
   - `MERCADO_PAGO_WEBHOOK_SECRET`: segredo da assinatura configurado no painel Mercado Pago.
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
   - cotação pela tabela própria: CEP único, faixa, sobreposição e CEP não atendido.

## Regras de integração

- Preços, quantidade disponível e frete por CEP são recalculados no servidor.
- Regras de frete são cadastradas em **Configurações do Site → Entrega local · CEPs e valores**.
- Regras podem abranger um CEP único ou intervalo numérico inclusivo. O menor intervalo que contém o CEP prevalece.
- Valor zero corresponde a frete grátis. O preço é por pedido, não por peso/dimensão.
- CEPs sem regra ativa não são atendidos; nenhum CEP é liberado automaticamente.
- Não é usado Melhor Envio nem peso e dimensões para tarifação regional.
- ViaCEP é utilizado apenas como preenchimento opcional de endereço do comprador, sem calcular entrega.
- Pedido reserva saldo disponível por até 20 min. O estoque físico só é baixado com pagamento confirmado no Mercado Pago.
- A baixa e o registro de movimento de estoque ocorrem na mesma transação SQL.
- Se um pagamento for confirmado quando não há estoque, ou o valor não conferir, ele ficará em `manual_review`; a equipe deverá analisar e **reembolsar quando necessário**. Não deve ser tratado como venda finalizada.
- A Artvideo realiza a própria entrega local. Logística, impressão de etiquetas, emissão de NF e comprovantes de entrega ainda exigem implementação e testes específicos.
- Avaliações exigem pedido pago, e-mail correspondente e aprovação. Não é correto preencher notas iniciais artificialmente.
- O segredo do gateway deve pertencer à **conta de vendas da Artvideo**, não à conta intermediadora do marketplace.

## Estado da implantação

Código pronto para homologação e revisão. A presença dos arquivos no repositório **não aplica migrações**, **não publica Edge Functions** nem **habilita transações reais**. Não anuncie que o checkout está ativo antes da configuração e dos testes de ponta a ponta.

## Auditoria de homologação do checkout (23/10/2026)
- O checkout público permanece desativado. A função server-side valida itens, preços, CEP, frete e total antes de chamar a reserva de estoque.
- Teste transacional no Supabase com `BEGIN ... ROLLBACK` em dois produtos do catálogo: preço R$ 50 + R$ 27, frete R$ 0, criação do pedido/itens, tracking, preferência simulada, confirmação `approved` e duas baixas. Notificação repetida com o mesmo ID não duplicou movimentos; estorno colocou o pedido em `manual_review` e não restocou automaticamente. Todas as alterações do teste foram revertidas.
- O token de acompanhamento agora é gerado **antes** de criar a preferência hospedada, para reduzir pedidos cobrados sem retorno de acompanhamento.
- Novos campos `payment_issue_status` e `payment_issue_at` registram `refunded`/`charged_back`; tanto a rotina multi-itens quanto a antiga (um item) preservam histórico, mantêm movimentações e colocam a venda em revisão humana. A equipe e o cliente recebem identificação de estorno ou contestação no acompanhamento.
- Este teste simula a conciliação SQL, mas não comprova uma compra real no fluxo do site. Para liberar produção, ainda testar ponta a ponta em ambiente controlado, incluindo frete, carrinho, retorno, autorização, webhook assinado, estoques, e estorno operacional.

## Convite privado para teste de compra completa (23/10/2026)
- Painel Union World → Site → Pagamentos → Teste completo da loja → Gerar convite de homologação, protegido por sessão autenticada e permissão `site_settings.update`.
- Token criptograficamente aleatório de 256 bits, enviado somente no fragmento `#homologacao=`; o site o armazena em `sessionStorage` após limpar o fragmento. No banco fica somente SHA-256 do token.
- Convites expiram após duas horas, limitados a três por usuário em 24 horas, e somente um convite não usado por usuário permanece ativo.
- O site não permite pagamento público: `artvideo_store_payment_status_v1` permanece `available=false`; apenas o checkout com convite válido, confirmado por RPC service_role, pode iniciar uma compra REAL de produção.
- A função `artvideo_store_begin_homologation_multi_v1` consome o convite com `FOR UPDATE`, define contexto local exclusivamente na transação e cria o pedido usando a rotina de reserva existente. O gatilho permite Mercado Pago produção somente enquanto esse contexto de convite válido está em andamento.
- Os preços e frete continuam recalculados no backend. Depois de consumir o convite, uma tentativa de reutilizá-lo é recusada.
- Não é sandbox: um pagamento aprovado cria um pedido real e baixa estoque real. Orientar o operador a usar outro comprador e não a conta vendedora.
- Permanece pendente a inspeção humana da compra fim a fim, no CRM e site, antes de ativar pagamentos para todos.

## Etapa experimental: Checkout Bricks incorporado ao wizard (23/10/2026)
- Checkout Pro homologado permanece intacto. Novo Payment Brick usa SDK oficial `https://sdk.mercadopago.com/js/v2` e uma quarta etapa do wizard: identificação → entrega → revisão → pagamento.
- Durante esta primeira homologação, **somente convites privados e de uso único** gerados no painel podem iniciar o Brick. A simples ativação de vendas públicas NÃO habilita o Brick para visitantes; eles seguem Checkout Pro até aprovarmos a integração.
- Configuração: Union World → Site → Pagamentos → *Public Key · Pagamento dentro do site*. Copiar a `APP_USR-...` da mesma aplicação Mercado Pago utilizada pelo token de produção; clicar Salvar. NÃO colocar o Access Token nesse campo.
- `artvideo-store-checkout`: `bricks_status` indica somente prontidão e `bricks_prepare` reutiliza validação autoritativa dos produtos, preços, estoque, prazo e frete para reservar pedido, gerar token de acompanhamento e registrar referência `bricks:<uuid>` sem criar preferência externa. Convite é consumido pela rotina transacional já existente.
- `artvideo-store-bricks-payment`: recebe apenas o token criptografado de cartão e formulário do SDK; autentica o pedido com o token privado de acompanhamento, consulta preço no banco, usa credencial privada de produção, chave de idempotência determinada pelo pedido e consulta `GET /v1/payments/{id}` para validar vendedor, `live_mode`, referência UUID, moeda BRL e valor antes de conciliar. Dados completos do cartão nunca transitam pelo servidor.
- Meios disponíveis na etapa experimental: **Pix e cartão**. Boleto continua acessível pelo Checkout Pro. Para Pix pendente, exibe QR Code/copia-e-cola e botão "Atualizar situação". Acompanhar pedido continua disponível. Pagamento aprovado baixa o estoque uma única vez, pagamentos pendentes não baixam.
- Nova tabela `artvideo_store_brick_payment_attempts`: uma tentativa idempotente por pedido, acesso exclusivo `service_role`, RLS sem políticas públicas. SQL de criação e integração mantidos em migrações versionadas.
- Testado: criação de pedido restrito via RPC, registro do checkout, token seguro de acompanhamento, apenas uma tentativa por pedido, não reutilização do convite, `ROLLBACK` integral. Teste não realizou cobrança real. Próxima homologação: inserir Public Key, gerar novo convite, usar comprador distinto da conta recebedora, fazer pagamento controlado e verificar HMAC/estoque/QR antes de habilitar checkout incorporado publicamente.
- O formulário requer cartão/CPF ou CNPJ para os respectivos métodos. Não armazenar dados sensíveis no CRM nem registrar payloads tokenizados em logs.
