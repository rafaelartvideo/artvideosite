import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const endpoint = readFileSync("supabase/functions/union-whatsapp-inbox/index.ts", "utf8");
const menu = readFileSync("src/features/whatsapp-channels/presentation/UnionWhatsAppCrmMenu.tsx", "utf8");
const palette = readFileSync("src/features/orders/domain/order-status-palette.ts", "utf8");

test("OS recentes incluem equipamento vinculado, modelo legado e metadados de retorno", () => {
  const section = endpoint.slice(endpoint.indexOf('if(action==="customer_match")'));
  assert.match(section, /permissions\.has\("orders\.details\.view"\)/);
  assert.match(section, /\.eq\("organization_id",org\)\.eq\("customer_id",customerId\)/);
  assert.match(section, /\.limit\(10\)/);
  assert.match(section, /customer_equipment:customer_equipments\(equipment_type_name,equipment_brand_name,equipment_model_name\)/);
  assert.match(section, /equipment_brand:equipment_brands\(name\)/);
  assert.match(section, /equipment_model:equipment_models\(name\)/);
  assert.match(section, /cancelled_at,return_root_id/);
  assert.match(menu, /order\.customer_equipment/);
  assert.match(menu, /order\.model/);
  assert.match(menu, /OS \{order\.os_number\}/);
  assert.match(menu, /equipmentName/);
});

test("OS recentes respeitam a paleta de status do CRM e identificam retorno", () => {
  assert.match(menu, /getOrderStatusBadgeClass\(status\)/);
  assert.match(menu, /STATUS_TONE_CLASSES\.waiting\.badge/);
  assert.match(menu, /order\.return_root_id/);
  assert.match(menu, /if \(order\.cancelled_at\) return "Cancelada"/);
  assert.match(menu, /if \(order\.completed_at\) return "Fechada"/);
  assert.match(menu, /order\.order_status\?\.name/);
  assert.match(palette, /normalized === "aberta"/);
  assert.match(palette, /normalized === "fechada"/);
  assert.match(palette, /normalized === "cancelada"/);
});
