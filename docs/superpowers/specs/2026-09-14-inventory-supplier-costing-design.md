# Estoque Robusto com Fornecedores e Custos — Design

## Objetivo

Evoluir o módulo de Estoque para um fluxo transacional, auditável e multiempresa, com vínculo entre itens e fornecedores, entradas com custo real, custo médio ponderado, último preço de compra, histórico financeiro e proteção contra exclusão física.

## Princípios

1. Todo saldo deve ser explicável pelo histórico de movimentações.
2. Nenhum item com histórico deve ser excluído fisicamente; usa-se inativação.
3. Movimento e atualização de saldo/custo devem ocorrer na mesma transação.
4. O histórico é imutável: fornecedor e valores da compra permanecem registrados mesmo se o fornecedor for inativado ou os preços futuros mudarem.
5. Toda operação é isolada por `organization_id`.
6. A relação fornecedor ↔ item usa `entity_supplier_items`; não será criada relação duplicada.

## Modelo de dados

### `inventory_items`

Manter os campos atuais e acrescentar/clarificar:

- `purchase_price`: passa a representar o **último preço de compra unitário-base**;
- `average_cost`: custo médio ponderado unitário-base atual;
- `last_supplier_entity_id`: fornecedor da última entrada, opcional, apenas para consulta rápida;
- `last_purchase_at`: data/hora da última entrada de compra;
- `quantity`: saldo base atual;
- `is_active`: único mecanismo operacional para retirar item de uso.

`purchase_price` e `average_cost` devem ser `numeric` não negativos quando informados.

### `inventory_movements`

Adicionar campos de snapshot para auditoria:

- `supplier_entity_id uuid null`;
- `unit_cost numeric null` — custo por unidade-base no momento da entrada;
- `input_unit_cost numeric null` — valor informado pelo usuário na unidade de entrada (`un`/`cx`);
- `total_cost numeric null`;
- `previous_quantity numeric not null`;
- `resulting_quantity numeric not null`;
- `average_cost_before numeric null`;
- `average_cost_after numeric null`;
- `purchase_reference text null` — NF, pedido, recibo ou referência livre;
- `notes text null` — observação complementar, separada do motivo principal se necessário.

O fornecedor deve referenciar `entities(id, organization_id)` por FK composta ou validação equivalente para impedir vínculo cross-tenant.

### Relação `entity_supplier_items`

Continuar como fonte única do vínculo fornecedor ↔ item. O mesmo vínculo deve ser manipulável por:

- `Cadastros > Fornecedor > Itens fornecidos`;
- `Estoque > Item > Fornecedores`.

Alterar em uma tela deve refletir imediatamente na outra.

## Entrada de estoque

Ao registrar `IN`:

Campos obrigatórios:

- quantidade;
- fornecedor ativo vinculado ao item;
- valor da compra por unidade de entrada.

Campos opcionais:

- referência/documento da compra;
- motivo/observação;
- OS relacionada apenas quando fizer sentido operacionalmente.

O sistema deve validar que:

- item está ativo;
- fornecedor tem papel `supplier` ativo;
- fornecedor e item pertencem à mesma organização;
- fornecedor está vinculado ao item em `entity_supplier_items`;
- quantidade > 0;
- custo >= 0.

### Conversão de caixa

Se o item estiver em `cx`, o usuário informa quantidade em caixas e custo por caixa. O backend converte para unidades-base usando `conversion_factor_snapshot` e grava os dois valores:

- valor informado por caixa em `input_unit_cost`;
- custo unitário-base em `unit_cost`.

Exemplo: 2 cx, 10 un/cx, R$ 300/cx → 20 un base, R$ 30/un base, total R$ 600.

## Custo médio ponderado

Para uma entrada de compra:

```text
novo_custo_medio =
  ((saldo_anterior * custo_medio_anterior) + (quantidade_entrada_base * custo_unitario_entrada))
  / saldo_resultante
```

Regras:

- se saldo anterior for 0, custo médio após entrada = custo unitário da entrada;
- saídas não alteram custo médio;
- ajustes comuns não recalculam custo médio automaticamente;
- uma entrada atualiza `purchase_price` com o último custo unitário-base, `average_cost`, `last_supplier_entity_id` e `last_purchase_at`.

## Saída de estoque

`OUT` deve:

- exigir quantidade > 0;
- impedir saldo negativo;
- registrar saldo anterior e posterior;
- não alterar custo médio;
- preservar vínculo com OS quando houver;
- não exigir fornecedor.

## Ajuste de estoque

`ADJUST` representa correção de saldo, não compra.

- quantidade informada é o saldo final desejado;
- justificativa obrigatória;
- registra saldo anterior e posterior;
- não exige fornecedor;
- não atualiza último preço de compra;
- não recalcula custo médio automaticamente.

Se futuramente for necessário ajustar valor/custo, deve existir operação específica de reavaliação, não reutilizar `ADJUST` silenciosamente.

## Saldo inicial

Novo item não deve nascer com saldo sem histórico.

Ao criar item:

- item é criado inicialmente com `quantity = 0`;
- se o usuário informar saldo inicial > 0, o sistema registra uma movimentação `IN` marcada como `initial_balance = true` ou com origem equivalente;
- se houver custo inicial, deve registrar custo e fornecedor quando conhecido;
- se não houver fornecedor para saldo legado, permitir origem `Saldo inicial` sem fornecedor apenas nessa situação especial;
- custo médio inicial deriva do custo informado.

## Operação transacional

Substituir o fluxo atual frontend `insert movement` + `update inventory_items` por um RPC único, por exemplo:

```sql
public.record_inventory_movement(
  p_organization_id uuid,
  p_inventory_item_id uuid,
  p_movement_type text,
  p_input_quantity numeric,
  p_supplier_entity_id uuid default null,
  p_input_unit_cost numeric default null,
  p_reason text default null,
  p_purchase_reference text default null,
  p_service_order_id uuid default null
)
```

O RPC deve:

1. validar `auth.uid()`;
2. validar `inventory.movements.create`;
3. bloquear o item `FOR UPDATE`;
4. validar organização e status do item;
5. validar fornecedor quando `IN` de compra;
6. converter quantidade/custo para unidade-base;
7. calcular saldo resultante e custo médio;
8. inserir `inventory_movements` com snapshots;
9. atualizar `inventory_items`;
10. concluir tudo na mesma transação.

Se qualquer etapa falhar, nada deve ser persistido.

## Proteção contra exclusão

### Itens

- remover botão Excluir da UI de Estoque;
- usar apenas Ativar/Inativar;
- alterar FK `inventory_movements.inventory_item_id` de `ON DELETE CASCADE` para `ON DELETE RESTRICT`/`NO ACTION`;
- preservar `entity_supplier_items` e histórico;
- manter exclusão física apenas como manutenção administrativa excepcional fora da UI normal, se realmente necessária.

### Movimentações

Movimentações registradas não devem ser excluídas nem editadas pelo fluxo comum. Correções são feitas por nova movimentação de ajuste/estorno documentada.

## Fornecedores no item

No cadastro/edição do item adicionar seção `Fornecedores`:

- listar fornecedores ativos vinculados;
- busca por nome/razão social/documento;
- vincular e remover vínculo;
- usar a mesma UI de seleção/paginação já padronizada no admin;
- não apagar fornecedor ao remover vínculo;
- fornecedor inativo continua aparecendo no histórico antigo, mas não pode ser escolhido em nova entrada.

## Histórico do item

Cada registro deve exibir, conforme permissão:

- tipo;
- quantidade informada e unidade;
- equivalente em unidade-base;
- saldo anterior;
- saldo posterior;
- fornecedor;
- custo informado;
- custo unitário-base;
- valor total da entrada;
- custo médio antes/depois;
- data/hora;
- usuário;
- motivo;
- referência de compra;
- OS relacionada.

Histórico de uso em resolução de OS continua integrado, mas deve ser apresentado como evento separado de consumo, sem duplicar alteração física de saldo se o fluxo existente já efetuou a baixa em outra etapa.

## Tela/listagem de Estoque

Adicionar, condicionados por permissão:

- último preço de compra;
- custo médio;
- último fornecedor;
- valor atual do item em estoque (`saldo_base * average_cost`);
- fornecedores vinculados nos detalhes.

Os cards/mobile e tabela desktop devem continuar responsivos.

## Indicadores e relatórios

Preparar consultas para:

- valor total do estoque por custo médio;
- itens abaixo do mínimo;
- itens zerados;
- compras por período;
- compras por fornecedor;
- última compra por item;
- variação de custo de compra.

Nesta etapa não haverá contas a pagar, pedido de compra ou conciliação fiscal; esses recursos pertencem a um futuro módulo `Compras`.

## Permissões

Manter as atuais e acrescentar granularidade quando necessário:

- `inventory.suppliers.view`;
- `inventory.suppliers.manage`;
- `inventory.costs.view`;
- `inventory.movements.view`;
- `inventory.movements.create`;
- `inventory.toggle_active`.

`inventory.delete` deixa de ser usado na UI comum.

Quem não possui `inventory.costs.view` não deve receber/visualizar valores sensíveis no frontend. Quando viável, usar RPC/view específica para evitar exposição desnecessária dos campos de custo.

## Segurança e multiempresa

- todas as FKs e consultas devem validar `organization_id`;
- fornecedor de outra empresa nunca pode ser associado a item ou movimento;
- RLS continua obrigatória nas tabelas públicas;
- RPC deve usar autorização explícita e `search_path` seguro;
- snapshots históricos permanecem legíveis mesmo após inativação do fornecedor.

## Migração de dados existentes

1. Adicionar novas colunas sem alterar histórico antigo.
2. Para movimentos legados, preencher `previous_quantity/resulting_quantity` somente quando reconstrução for segura; caso contrário manter snapshot como `null` se a coluna permitir legado ou identificar `legacy_record`.
3. Inicializar `average_cost` a partir de `purchase_price` quando houver saldo atual e preço existente, documentando que é custo inicial estimado para legado.
4. Não fabricar fornecedor para entradas antigas.
5. Trocar FK de movimentos para RESTRICT somente depois de validar inexistência de operações que dependam de cascade delete.

## Testes de aceitação

- entrada com fornecedor vinculado atualiza saldo, último preço e custo médio em uma única transação;
- fornecedor não vinculado é rejeitado;
- fornecedor de outra organização é rejeitado;
- fornecedor inativo não pode ser escolhido em nova entrada;
- falha no insert do movimento não altera saldo;
- falha na atualização do item não deixa movimento órfão;
- saída maior que saldo é rejeitada;
- saída não altera custo médio;
- ajuste exige justificativa e não altera último preço de compra;
- item com histórico não pode ser excluído;
- inativar item bloqueia novas movimentações manuais;
- histórico mostra fornecedor e custos antigos mesmo após fornecedor ser inativado;
- permissões escondem custos de usuários sem `inventory.costs.view`;
- nenhum tenant consegue ver ou vincular fornecedor/item de outro tenant.
