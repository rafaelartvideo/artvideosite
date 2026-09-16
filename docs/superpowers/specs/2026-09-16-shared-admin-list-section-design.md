# Shared Admin List Section Design

## Goal

Padronizar as listas relacionais do admin usando exatamente o padrão visual de `Pedir peças > Estoque`, sem duplicar estrutura e CSS entre módulos.

## UI compartilhada

Criar `src/shared/ui/admin/AdminListSection.tsx` como componente genérico responsável por:

- container branco com borda arredondada;
- cabeçalho com título, descrição e contador;
- busca opcional com ícone;
- estados de loading, erro e vazio;
- área de linhas com divisórias internas;
- paginação opcional no rodapé;
- conteúdo de cada linha fornecido pelo consumidor para preservar os dados e ações específicas de cada módulo.

A referência visual e comportamental é a seção `Estoque` de `src/features/orders/presentation/PartRequestModal.tsx`.

## Consumidores

1. `Pedir peças > Estoque` passa a usar a UI compartilhada sem mudar comportamento de seleção, saldo, busca ou paginação.
2. `Cadastros > Novo/Editar > Fornecedor > Itens fornecidos` usa a mesma UI, com ação `Vincular/Remover`.
3. `Cadastros > Detalhes > Itens fornecidos` usa a mesma UI em modo de visualização e remoção quando houver callback.
4. `Estoque > Novo/Editar item > Fornecedores` usa a mesma UI, com ação `Vincular/Remover`.

## Regras visuais

- A busca ocupa toda a largura disponível da seção, como em `Pedir peças > Estoque`.
- Cabeçalho, espaçamentos, bordas e divisórias são definidos somente pelo componente compartilhado.
- Os consumidores não devem recriar a mesma casca visual localmente.
- A UI deve continuar responsiva e sem tabela horizontal no mobile.

## Limpeza

- Remover o `<style>` com `:has()` e o atributo `data-inventory-suppliers-section` usados como workaround em `InventorySuppliersEditor.tsx`.
- Remover a `Section title="Fornecedores"` externa de `TabInventoryV2.tsx`, deixando o componente compartilhado ser o único container visual desse bloco.
- Não alterar regras de negócio, persistência, permissões ou consultas.
