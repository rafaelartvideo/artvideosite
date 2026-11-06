import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");
const section = read("src/features/orders/presentation/OrderProductsServicesSection.tsx");
const repository = read("src/features/orders/infrastructure/order-commercial-items.repository.ts");
const badge = read("src/features/orders/presentation/OrderServiceStatusBadge.tsx");
const resolution = read("src/features/orders/presentation/OrderResolutionCommercialItems.tsx");
const migration = read("supabase/migrations/20261106145648_order_item_pin_persistence_and_quote_inheritance.sql");

test("Serviço avulso exibe Editar ao lado de Fixar e Remover", async () => {
  for (const [file, contents] of [
    ["OrderProductsServicesSection.tsx", section],
    ["OrderServiceStatusBadge.tsx", badge],
    ["OrderResolutionCommercialItems.tsx", resolution],
  ]) {
    assert.ok((await transformWithEsbuild(contents, file, { loader: "tsx" })).code);
  }
  assert.match(section, /item\.item_type === "custom_service"/);
  assert.match(section, /ariaLabel=\{"Editar serviço avulso " \+ item\.title_snapshot\}/);
  assert.match(section, /onClick=\{\(\) => openEditCustomService\(item\)\}/);
  assert.match(section, /<Pencil size=\{15\}/);
  assert.match(section, /onClick=\{\(\) => void togglePinnedItem\(item\)\}/);
  assert.match(section, /<Pin size=\{15\} fill=\{item\.is_pinned \? "currentColor" : "none"\}/);
  assert.match(section, /<Trash2 size=\{15\}/);
  assert.match(section, /orderedItems\.map\(item =>/);
  assert.match(section, /Number\(Boolean\(b\.is_pinned\)\) - Number\(Boolean\(a\.is_pinned\)\)/);
});

test("Modal de edição altera apenas nome e descrição, respeitando bloqueio comercial", () => {
  assert.match(section, /const openEditCustomService = \(item: OrderCommercialItem\)/);
  assert.match(section, /if \(!commercialEditable \|\| item\.item_type !== "custom_service"\) return/);
  assert.match(section, /title=\{editingCustomItem \? "Editar serviço avulso" : "Serviço Avulso"\}/);
  assert.match(section, /updateOrderCustomServiceDetails\(\{/);
  assert.match(section, /itemId: editingCustomItem\.id/);
  assert.match(section, /!editingCustomItem && <div className="grid gap-3 sm:grid-cols-2"/);
  assert.match(section, /editable && !editingCustomItem && <div>/);
  assert.match(section, /maxLength=\{120\}/);
  assert.match(section, /maxLength=\{2000\}/);
  assert.match(section, />\{editingCustomItem \? "Salvar" : "Adicionar serviço"\}<\/BtnPrimary>/);
  assert.match(repository, /\.eq\("item_type", "custom_service"\)/);
  assert.match(repository, /\.update\(\{\s*title_snapshot: title,\s*description_snapshot:/);
  assert.match(section, /if \(!commercialEditable \|\| !order\?\.id \|\| !customName\.trim\(\) \|\| mutating\) return/);
});

test("Fixação persiste no banco, é independente do botão Editar e não altera preços", () => {
  assert.match(repository, /is_pinned: boolean/);
  assert.match(repository, /quote_proposal_id,is_pinned/);
  assert.match(repository, /\.order\("is_pinned", \{ ascending: false \}\)/);
  assert.match(repository, /\.update\(\{ is_pinned: input\.pinned \}\)/);
  assert.match(repository, /\.eq\("service_order_id", input\.serviceOrderId\)/);
  assert.match(section, /pinningItems\[item\.id\]/);
  assert.match(section, /disabled=\{!editable \|\| Boolean\(pinningItems\[item\.id\]\)\}/);
  assert.match(section, /commercialEditable && item\.item_type === "custom_service"/);
  assert.match(migration, /add column if not exists is_pinned boolean not null default false/);
  assert.match(migration, /to_jsonb\(new\) - 'is_pinned' - 'updated_at'/);
  assert.match(migration, /to_jsonb\(old\) - 'is_pinned' - 'updated_at'/);
  assert.match(migration, /quote_line_index, is_pinned/);
  assert.match(migration, /v_item->>'pinned'/);
  assert.match(migration, /Itens aprovados estão bloqueados/);
});

test("Tags de Pendente e Em andamento têm raio total e pulsação acessível", () => {
  assert.match(badge, /rounded-full border px-2\.5 py-1/);
  assert.match(badge, /current === "pending" \|\| current === "in_progress"/);
  assert.match(badge, /motion-safe:animate-ping/);
  assert.match(badge, /STATUS_TONE_CLASSES\.pending/);
  assert.match(badge, /STATUS_TONE_CLASSES\.progress/);
  assert.match(badge, /Pendente/);
  assert.match(badge, /Em andamento/);
  assert.match(badge, /aria-hidden="true"/);
  assert.match(section, /<OrderServiceStatusBadge status=\{tasks\[item\.id\]\?\.status\}\/>/);
  assert.match(resolution, /<OrderServiceStatusBadge status=\{task\?\.status\}\/>/);
});
