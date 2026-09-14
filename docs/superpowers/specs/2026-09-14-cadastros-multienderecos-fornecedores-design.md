# Cadastros Multiendereços e Fornecedores — Design

## Objetivo
Evoluir o módulo Cadastros para suportar vários endereços por cadastro, Inscrição Municipal em PJ e vínculo de fornecedores com itens do estoque, mantendo o sistema multiempresa por `organization_id` e a compatibilidade dos clientes legados.

## Regras de negócio
- Todo cadastro continua pertencendo a exatamente uma organização por registro em `entities.organization_id`.
- Um cadastro pode possuir vários endereços ativos em `entity_addresses`; no máximo um endereço ativo é principal.
- Para cadastros com vínculo Cliente, os endereços continuam sincronizados com `customer_addresses` para compatibilidade de OS e ficha do cliente.
- Pessoa Jurídica passa a possuir `state_registration` e `municipal_registration`.
- Um fornecedor pode ser vinculado a vários itens de `inventory_items`, e um item pode ter vários fornecedores.
- O vínculo fornecedor-item é sempre tenant-scoped: fornecedor e item precisam pertencer à mesma `organization_id`.
- Pesquisa de estoque no cadastro de fornecedor só retorna itens da organização ativa.

## UX do formulário
### Pessoa Física
- CPF e botão `Consultar` na mesma linha, reproduzindo o padrão do cadastro rápido da OS.
- Erro de CPF/cadastro existente aparece somente abaixo do campo de CPF.
- Nome completo em linha própria.
- Telefone + WhatsApp na mesma linha.
- Data de nascimento + E-mail na mesma linha.

### Pessoa Jurídica
- CNPJ e botão `Consultar` na mesma linha.
- Erro de CNPJ/cadastro existente aparece somente abaixo do campo de CNPJ.
- Inscrição Estadual + Inscrição Municipal na mesma linha.
- Telefone + WhatsApp na mesma linha.

### Endereços
- Editor em cards com `Adicionar endereço`.
- Cada endereço usa o componente atual `AddressFields`, mantendo busca de CEP e máscaras existentes.
- Pode marcar um endereço como Principal.
- Remover um endereço remove a configuração do cadastro; histórico de OS permanece preservado pelos snapshots da própria OS.

### Fornecedor
- Quando o vínculo Fornecedor estiver ativo, mostrar seção `Itens fornecidos`.
- Campo de pesquisa procura por nome ou SKU em `inventory_items` da empresa ativa.
- Selecionar item cria vínculo; pode haver vários vínculos.
- Itens já vinculados aparecem em lista e podem ser removidos.

## Detalhes do cadastro
Ordem das seções:
1. Informações
2. Endereços
3. Dados de funcionário / acesso, quando aplicável
4. Itens fornecidos, quando aplicável

Para PF, Informações deve exibir explicitamente `Nome completo`.

## Banco e segurança
- Adicionar `municipal_registration` em `entities` e `customers`.
- Criar `entity_supplier_items(organization_id, entity_id, inventory_item_id, created_at, created_by)` com unicidade por organização/fornecedor/item.
- Fortalecer integridade multiempresa com chaves compostas `(id, organization_id)` para `entities` e `inventory_items` e FKs compostas nos vínculos novos.
- RLS de `entity_supplier_items` usa permissões de Cadastros e sempre filtra por `organization_id`.
- Endereços permanecem em `entity_addresses`, com índice único parcial garantindo apenas um principal ativo por cadastro.
- RPCs novos são `SECURITY INVOKER`, `search_path=''`, sem execução por `anon`.

## Persistência
- `save_registration` continua responsável por entidade, vínculos de papel, funcionário e compatibilidade de cliente, e passa a persistir `municipal_registration`.
- `sync_registration_addresses` sincroniza todos os endereços do cadastro e espelha em `customer_addresses` quando houver vínculo Cliente.
- `sync_registration_supplier_items` sincroniza os itens fornecidos pelo fornecedor.
- O frontend salva cadastro-base primeiro e depois sincroniza endereços/itens, recarregando o cadastro no final.

## Multiempresa
Nenhuma consulta ou gravação nova será feita apenas por `id`. Toda operação também valida `organization_id`; vínculos cross-tenant são impedidos por FK composta/RLS. O mesmo CPF/CNPJ pode existir em organizações diferentes, mas permanece único dentro de cada organização.