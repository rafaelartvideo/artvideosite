# Módulo Financeiro — Design

## Objetivo

Criar um módulo Financeiro completo, porém enxuto, integrado às Ordens de Serviço, Estoque, Cadastros e permissões já existentes, com foco em:

- Contas a Receber;
- Contas a Pagar;
- parcelamento;
- pagamentos/recebimentos parciais;
- múltiplas contas e caixas;
- transferências;
- aprovação financeira;
- categorias e centros de custo;
- rateio;
- recorrências;
- caixa físico opcional;
- documentos;
- cobranças;
- DRE simples por competência;
- Fluxo de Caixa por realizado;
- previsto x realizado;
- integrações transacionais com OS e Estoque.

O módulo não pretende ser um sistema contábil completo de partidas dobradas, nem fazer conciliação bancária automática nesta primeira versão.

## Princípios

1. Todo dinheiro que entra ou sai deve ser explicável por uma movimentação financeira.
2. Lançamentos aprovados e movimentações realizadas não são excluídos fisicamente; correções são feitas por cancelamento ou estorno.
3. O saldo de uma conta financeira é derivado das movimentações, não de um campo editável manualmente.
4. Contas a Pagar e Contas a Receber compartilham o mesmo núcleo de títulos, parcelas, baixas, rateios, documentos e histórico.
5. Aprovação e situação financeira são conceitos independentes.
6. OS e Estoque devem integrar com o Financeiro por operações transacionais e idempotentes.
7. Toda informação é isolada por `organization_id`.
8. A DRE usa competência; o Fluxo de Caixa usa movimentação/liquidação.
9. Transferência entre contas não é receita nem despesa.
10. A origem financeira deve permanecer rastreável mesmo depois de alterações futuras no cadastro relacionado.

## Navegação e estrutura de tela

### Menu lateral

O menu lateral terá apenas **um item principal** chamado `Financeiro`.

As demais áreas não aparecem como itens independentes no menu lateral. Elas serão **subseções internas do módulo Financeiro**, no mesmo padrão de navegação interna já usado em páginas com subseções/abas do admin, como as configurações de Documentos.

Subseções internas previstas:

1. `Visão geral`
2. `Contas a receber`
3. `Contas a pagar`
4. `Movimentações`
5. `Caixas e contas`
6. `Recorrências`
7. `Relatórios`
8. `Cadastros financeiros`

Dentro de `Cadastros financeiros` haverá subseções internas para:

- Categorias;
- Centros de custo;
- Formas de pagamento;
- Configurações financeiras.

No mobile, essa navegação deve continuar responsiva, sem criar um segundo menu lateral; usar o mesmo padrão responsivo de abas/subseções do admin.

### Detalhe de um lançamento

O detalhe de uma conta terá abas contextuais:

- `Resumo`;
- `Parcelas`;
- `Baixas`;
- `Rateio`;
- `Documentos`;
- `Histórico`;
- `Cobranças`, apenas para Contas a Receber.

## Arquitetura do domínio financeiro

A abordagem será um núcleo financeiro único, em vez de tabelas totalmente separadas para pagar e receber.

### `financial_entries`

Representa o título financeiro principal.

Campos conceituais principais:

- `id`;
- `organization_id`;
- `entry_type`: `payable` ou `receivable`;
- `description`;
- `competence_date`;
- `issue_date`;
- `original_amount`;
- `approval_status`;
- `required_approvals`;
- `approved_at`;
- `rejected_at`;
- `cancelled_at`;
- `reversed_at`;
- contraparte vinculada ao cadastro existente, quando houver;
- snapshots do nome/documento da contraparte para auditoria;
- `origin_type`: `service_order`, `inventory_purchase`, `manual`, `recurring` ou outra origem futura;
- observações;
- `created_by`;
- `created_at`;
- `updated_at`.

O valor original do título não deve ser sobrescrito por pagamentos parciais, juros, multa, desconto ou taxas.

### `financial_installments`

Representa as parcelas de cada título.

Campos principais:

- `financial_entry_id`;
- número da parcela;
- quantidade total de parcelas;
- vencimento;
- valor original;
- saldo em aberto derivado das baixas;
- status operacional derivado;
- data de liquidação integral, quando aplicável.

Uma conta de parcela única também terá uma linha nesta tabela.

### `financial_settlements`

Representa cada pagamento ou recebimento realizado contra uma parcela.

Permite múltiplas baixas na mesma parcela.

Deve registrar separadamente:

- valor de principal liquidado;
- juros;
- multa;
- desconto;
- outros acréscimos;
- valor bruto da baixa;
- taxa da forma de pagamento, quando houver;
- valor líquido esperado/real;
- forma de pagamento;
- conta financeira de origem/destino;
- data da baixa;
- usuário;
- observação;
- referência de estorno, quando aplicável.

### `financial_movements`

Livro operacional das movimentações reais ou previstas de dinheiro.

Tipos previstos:

- entrada;
- saída;
- transferência de saída;
- transferência de entrada;
- taxa;
- estorno;
- suprimento;
- sangria;
- ajuste controlado.

A linha original não é alterada para esconder correções. Estornos geram nova movimentação inversa vinculada à original.

Campos devem distinguir:

- `expected_at`: data prevista;
- `posted_at`: data efetivamente realizada;
- `movement_status`: `scheduled`, `posted`, `reversed`.

Movimentos `scheduled` participam do previsto, mas não compõem saldo disponível até serem efetivamente `posted`.

### `financial_accounts`

Representa onde o dinheiro fica.

Tipos iniciais:

- caixa físico;
- conta bancária;
- conta de recebimento/PIX;
- outra conta financeira interna.

Campos principais:

- nome;
- tipo;
- banco/dados descritivos opcionais;
- ativo/inativo;
- permite sessão de caixa;
- saldo inicial de implantação, registrado por movimento específico, nunca por alteração direta do saldo.

O saldo atual é calculado pelas movimentações `posted`.

### `financial_payment_methods`

Formas de pagamento configuráveis por empresa.

Exemplos:

- Dinheiro;
- PIX;
- Débito;
- Crédito;
- Boleto;
- Transferência.

Configurações:

- taxa percentual e/ou fixa;
- prazo padrão de liquidação;
- ativo/inativo;
- se exige conta financeira;
- se gera liquidação futura.

Para cartão, o título pode ser considerado recebido do cliente enquanto a movimentação bancária permanece prevista até a data de repasse.

Sem conciliação bancária automática nesta fase, o repasse previsto deve ser confirmado como realizado para compor o saldo real.

### `financial_categories`

Categorias financeiras configuráveis.

Cada categoria deve indicar natureza:

- receita;
- despesa.

Pode possuir agrupamento simples para DRE e categoria-pai opcional, sem implementar um plano de contas contábil completo.

### `financial_cost_centers`

Centros de custo configuráveis, por exemplo:

- Assistência Técnica;
- Loja;
- Administrativo.

Podem ser ativados/inativados sem alterar históricos anteriores.

### `financial_allocations`

Rateio do lançamento por categoria e centro de custo.

Deve aceitar:

- percentual; ou
- valor.

O backend deve garantir que o rateio válido feche exatamente em 100% ou no valor total do título, respeitando arredondamento monetário controlado.

### `financial_approvals`

Registra cada decisão de aprovação/rejeição.

Campos principais:

- lançamento;
- usuário;
- ação;
- ordem/nível da aprovação;
- observação;
- data/hora.

Nunca substituir o histórico de uma aprovação anterior.

### `financial_attachments`

Anexos podem pertencer a:

- lançamento principal; ou
- baixa específica.

Tipos usuais:

- nota fiscal;
- boleto;
- recibo;
- comprovante;
- outro.

Os arquivos ficam em bucket privado com acesso por organização e permissões financeiras.

### `financial_recurring_rules`

Define regras recorrentes:

- semanal;
- mensal;
- anual;
- personalizada.

A regra funciona como template. Cada ocorrência gerada cria um lançamento financeiro independente.

Alterar a recorrência só afeta ocorrências futuras ainda não geradas.

### `financial_transfers`

Vincula os dois lados de uma transferência:

- saída da conta origem;
- entrada na conta destino.

A soma líquida global da transferência é zero e não deve aparecer como receita ou despesa na DRE.

### `financial_cash_sessions`

Controle de abertura/fechamento do caixa físico, opcional por empresa.

Quando habilitado:

- abertura com saldo inicial;
- recebimentos/pagamentos durante a sessão;
- suprimentos;
- sangrias;
- saldo esperado;
- saldo contado;
- diferença;
- justificativa quando houver divergência;
- usuário e horários de abertura/fechamento.

Quando desabilitado, a conta Caixa funciona como uma conta financeira comum.

### `financial_collection_logs`

Histórico de cobrança de Contas a Receber.

Campos:

- lançamento/parcela;
- usuário;
- data/hora;
- canal de contato;
- observação;
- próximo retorno opcional.

### `financial_settings`

Configurações por empresa:

- limite monetário para exigir segunda aprovação em Contas a Pagar;
- uso de abertura/fechamento de caixa;
- conta padrão opcional por forma de pagamento;
- padrões de categoria/centro de custo para integrações;
- demais preferências financeiras necessárias ao módulo.

### `financial_source_links`

Mantém o vínculo formal entre um lançamento financeiro e sua origem.

Deve permitir identificar, no mínimo:

- OS;
- entrada/compra de estoque;
- recorrência;
- lançamento manual.

Para origens automáticas, deve existir restrição de unicidade suficiente para impedir geração duplicada para a mesma origem e finalidade.

### `financial_events`

Histórico imutável de eventos de negócio do Financeiro.

Exemplos:

- criado;
- submetido para aprovação;
- aprovado;
- rejeitado;
- parcela alterada antes da aprovação;
- baixa realizada;
- baixa parcial;
- estornado;
- cancelado;
- documento anexado;
- cobrança registrada.

## Estados

### Aprovação

`approval_status`:

- `draft`, quando aplicável;
- `pending`;
- `approved`;
- `rejected`;
- `cancelled`;
- `reversed`.

### Situação financeira

A situação financeira não deve reaproveitar `approval_status`.

Ela é derivada das parcelas e baixas:

- `open`;
- `partial`;
- `settled`;
- `overdue`;
- `cancelled`.

Na UI, isso será apresentado como:

- A vencer;
- Vencida;
- Parcialmente liquidada;
- Liquidada;
- Cancelada.

## Aprovação de Contas a Pagar

Todo Contas a Pagar, independentemente da origem, passa por aprovação.

Isso inclui:

- entrada de estoque;
- lançamento manual;
- ocorrência recorrente.

Regra por empresa:

- valor menor ou igual ao limite configurado: 1 aprovação;
- valor acima do limite: 2 aprovações.

O número de aprovações exigidas é gravado no lançamento no momento da submissão. Alterar o limite da empresa depois não muda títulos já submetidos.

Para lançamentos que exigem 2 aprovações:

- os aprovadores devem ser usuários diferentes;
- o mesmo usuário não pode fornecer as duas aprovações;
- o criador do lançamento não pode contar como segundo aprovador.

Ações de aprovação e rejeição exigem permissão específica e ficam auditadas.

## Aprovação de Contas a Receber

### Origem OS

Contas a Receber geradas pela conclusão da OS entram diretamente como `approved`.

Não existe segunda aprovação financeira depois da conclusão da OS.

### Origem manual

Todo Contas a Receber manual exige exatamente 1 aprovação antes de entrar oficialmente no previsto financeiro.

A aprovação fica registrada em `financial_approvals` e `financial_events`.

## Integração com Estoque

A entrada de compra no Estoque continua atualizando estoque e custo conforme o fluxo transacional já existente.

Ao registrar uma entrada com origem de compra, o usuário também informa, conforme aplicável:

- fornecedor;
- itens e quantidades;
- custos;
- desconto;
- frete;
- outros custos;
- documento/NF/referência;
- condição de pagamento;
- vencimentos/parcelas;
- anexos.

O Estoque **não gera uma Conta a Pagar já aprovada**.

Ele cria um **pré-lançamento financeiro pendente de aprovação**, já preenchido com as informações da compra.

Enquanto pendente:

- não compõe DRE oficial;
- não compõe Fluxo de Caixa previsto oficial;
- não altera saldo financeiro;
- aparece na fila de aprovação em `Financeiro > Contas a pagar`.

Quando aprovado conforme a regra da empresa, torna-se uma obrigação financeira válida.

Se rejeitado:

- o registro financeiro permanece com status `rejected`;
- o motivo é obrigatório;
- a entrada física de estoque não é apagada automaticamente;
- a UI evidencia que a compra de estoque está com pré-lançamento financeiro rejeitado, permitindo correção e nova submissão controlada.

A criação da movimentação de estoque e do pré-lançamento financeiro deve ocorrer de forma transacional ou por RPC orquestrador idempotente. Não pode existir compra de estoque confirmada sem o vínculo financeiro correspondente por falha parcial do sistema.

A integração deve aproveitar a infraestrutura existente de `record_inventory_movement`, sem duplicar regras de saldo/custo.

## Integração com conclusão da OS

Hoje a conclusão da OS já calcula serviço, peças, desconto e `final_total`. O novo fluxo amplia a operação financeira.

No modal `Concluir OS`, acrescentar a seção `Pagamento`.

Opções:

- `Receber agora`;
- `Receber parcialmente`;
- `Deixar em aberto`.

O usuário poderá combinar múltiplas formas de pagamento na mesma conclusão.

Exemplo:

```text
Valor final da OS: R$ 1.200
R$ 300 PIX agora
R$ 300 dinheiro agora
R$ 600 em 2 parcelas futuras
```

Resultado:

- um Contas a Receber vinculado à OS;
- parcelas correspondentes;
- baixas imediatas para o que foi recebido;
- movimentações reais para PIX/dinheiro;
- movimentações previstas de liquidação quando a forma exigir prazo, como cartão;
- saldo restante em aberto quando houver.

A conclusão da OS e a criação de todo o conjunto financeiro devem acontecer na **mesma transação de banco**.

Se o financeiro falhar, a OS não pode ficar concluída isoladamente.

A função/RPC oficial de conclusão deve ser evoluída em vez de executar inserts financeiros separados no frontend.

A origem financeira da OS deve ser idempotente para impedir duas contas a receber para a mesma conclusão.

## Pagamentos e recebimentos parciais

Uma parcela pode receber várias baixas.

Exemplo:

```text
Parcela original: R$ 1.000
Baixa 1: R$ 300
Saldo: R$ 700
Baixa 2: R$ 700
Saldo: R$ 0
```

Cada baixa registra seus próprios ajustes e documentos.

O sistema nunca deve substituir o valor original da parcela pelo valor restante.

## Juros, multa, desconto e acréscimos

Disponível tanto em Pagar quanto em Receber.

Ao efetuar a baixa, o usuário poderá informar:

- juros;
- multa;
- desconto;
- outros acréscimos.

A UI deve apresentar claramente:

```text
Valor principal
+ Juros
+ Multa
+ Outros acréscimos
- Desconto
= Valor da baixa
```

Todos os componentes permanecem armazenados separadamente para relatórios e auditoria.

## Formas de pagamento, taxas e liquidação

Formas de pagamento podem possuir taxa e prazo de liquidação.

PIX/dinheiro normalmente geram movimento realizado imediatamente.

Cartão pode:

1. liquidar a dívida do cliente no momento da venda;
2. registrar taxa;
3. gerar uma movimentação `scheduled` para a data prevista de repasse;
4. exigir confirmação posterior da liquidação real para entrar no saldo disponível.

O Financeiro deve mostrar bruto, taxa, líquido e previsão de recebimento.

Não haverá integração automática com adquirente/banco nesta primeira versão.

## Contas e transferências

Cada baixa deve apontar para uma conta financeira de origem/destino quando a forma exigir.

Transferência interna cria dois movimentos vinculados:

```text
Conta A: - R$ 5.000
Conta B: + R$ 5.000
```

Regras:

- operação atômica;
- mesma organização;
- contas diferentes;
- não altera DRE;
- aparece no histórico das duas contas;
- estorno da transferência deve reverter os dois lados.

## Caixa físico

O controle de sessão de caixa será configurável por empresa.

Quando ativo:

- não permitir dois caixas abertos conflitantes segundo a regra configurada para a conta;
- saldo inicial informado na abertura;
- movimentos em dinheiro vinculados à sessão;
- suprimento e sangria com motivo;
- fechamento com saldo esperado x contado;
- divergência exige justificativa;
- histórico preservado.

## Recorrências

Suportar:

- semanal;
- mensal;
- anual;
- periodicidade personalizada.

Cada ocorrência gerada é um novo lançamento.

Contas a Pagar recorrentes seguem o fluxo normal de aprovação.

Contas a Receber recorrentes manuais seguem a aprovação de Receber manual.

Recorrência não liquida, não aprova e não altera títulos passados automaticamente.

## Rateio

Um título pode ser dividido entre várias categorias e centros de custo.

Exemplo:

```text
Despesa: R$ 1.000
60% Assistência Técnica / Peças
40% Administrativo / Custos gerais
```

O rateio alimenta DRE e relatórios por centro de custo.

O backend deve rejeitar rateio incompleto ou excedente.

## Cancelamento e estorno

Não existe exclusão operacional de lançamento aprovado.

### Antes da aprovação

Rascunhos e pré-lançamentos podem ser cancelados preservando histórico.

### Depois da aprovação, sem baixa

Pode ser cancelado mediante permissão e motivo obrigatório.

### Depois de existir baixa/movimentação

Usar estorno.

O estorno:

- exige motivo;
- registra usuário/data;
- cria movimentação inversa;
- referencia a operação original;
- reabre o saldo da parcela quando aplicável;
- não apaga documentos nem histórico.

## Documentos

Permitir anexos no título e também em cada baixa.

A UI deve permitir classificar o arquivo e exibir:

- nome;
- tipo;
- usuário que anexou;
- data;
- vínculo com título ou baixa.

Permissões de visualização e gestão devem ser separadas.

## Cobranças e alertas

O dashboard e Contas a Receber devem identificar:

- vencendo hoje;
- vencendo nos próximos dias;
- vencido;
- parcialmente recebido;
- cobrança com retorno agendado.

O histórico de cobrança deve permitir registrar contato e próxima ação sem modificar o lançamento financeiro.

## Dashboard Financeiro

Cards principais:

- Saldo disponível;
- A receber;
- A pagar;
- Vencido a receber;
- Vencido a pagar;
- Resultado do período.

Áreas complementares:

- fluxo previsto x realizado;
- entradas x saídas;
- evolução de saldo;
- pendências de aprovação;
- vencimentos de hoje;
- próximos vencimentos;
- atrasados;
- retornos de cobrança.

Todos os cards respeitam permissões e organização ativa.

## DRE simples

A DRE usa `competence_date`.

Receitas e despesas aprovadas entram conforme competência e rateio.

Exemplo: uma OS concluída em setembro e recebida em outubro aparece como receita de setembro na DRE, mas como entrada de caixa em outubro no Fluxo de Caixa.

A DRE deve permitir filtros por:

- período;
- categoria;
- centro de custo;
- origem;
- empresa/organização ativa.

Não implementar contabilidade fiscal, balanço patrimonial ou partidas dobradas nesta fase.

## Fluxo de Caixa

Duas visões principais:

### Previsto

Considera:

- parcelas aprovadas ainda abertas;
- liquidações futuras previstas;
- recorrências apenas depois que a ocorrência foi efetivamente gerada.

### Realizado

Considera somente `financial_movements` efetivamente `posted`.

Filtros:

- período;
- conta financeira;
- categoria;
- centro de custo;
- origem;
- forma de pagamento.

## Permissões

Chaves previstas:

- `finance.view`;
- `finance.dashboard.view`;
- `finance.receivables.view`;
- `finance.receivables.create`;
- `finance.receivables.edit`;
- `finance.receivables.approve`;
- `finance.payables.view`;
- `finance.payables.create`;
- `finance.payables.edit`;
- `finance.payables.approve`;
- `finance.settlements.create`;
- `finance.settlements.reverse`;
- `finance.transfers.create`;
- `finance.accounts.view`;
- `finance.accounts.manage`;
- `finance.cash.open`;
- `finance.cash.close`;
- `finance.cash.supply`;
- `finance.cash.withdraw`;
- `finance.categories.manage`;
- `finance.cost_centers.manage`;
- `finance.payment_methods.manage`;
- `finance.recurring.view`;
- `finance.recurring.manage`;
- `finance.documents.view`;
- `finance.documents.manage`;
- `finance.collections.view`;
- `finance.collections.create`;
- `finance.reports.view`;
- `finance.reports.dre`;
- `finance.reports.cash_flow`;
- `finance.settings.manage`.

O item `Financeiro` deve aparecer no menu somente quando o módulo estiver habilitado e o usuário possuir acesso correspondente.

## Segurança e RLS

Todas as tabelas financeiras possuem `organization_id` e RLS.

Regras:

- nunca confiar em `organization_id` enviado pelo frontend sem validar associação do usuário;
- ações sensíveis usam RPCs transacionais com checagem de permissão;
- anexos usam bucket privado;
- aprovações e estornos não podem ser executados por `anon`;
- funções `SECURITY DEFINER`, quando necessárias, devem ter `search_path` fixo e permissões mínimas;
- vínculos entre tabelas devem validar que os registros pertencem à mesma organização;
- valores monetários usam `numeric`, nunca `float`.

## RPCs/operações transacionais

O desenho prevê RPCs específicas em vez de sequências frágeis no frontend.

Exemplos conceituais:

- criar/submeter lançamento;
- aprovar/rejeitar lançamento;
- registrar baixa parcial/total;
- estornar baixa;
- transferir entre contas;
- abrir/fechar caixa;
- gerar ocorrência recorrente;
- concluir OS com financeiro;
- registrar compra de estoque com pré-lançamento financeiro.

Cada RPC deve validar permissão, organização, estado atual e idempotência antes de escrever.

## Idempotência e concorrência

Operações automáticas vindas de OS e Estoque precisam ser idempotentes.

Regras mínimas:

- vínculo de origem com restrição única;
- lock `FOR UPDATE` em título/parcela ao aprovar, baixar ou estornar;
- impedir baixa superior ao saldo permitido;
- impedir duas aprovações simultâneas do mesmo usuário;
- impedir dupla conclusão financeira da mesma OS;
- impedir dois pré-lançamentos primários para a mesma compra de estoque;
- transferências e estornos devem ser atômicos.

## Histórico e snapshots

Dados que podem mudar futuramente devem ter snapshots suficientes para preservar o entendimento histórico, especialmente:

- nome/documento da contraparte;
- descrição da origem;
- forma de pagamento usada;
- taxa aplicada;
- regra de aprovação exigida;
- categoria/centro de custo usado no rateio;
- valores originais e ajustes.

Inativar um cadastro não altera o histórico financeiro.

## Migração e dados anteriores

A implantação inicial não deve criar automaticamente Contas a Receber para todas as OS históricas nem Contas a Pagar para compras antigas, pois isso poderia duplicar controles já feitos fora do sistema.

A integração automática passa a valer para novas operações realizadas após a ativação do Financeiro.

Histórico antigo pode ser incluído futuramente por importação controlada ou lançamento manual, sem inventar movimentações retroativas automaticamente.

## Estrutura frontend

Criar o domínio em `src/features/finance/`, mantendo a arquitetura atual por camadas:

- `domain/` — tipos, regras puras, cálculos monetários e estados;
- `application/` — workflows/casos de uso;
- `infrastructure/` — Supabase repositories/gateways;
- `presentation/` — módulo, subseções, tabelas, cards e modais.

Evitar concentrar todas as subseções em um componente único gigante.

Cada subseção deve ter responsabilidade clara e compartilhar componentes apenas quando a regra visual/comportamental for realmente comum.

## Tratamento de erros

Erros de negócio devem ser retornados com mensagens específicas, por exemplo:

- lançamento já aprovado;
- segunda aprovação deve ser de outro usuário;
- parcela já liquidada;
- valor excede saldo em aberto;
- conta financeira inativa;
- caixa obrigatório não está aberto;
- rateio não fecha 100%;
- origem financeira já processada;
- movimento já estornado.

O frontend deve exibir a mensagem real do backend e não mascarar falhas com erro genérico quando houver contexto disponível.

## Testes

### Domínio

Testar funções puras para:

- cálculo de saldo de parcela;
- juros/multa/desconto;
- rateio e arredondamento;
- quantidade de aprovações exigidas;
- classificação de vencido/a vencer/parcial/liquidado;
- bruto/taxa/líquido;
- previsto x realizado.

### Banco/RPC

Cobrir:

- isolamento por organização;
- aprovação simples e dupla;
- rejeição;
- concorrência de aprovação;
- baixa parcial;
- baixa integral;
- tentativa de baixa acima do saldo;
- estorno;
- transferência;
- geração idempotente por OS;
- geração idempotente por Estoque;
- atomicidade da conclusão da OS;
- atomicidade da entrada de estoque + pré-lançamento.

### UI

Cobrir os principais estados de permissão, vazio, loading, erro e responsividade das subseções.

## Implementação por etapas

### Etapa 1 — Fundação

- módulo/navegação Financeiro;
- permissões;
- tabelas base;
- RLS;
- contas financeiras;
- categorias;
- centros de custo;
- formas de pagamento;
- configurações.

### Etapa 2 — Títulos e parcelas

- Contas a Pagar;
- Contas a Receber;
- parcelas;
- detalhe do título;
- rateio;
- histórico básico.

### Etapa 3 — Aprovações

- fila de pendentes;
- limite configurável;
- uma ou duas aprovações;
- rejeição;
- auditoria.

### Etapa 4 — Movimentação financeira

- baixas parciais/totais;
- juros/multa/desconto;
- contas/caixas;
- transferências;
- estornos;
- saldos.

Ao fim desta etapa o Financeiro já funciona de forma independente.

### Etapa 5 — Integrações

- conclusão da OS -> Contas a Receber;
- entrada de estoque -> pré-lançamento Contas a Pagar;
- idempotência;
- transações atômicas.

### Etapa 6 — Operação avançada

- caixa físico;
- recorrências;
- documentos;
- cobranças;
- taxas e liquidações futuras.

### Etapa 7 — Gestão

- dashboard;
- DRE;
- Fluxo de Caixa;
- previsto x realizado;
- filtros e relatórios consolidados.

## Fora do escopo inicial

- conciliação bancária automática;
- integração OFX/Open Finance;
- emissão fiscal;
- contabilidade de partidas dobradas;
- balanço patrimonial;
- integração automática com adquirentes de cartão;
- importação automática de histórico anterior à ativação.

Esses pontos podem ser adicionados depois sem mudar o núcleo de títulos, parcelas e movimentações definido nesta especificação.
