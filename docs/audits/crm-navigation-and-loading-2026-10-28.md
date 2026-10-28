# Auditoria de transições e carregamento do CRM
**Data:** 28/10/2026 · **Repositório:** `rafaelartvideo/artvideosite`

## Objetivo
Evitar flashes, tremores e conteúdo parcial na navegação, preservando carregamentos úteis e evitando sumir com a tela toda em filtros e atualizações.

## Correções compartilhadas — alcance transversal
1. `src/app/Admin.tsx`: 44 rotas declaradas no arquivo de rotas reutilizam um único fallback `PageLoadingState`, com spinner circular azul e identificação do módulo, enquanto seu bundle `React.lazy` carrega.
2. `src/shared/ui/admin/AdminFeedback.tsx`: `PageLoadingState` e `useAdminInitialLoading`; o hook controla o carregamento inicial por escopo. Refetches posteriores não cobrem novamente a página inteira.
3. `src/shared/ui/primitives/alert-dialog.tsx`: confirmações sem zoom, duração curta de opacidade.
4. `src/features/admin-shell/presentation/AdminNavigation.tsx`: remove `transition-all` dos itens do menu e cartões, mantendo hover sem deslocamento.
5. Correções **anteriores preservadas** em `src/shared/ui/admin/AdminLayout.tsx`, `src/shared/ui/primitives/dialog.tsx`, `src/styles/index.css`: páginas em fade, sem slide; modais sem zoom e animação de tamanho; CSS estático; scroll sincronizado antes de pintar.

## Módulos/páginas efetivamente modificados no carregamento de dados
| Módulo / página | Arquivo modificado | Comportamento |
| --- | --- | --- |
| Início | `src/features/admin-home/presentation/AdminHomePage.tsx` | Aguarda avisos, atividade do usuário e tarefas habilitadas |
| Dashboard | `src/features/dashboard/presentation/TabDashboard.tsx` | Aguarda o módulo de indicadores inicial, inclusive painel de OS |
| Ordens de Serviço — lista | `src/features/orders/presentation/OrdersListWorkspace.tsx` | Aguarda lista de OS e referências da primeira consulta |
| Nova OS e detalhes da OS | `src/features/orders/presentation/TabOrders.tsx` | Mostra carregamento antes do editor e durante resolução de rota de detalhes |
| Cadastros (lista e ficha) | `src/features/registrations/presentation/TabRegistrations.tsx` | Aguarda consulta inicial e ficha roteada |
| Estoque/Produtos | `src/features/products/presentation/TabProducts.tsx` | Aguarda catálogo de produtos, categorias e marcas |
| Serviços | `src/features/services/presentation/TabServices.tsx` | Aguarda catálogo de serviços |
| Orçamentos | `src/features/quotes/presentation/TabQuotes.tsx` | Aguarda lista de orçamentos e situações |
| Equipamentos | `src/features/equipment/presentation/EquipmentAdminPanel.tsx` | Aguarda catálogo de equipamentos |
| Agenda | `src/features/appointments/presentation/TabAgenda.tsx` | Aguarda agenda inicial sem bloquear trocas futuras de período |
| Pedidos avulsos | `src/features/customer-requests/presentation/TabCustomerRequests.tsx` | Aguarda pedidos e total |
| Tarefas e compromissos | `src/features/work-items/presentation/TabWorkItems.tsx` | Aguarda tarefas e lista de funcionários |
| Financeiro — Resumo | `src/features/finance/presentation/FinanceOverviewFoundation.tsx` | Aguarda resumo financeiro inicial; gráficos podem usar loaders locais |
| PDV — inicialização | `src/features/pdv/presentation/TabPdv.tsx` | Aguarda informações essenciais do PDV |
| WhatsApp — inicialização | `src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx` | Aguarda boot do atendimento antes de exibir a área principal; não bloqueia mensagens de conversas já abertas |
| SAC Digital — inicialização | `src/features/sac-digital/presentation/SacDigitalToolPage.tsx` | Aguarda identificação e dados básicos da sessão |

## Rotas administrativas cobertas pelo fallback compartilhado
- `/admin` — `home`
- `/admin/dashboard` — `dashboard`
- `/admin/crm` — `crm`
- `/admin/announcements` — `announcements`
- `/admin/management` — `management`
- `/admin/quotes` — `quotes`
- `/admin/customer-requests` — `customerRequests`
- `/admin/orders` — `orders`
- `/admin/technician-panel` — `technicianPanel`
- `/admin/agenda` — `agenda`
- `/admin/work-items` — `workItems`
- `/admin/field-map` — `fieldTracking`
- `/admin/customers` — `customers`
- `/admin/inventory` — `inventory`
- `/admin/finance` — `finance`
- `/admin/nfse` — `nfse`
- `/admin/operation/documents` — `documents`
- `/admin/partner-companies` — `partnerCompanies`
- `/admin/audit` — `audit`
- `/admin/site` — `site`
- `/admin/site/services` — `services`
- `/admin/site/categories` — `categories`
- `/admin/products` — `products`
- `/admin/pdv` — `pdv`
- `/admin/site/brands` — `brands`
- `/admin/operation` — `operation`
- `/admin/tools` — `tools`
- `/admin/operation/equipment` — `equipment`
- `/admin/operation/checklists` — `checklists`
- `/admin/operation/general-services` — `generalServices`
- `/admin/operation/service-types` — `serviceTypes`
- `/admin/operation/order-situations` — `situations`
- `/admin/operation/order-statuses` — `orderStatuses`
- `/admin/operation/roles` — `roles`
- `/admin/site/settings` — `siteSettings`
- `/admin/site/entrega` — `siteDelivery`
- `/admin/site/pagamentos` — `sitePayments`
- `/admin/site/solicitacoes` — `siteRequests`
- `/admin/site/pedidos-da-loja` — `siteStoreOrders`
- `/admin/operation/company` — `settings`
- `/admin/operation/integrations` — `integrations`
- `/admin/plan-usage` — `planUsage`
- `/admin/operation/terms` — `terms`
- `/admin/contact` — `contact`

## O que não foi alterado diretamente
As demais telas carregadas pelas rotas acima — incluindo menus de configuração, documentos, permissões, partes do financeiro, ferramentas, detalhes e subrotas — continuam usando seus estados locais de carregamento quando há consultas próprias. O fallback global cobre **o carregamento de código**, não equivale a uma prova de que cada chamada de rede dessas telas esteja finalizada. Modais embutidos (incluindo entradas via QR), notificações, chat e mídia mantêm suas regras específicas.

## Verificação
- Testes estáticos adicionados: `src/shared/ui/admin/crm-navigation-loading-regression.test.mjs`, incluídos em `npm run test:regressions`.
- Build/CI deve ser conferido em GitHub Actions após os commits.
- Auditoria baseada em código, não em navegação manual autenticada por cada permissão, empresa ou aparelho.
