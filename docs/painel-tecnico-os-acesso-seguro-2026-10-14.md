# Painel do Técnico — OS real com acesso restrito (14/10/2026)

## Arquitetura aplicada
- As OS do painel são agrupadas por `service_order_id`; abrir uma OS usa `/admin/technician-panel/os/:orderId`, sem criar outra ordem.
- A OS técnica e a OS regular usam `OrderDetailSectionTabs` (abas **Detalhes da OS** / **Produtos e Serviços**) e as primitives `PageHeader`, `Section`, `AdminDialog`, `AdminStickyToolbar`, `AdminSelect`, `BtnPrimary` e `BtnSecondary`.
- Lista técnica existente: `list_my_technician_tasks_v1`, restringida a itens cujos responsáveis incluem o funcionário ativo. Câmera e seleção de imagem continuam enviando fotos privadas do serviço.
- Consulta detalhada **não** utiliza acesso direto a `service_orders` na aplicação: `get_my_technician_order_details_v1` devolve os campos filtrados, a situação, a lista de itens sem valores e os controles que o usuário pode executar.
- Funcionários com serviço atribuído só podem operar sua OS; uma atribuição de outro usuário ou empresa não dá acesso.
- As mutações não liberam `orders.edit` ou `orders.view_all`. RPCs para mudar situação e editar diagnóstico checam `technician_panel.view`, vínculo a um serviço e permissões específicas. As regras de situação por tipo, OS encerrada, checklists, status e trilha de auditoria continuam ativas.

## Permissões novas (além das 13 anteriores)
| Chave | Aba | Finalidade |
| --- | --- | --- |
| `technician_panel.data.situation` | Visualização | Situação atual da OS |
| `technician_panel.data.order_items` | Visualização | Produtos e serviços sem preços |
| `technician_panel.data.internal_notes` | Visualização | Observações internas |
| `technician_panel.actions.change_situation` | Ações | Mudar situação da OS atribuída |
| `technician_panel.actions.edit_diagnosis` | Ações | Editar diagnóstico da OS atribuída |

Total: **18 permissões** (1 de acesso, 12 de campos/dados e 5 de ações). As duas novas ações de edição **não** foram concedidas automaticamente ao cargo Técnico. O Gestor pode concedê-las pelas funções e permissões. Dependências visuais são aplicadas no editor de checkboxes.

## Dados comerciais e segurança
A consulta técnica `get_my_technician_order_details_v1` não devolve preço unitário, totais, desconto, custo ou pagamento, mesmo ao habilitar a listagem de itens. Uma futura permissão de valores exigirá RPC específica e análise de RLS/Storage.

## Testes e confirmação
- Migração `20261014190000_technician_order_secure_details_actions.sql` aplicada diretamente ao banco CRM `wmjmtcjpunmzvonlkjcu`.
- Confirmadas as três RPCs públicas e o helper privado; `anon` não possui EXECUTE nas três RPCs públicas.
- Teste transacional sem alterações permanentes com sessão simulada de `authenticated`: **OS atribuída: acesso verdadeiro; OS não atribuída: falso; dados financeiros brutos no resultado: ausentes**.
- Os novos controles aparecem no catálogo em quatro empresas (18 chaves cada). Gestor tem 2 permissões novas de edição, Técnico 0 por padrão.
- Contratos estáticos executados sobre arquivos atuais: abas compartilhadas, fluxo de atribuição, sem `service_orders` direto no frontend, RPCs e ausência de valores comerciais. A suíte `technician-workspace-regression.test.mjs` está incluída em `test:regressions`.
- **Build e execução de integração no navegador ainda não verificados**; statuses da última revisão no GitHub não exibiram check de CI.

## Pendências deliberadas
- Operações com impacto comercial (adicionar/remover produto ou serviço, editar preços/descontos), edição geral da OS, documentos/impressão e assinaturas precisam de RPCs e checkboxes separados e testes por função.
- Histórico e documentos completos também precisam de leitura com sanitização por função. Não reutilizar endpoints gerais sem examinar RLS e dados financeiros.
- Testar mobile, câmera, GPS, validação de situação por fluxo, suspensão e revogação de atribuição após o deploy.

Este relatório não certifica a segurança integral de todas as OS; é o escopo da etapa incremental.
