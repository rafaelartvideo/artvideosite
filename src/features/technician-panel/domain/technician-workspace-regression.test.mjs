import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");
const panel = read("src/features/technician-panel/presentation/TechnicianPanel.tsx");
const rpc = read("supabase/migrations/20261014180500_technician_order_address_problem_scope.sql");

test("painel técnico utiliza padrão de página, seção e toolbar do CRM", () => {
  assert.match(panel, /<PageHeader/);
  assert.match(panel, /<Section title="Cliente"/);
  assert.match(panel, /<Section title="Equipamento"/);
  assert.match(panel, /Serviços atribuídos/);
  assert.match(panel, /<AdminStickyToolbar/);
  assert.match(panel, /<BtnPrimary/);
  assert.match(panel, /<BtnSecondary/);
  assert.match(panel, /<FTextarea/);
});

test("painel abre uma OS existente sem acesso direto à OS comercial", () => {
  assert.match(panel, /useMatch\("\/admin\/technician-panel\/os\/:orderId"\)/);
  assert.match(panel, /service_order_id === routeOrderId/);
  assert.match(panel, /orderServices\.find\(/);
  assert.doesNotMatch(panel, /\.from\("service_orders"\)/);
  assert.doesNotMatch(panel, /unit_price|final_total|discount_amount/);
});

test("imagem do serviço oferece câmera e seleção separadas", () => {
  assert.match(panel, />Abrir câmera<\/BtnSecondary>/);
  assert.match(panel, />Selecionar imagem<\/BtnSecondary>/);
  assert.match(panel, /capture="environment"/);
  assert.match(panel, /multiple className="sr-only"/);
  assert.match(panel, /uploadTechnicianPhoto\(/);
  assert.match(panel, /onChange=\{event => void onUpload\(event\)\}/);
});

test("a RPC da OS técnica protege endereço/problema e filtra serviços por atribuição", () => {
  assert.match(rpc, /technician_panel\.data\.address/);
  assert.match(rpc, /technician_panel\.data\.problem/);
  assert.match(rpc, /private\.has_effective_organization_permission/);
  assert.match(rpc, /service_order_item_task_assignees/);
  assert.match(rpc, /employee\.profile_id=v_user/);
  assert.doesNotMatch(rpc, /'unit_price'|'final_total'|'discount_amount'/);
});


const secureMigration = read("supabase/migrations/20261014190000_technician_order_secure_details_actions.sql");
const regularOrder = read("src/features/orders/presentation/OrderDetailsPage.tsx");
const sharedTabs = read("src/features/orders/presentation/OrderDetailSectionTabs.tsx");
const repository = read("src/features/technician-panel/infrastructure/technician-tasks.repository.ts");

test("OS técnica compartilha as abas da OS normal e separa Cliente e Equipamento", () => {
  assert.match(panel, /<OrderDetailSectionTabs/);
  assert.match(panel, /detailTab === "details"/);
  assert.match(panel, /<Section title="Cliente"/);
  assert.match(panel, /<Section title="Equipamento"/);
  assert.match(panel, /Serviços atribuídos/);
  assert.match(regularOrder, /<OrderDetailSectionTabs/);
  assert.match(sharedTabs, /Detalhes da OS/);
  assert.match(sharedTabs, /Produtos e Serviços/);
});

test("permissões específicas controlam situação e diagnóstico na interface e na RPC", () => {
  assert.match(panel, /orderDetails\?\.can_change_situation/);
  assert.match(panel, /orderDetails\.can_edit_diagnosis/);
  assert.match(panel, /getMyTechnicianOrderDetails\(routeOrderId\)/);
  assert.match(panel, /changeMyTechnicianOrderSituation\(routeOrderId, nextId\)/);
  assert.match(panel, /updateMyTechnicianOrderDiagnosis\(routeOrderId, diagnosisDraft\)/);
  assert.match(repository, /get_my_technician_order_details_v1/);
  assert.match(repository, /change_my_technician_order_situation_v1/);
  assert.match(repository, /update_my_technician_order_diagnosis_v1/);
  assert.match(secureMigration, /private\.can_access_technician_order_v1/);
  assert.match(secureMigration, /service_order_item_task_assignees/);
  assert.match(secureMigration, /employee\.profile_id=\(select auth\.uid\(\)\)/);
  assert.match(secureMigration, /completed_at is not null or v_order\.cancelled_at is not null/);
  assert.match(secureMigration, /service_type_situations/);
});

test("dados comerciais não são expostos nas novas consultas do técnico", () => {
  const readFunction = secureMigration.split("create or replace function public.get_my_technician_order_details_v1")[1]
    .split("create or replace function private.guard_service_order_sensitive_update")[0];
  assert.doesNotMatch(readFunction, /'unit_price'|'final_total'|'service_price'|'subtotal'|'purchase_price'/);
  assert.match(readFunction, /technician_panel\.data\.internal_notes/);
  assert.match(readFunction, /technician_panel\.data\.order_items/);
  assert.match(readFunction, /technician_panel\.data\.situation/);
  assert.match(readFunction, /'available_situations'/);
  assert.match(readFunction, /jsonb_build_object/);
});

test("nenhuma permissão nova concede orders.edit ou visão geral de OS", () => {
  assert.doesNotMatch(secureMigration, /'orders\.edit'|'orders\.view_all'/);
  assert.match(secureMigration, /revoke all on function public\.get_my_technician_order_details_v1/);
  assert.match(secureMigration, /from public,anon,authenticated/);
  assert.match(secureMigration, /grant execute on function public\.get_my_technician_order_details_v1\(uuid\) to authenticated/);
});


const catalogMigration = read("supabase/migrations/20261014194500_technician_order_catalog_and_history.sql");
const guardMigration = read("supabase/migrations/20261014201500_technician_commercial_recalc_guard.sql");
const notesMigration = read("supabase/migrations/20261014204000_technician_order_problem_internal_notes.sql");
const catalogUi = read("src/features/technician-panel/presentation/TechnicianOrderItemsSection.tsx");
const historyUi = read("src/features/technician-panel/presentation/TechnicianOrderHistoryDialog.tsx");
const taxonomy = read("src/features/employees/domain/permission-taxonomy.ts");

test("consulta o catálogo com permissões específicas sem expor preços", () => {
  assert.match(catalogMigration, /search_my_technician_order_catalog_v1/);
  assert.match(catalogMigration, /private\.can_access_technician_order_v1\(p_order_id,v_perm\)/);
  assert.match(catalogMigration, /technician_panel\.data\.order_items/);
  const query = catalogMigration.split("create or replace function public.search_my_technician_order_catalog_v1")[1]
    .split("create or replace function public.add_my_technician_order_item_v1")[0];
  assert.doesNotMatch(query, /'unit_price'|'sale_price'|'final_total'|'cost_price'/);
  assert.match(query, /'name',x\.name/);
  assert.match(catalogUi, />Adicionar novo<\/BtnSecondary>/);
  assert.match(catalogUi, />Adicionar produto<\/BtnPrimary>/);
  assert.match(catalogUi, /searchMyTechnicianOrderCatalog/);
});

test("inclusões técnicas não alteram atribuições de serviços existentes", () => {
  assert.match(catalogMigration, /Este serviço já existe na OS/);
  assert.match(catalogMigration, /service_order_item_task_assignees/);
  assert.match(catalogMigration, /assigned_employee_id,status,updated_by/);
  assert.match(catalogMigration, /inventory\.quantity,0\)<p_quantity\*v_factor/);
  assert.match(catalogMigration, /or v_order\.is_solved or v_order\.cannot_be_solved/);
  assert.match(catalogUi, /addMyTechnicianOrderItem/);
  assert.match(catalogUi, /removeMyTechnicianOrderProduct/);
  assert.match(catalogMigration, /'technician_panel\.actions\.remove_product'/);
});

test("recálculo interno não permite editar preços, concluir nem acessar outra OS", () => {
  assert.match(guardMigration, /app\.technician_order_commercial_write/);
  assert.match(guardMigration, /app\.update_order_commercial_totals/);
  assert.match(guardMigration, /technician_panel\.actions\.add_product/);
  assert.match(guardMigration, /to_jsonb\(new\)/);
  assert.match(guardMigration, /orders\.complete/);
  assert.match(guardMigration, /set_config\('app\.technician_order_commercial_write','false',true\)/);
});

test("histórico técnico e textos da OS usam o mesmo padrão do CRM e RPCs restritas", () => {
  assert.match(panel, /<OrderHistoryPage/);
  assert.match(panel, /<TechnicianOrderItemsSection/);
  assert.doesNotMatch(panel, /updateMyTechnicianOrderNote/);
  assert.match(historyUi, /<AdminDialog/);
  assert.match(historyUi, /getMyTechnicianOrderHistory/);
  assert.match(catalogMigration, /get_my_technician_order_history_v1/);
  assert.match(catalogMigration, /technician_panel\.data\.history/);
  assert.match(notesMigration, /update_my_technician_order_note_v1/);
  assert.match(notesMigration, /p_field not in \('problem','internal_notes'\)/);
  assert.match(notesMigration, /technician_panel\.actions\.edit_problem/);
  assert.match(notesMigration, /technician_panel\.actions\.edit_internal_notes/);
  assert.match(notesMigration, /private\.can_access_technician_order_v1\(p_order_id,v_view_permission\)/);
  assert.match(notesMigration, /revoke all on function public\.update_my_technician_order_note_v1/);
});

test("novos checkboxes de técnico exigem visualização e vínculo ao painel", () => {
  const actions = ["add_service","add_product","remove_product","edit_problem","edit_internal_notes"];
  for (const action of actions) assert.match(taxonomy,
    new RegExp('technician_panel\\.actions\\.' + action + '": \\["technician_panel\\.data\\.'));
  assert.match(taxonomy, /technician_panel\.data\.history/);
  assert.match(repository, /search_my_technician_order_catalog_v1/);
  assert.match(repository, /add_my_technician_order_item_v1/);
  assert.match(repository, /remove_my_technician_order_product_v1/);
  assert.match(repository, /get_my_technician_order_history_v1/);
  assert.match(repository, /update_my_technician_order_note_v1/);
});


const strictMigration = read("supabase/migrations/20261014211000_technician_strict_action_type_validation.sql");

test("RPCs técnicas rejeitam discriminadores nulos ou desconhecidos", () => {
  assert.match(strictMigration, /p_item_type is null or p_item_type not in/);
  assert.match(strictMigration, /p_field is null or p_field not in/);
  assert.match(strictMigration, /private\.can_access_technician_order_v1/);
});

test("as telas do Painel do Técnico possuem JSX sintaticamente válido", async () => {
  for (const filename of [
    "TechnicianPanel.tsx",
    "TechnicianOrderItemsSection.tsx",
    "TechnicianOrderHistoryDialog.tsx",
    "TechnicianOrdersTable.tsx",
  ]) {
    const file = "src/features/technician-panel/presentation/" + filename;
    await assert.doesNotReject(
      transformWithEsbuild(read(file), file, { loader: "tsx", jsx: "automatic" }),
      "JSX inválido em " + filename,
    );
  }
});

test("lista inicial possui tabela responsiva, paginação e indicadores de andamento", () => {
  const table = read("src/features/technician-panel/presentation/TechnicianOrdersTable.tsx");
  assert.match(panel, /<TechnicianOrdersTable/);
  assert.match(table, /<table/);
  assert.match(table, /<PaginationBar/);
  assert.match(table, /aria-label="Buscar minhas ordens de serviço"/);
  assert.match(table, /md:hidden/);
  assert.match(table, /pendente/);
  assert.match(table, /em andamento/);
});

test("painel técnico usa Realtime e notificações em balão, sem atualizar manualmente", () => {
  assert.match(panel, /service_order_item_tasks/);
  assert.match(panel, /postgres_changes/);
  assert.match(panel, /notifyAdmin/);
  assert.doesNotMatch(panel, />Atualizar<\/BtnSecondary>/);
  assert.doesNotMatch(panel, /eyebrow="Atendimento"/);
  assert.doesNotMatch(panel, /<Section title="Localização da execução"/);
});

test("foto técnica tem limite também no banco, com validação de vínculo e sem preço", () => {
  const migration = read("supabase/migrations/20261014215500_technician_equipment_fields_and_photo_limit.sql");
  assert.match(migration, /count\(\*\) from public\.service_order_item_task_photos/);
  assert.match(migration, /Limite de 3 imagens por serviço/);
  assert.match(migration, /private\.is_my_technician_task/);
  assert.match(migration, /technician_panel\.data\.equipment/);
  assert.match(panel, /photoCount >= 3/);
  assert.match(panel, /countMyTechnicianPhotos/);
  assert.doesNotMatch(migration, /'unit_price'|'final_total'|'subtotal'/);
});

const scopedMedia = read("supabase/migrations/20261014224000_technician_order_customer_equipment_media.sql");

test("cliente e equipamento da OS técnica são carregados por RPC com permissões", () => {
  assert.match(scopedMedia, /'customer_document'/);
  assert.match(scopedMedia, /'customer_address'/);
  assert.match(scopedMedia, /'equipment_photos'/);
  assert.match(scopedMedia, /private\.can_access_technician_order_v1/);
  assert.match(scopedMedia, /technician_panel\.data\.equipment/);
  assert.doesNotMatch(scopedMedia, /'unit_price'|'final_total'|'subtotal'/);
  assert.match(panel, /getMyTechnicianEquipmentPhotoUrl/);
});

test("problema e notas são somente leitura, registros ficam no cabeçalho", () => {
  assert.doesNotMatch(panel, /openNoteEditor|saveOrderNote|noteField/);
  assert.match(panel, /<AdminPage open={!historyDialogOpen}/);
  assert.match(panel, /Histórico<\/BtnSecondary>/);
  assert.match(panel, /ariaLabel="Alterar situação da OS"/);
});


test("o painel utiliza o cabeçalho compartilhado e cinco seções independentes", () => {
  assert.match(panel, /<AdminPage open=\{!historyDialogOpen\}/);
  assert.match(panel, /breadcrumb="Painel do Técnico"/);
  for (const title of ["Cliente", "Equipamento", "Descrição do problema", "Observações internas", "Diagnóstico"]) {
    assert.ok(panel.includes('<Section title="' + title + '"'), "Seção ausente: " + title);
  }
  assert.match(panel, /<StatusBadge/);
  assert.match(panel, /<OrderDetailSectionTabs/);
  assert.doesNotMatch(panel, /<nav aria-label="Navegação estrutural"/);
});

test("modal e miniaturas de imagens são os mesmos componentes da OS normal", () => {
  assert.match(panel, /<OrderImageLightbox/);
  assert.match(panel, /<OrderImageThumb/);
  assert.match(panel, /setViewEquipmentImage/);
  assert.doesNotMatch(panel, /target="_blank" rel="noreferrer"[\s\S]*?Foto da etiqueta/);
});

test("registros escritos são compartilhados com a OS normal por RPC segura", () => {
  const history = read("src/features/orders/presentation/OrderHistoryPage.tsx");
  const hook = read("src/features/technician-panel/application/useTechnicianOrderRecords.ts");
  const sql = read("supabase/migrations/20261014231500_technician_shared_order_history_records.sql");
  assert.match(panel, /<OrderHistoryPage/);
  assert.match(history, /Novo registro/);
  assert.match(hook, /createMyTechnicianOrderRecord/);
  assert.match(sql, /service_order_history_notes/);
  assert.match(sql, /technician_panel\.actions\.history\.create/);
  assert.match(sql, /private\.can_access_technician_order_v1/);
  assert.doesNotMatch(sql, /'unit_price'|'final_total'|'subtotal'/);
});

test("Produtos e Serviços mantêm seções independentes e ações de execução na toolbar", () => {
  assert.match(panel, /<Section title="Execução do serviço">/);
  assert.match(panel, /<Section title=\{<span className="inline-flex items-center gap-2">\s*Imagens do serviço/);
  assert.match(panel, /<TechnicianOrderItemsSection\s/);
  assert.doesNotMatch(panel, /<TechnicianOrderItemsSection inline/);
  const toolbar = panel.slice(panel.lastIndexOf('<AdminStickyToolbar className="!flex-nowrap'));
  assert.match(toolbar, /<Play size={18} className="sm:hidden"/);
  assert.match(toolbar, /<Check size={18} className="sm:hidden"/);
  assert.match(toolbar, /<span className="sr-only sm:not-sr-only">Iniciar serviço<\/span>/);
  assert.match(toolbar, /<span className="sr-only sm:not-sr-only">Finalizar serviço<\/span>/);
  assert.equal(panel.split('Iniciar serviço</span>').length - 1, 1);
  assert.equal(panel.split('Finalizar serviço</span>').length - 1, 1);
});

test("carregamento de situação ocorre apenas dentro da tag, sem loader global de OS", () => {
  assert.match(panel, /aria-label="Carregando situação da OS"/);
  assert.match(panel, /situationUpdating/);
  assert.doesNotMatch(panel, /aria-label="Carregando OS"/);
});

test("o técnico adiciona serviços na seção atribuída e produtos na seção própria sem preços", () => {
  const hook = read("src/features/technician-panel/application/useTechnicianOrderRecords.ts");
  assert.match(panel, /<TechnicianOrderItemsSection mode="services"/);
  assert.match(panel, /<TechnicianOrderItemsSection mode="products"/);
  assert.match(catalogUi, /<Section title=\{<span className="inline-flex items-center gap-2">\s*Produtos/);
  assert.match(catalogUi, /Busque no estoque por nome ou SKU/);
  assert.match(catalogUi, /type === "product"/);
  assert.doesNotMatch(catalogUi, /unit_price|sale_price|final_total/);
  assert.match(hook, /row\.type === "note"/);
});

test("OS técnica aguarda dados e mídias antes da abertura e mostra endereço separado", () => {
  assert.match(panel, /aria-label="Carregando dados da OS"/);
  assert.match(panel, /Promise\.allSettled/);
  assert.doesNotMatch(panel, /photoLoadedServiceId !== selectedId/);
  assert.match(panel, /!orderDetails \|\| orderDetails\.id !== routeOrderId/);
  assert.match(panel, /<Section title="Endereço">/);
  for (const field of ["CEP", "Rua", "Número", "Complemento", "Bairro", "Cidade", "Estado"]) {
    assert.ok(panel.includes('info("' + field + '"'), "Campo ausente: " + field);
  }
});

test("trocar de serviço não aciona loading global nem refaz consultas de fotos já visitadas", () => {
  assert.match(panel, /const servicePhotos = selectedId \? photoCache\[selectedId\]/);
  assert.match(panel, /if \(!selectedId \|\| !\(canSeePhotos \|\| canSendPhotos\) \|\| photoCache\[selectedId\]\) return/);
  assert.match(panel, /const photoLoading = Boolean\(/);
  assert.doesNotMatch(panel, /setPhotoLoadedServiceId/);
  assert.match(panel, /onClick=\{\(\) => openService\(service\)\}/);
  assert.match(panel, /actions=\{hasPermission\("technician_panel\.data\.order_items"\)/);
  assert.match(panel, /photoLoading \? "…" : photoCount/);
  assert.match(catalogUi, /\{products\.length\}/);
});

test("busca e filtros do painel técnico ficam separados da tabela paginada", () => {
  const table = read("src/features/technician-panel/presentation/TechnicianOrdersTable.tsx");
  assert.ok(table.includes('>Minhas ordens de serviço</h2>'));
  assert.match(table, /<table/);
  assert.match(table, /<PaginationBar/);
  assert.match(table, /space-y-4/);
  assert.doesNotMatch(table, /<Section title="Minhas ordens de serviço"/);
});

test("toolbar mantém ações em uma linha no mobile e Realtime evita consultas periódicas conectadas", () => {
  assert.match(panel, /!flex-nowrap/);
  assert.match(panel, /activeOrderIdRef/);
  assert.match(panel, /if \(!connected\) reconcile\(\)/);
  assert.match(panel, /postgres_changes/);
  assert.doesNotMatch(panel, /window\.setInterval\(reconcile, 60000\)/);
});

test("loader compartilhado exibe texto sobre as bolinhas animadas", () => {
  const feedback = read("src/shared/ui/admin/AdminFeedback.tsx");
  const layout = read("src/shared/ui/admin/AdminLayout.tsx");
  assert.match(feedback, /export function LoadingDots/);
  assert.match(feedback, /animate-bounce/);
  assert.ok(feedback.includes('<LoadingDots />'));
  assert.match(layout, /AdminStickyToolbarContext\.Provider/);
  assert.match(layout, /mobileBackOnly/);
});
