import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("cadastro pelo WhatsApp reexecuta a associação CPF + primeiro nome", () => {
  const edge = read("supabase/functions/artvideo-customer-access/index.ts");
  const page = read("src/features/customer-account/presentation/CustomerAccountPage.tsx");
  const migration = read("supabase/migrations/20261028192000_artvideo_customer_registration_link_retry.sql");
  assert.match(edge, /link_status:"needs_cpf",whatsapp_verified_at:now/);
  assert.match(page, /activateCustomerAccount\(\)/);
  assert.match(migration, /entity_id is null and link_status='created'/);
});

test("cliente autenticado também consegue verificar WhatsApp após confirmação por e-mail", () => {
  const edge = read("supabase/functions/artvideo-customer-access/index.ts");
  const component = read("src/features/customer-account/presentation/CustomerWhatsAppVerification.tsx");
  const page = read("src/features/customer-account/presentation/CustomerAccountPage.tsx");
  const migration = read("supabase/migrations/20261028193000_artvideo_customer_self_verify_phone.sql");
  assert.match(edge, /if\(action==="profile_send"\)/);
  assert.match(edge, /if\(action==="profile_verify"\)/);
  assert.match(edge, /account_user_id",viewer\.user\.id/);
  assert.match(edge, /safeEqual\(c\.code_digest,await hmac/);
  assert.match(edge, /viewer\.user\?\.id!==c\.account_user_id/);
  assert.match(component, /"profile_send"/);
  assert.match(component, /"profile_verify"/);
  assert.match(page, /<CustomerWhatsAppVerification onVerified=/);
  assert.match(migration, /purpose='profile'/);
  assert.match(migration, /artvideo_reset_phone_verification/);
});

test("historico exige WhatsApp atual verificado, CPF, primeiro nome e vinculo unico", () => {
  const migration = read("supabase/migrations/20261028194000_artvideo_customer_verified_crm_history_access.sql");
  const edge = read("supabase/functions/artvideo-customer-access/index.ts");
  assert.match(migration, /artvideo_verified_portal_customer_v1/);
  assert.match(migration, /a\.whatsapp_verified_at is not null/);
  assert.match(migration, /artvideo_first_name_key_v1\(a\.full_name\)/);
  assert.match(migration, /duplicate\.cpf=a\.cpf/);
  assert.doesNotMatch(migration, /crm_access_activated_at is not null/);
  assert.match(edge, /portalAssetContext\(request,order\.id\)/);
});

test("registro sem e-mail nao copia credencial tecnica para o CRM", () => {
  const migration = read("supabase/migrations/20261028195000_artvideo_customer_registration_without_email.sql");
  assert.match(migration, /cliente-%@auth\.unionworld\.app/);
});
