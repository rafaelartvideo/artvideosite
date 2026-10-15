import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const section = read("src/features/orders/presentation/OrderProductsServicesSection.tsx");
const equipment = read("src/features/equipment/presentation/EquipmentAdminPanel.tsx");
const migration = read("supabase/migrations/20261015094500_accept_services_without_price_in_orders.sql");

test("serviços sem preço não ficam desabilitados na seleção da OS", () => {
  assert.doesNotMatch(section, /isUnavailable=\{option => option.price == null\}/);
  assert.doesNotMatch(section, /Defina o preço no cadastro do serviço antes de adicioná-lo/);
  assert.match(section, /setServicePrice\(String\(option.price \?\? 0\)\)/);
  assert.match(section, /option.price_at_completion/);
  assert.match(section, /Serviços sem preço podem ser adicionados normalmente/);
});

test("modal de criar serviço pelo equipamento respeita Sem preço", () => {
  assert.match(equipment, /label="Sem preço"/);
  assert.match(equipment, /serviceForm.noPrice \? 0/);
  assert.match(equipment, /noPrice: value, priceAtCompletion: value \? false/);
  assert.match(equipment, /priceAtCompletion: value, noPrice: value \? false/);
});

test("backend não exige preço e preserva o valor fixo dos demais serviços", () => {
  assert.match(migration, /create or replace function private.prepare_service_order_commercial_item/);
  assert.match(migration, /create or replace function public.add_service_order_catalog_item_v1/);
  assert.match(migration, /new.unit_price:=round\(coalesce\(v_service.price,0\),2\)/);
  assert.match(migration, /v_price:=round\(coalesce\(v_service.price,0\),2\)/);
  assert.match(migration, /private.can_access_service_order_child/);
  assert.match(migration, /v_service.name/);
  assert.doesNotMatch(migration, /Este serviço não possui preço cadastrado/);
});
