import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("cadastro suporta prestador como vínculo independente, sem alterar os vínculos existentes", () => {
  const repository = read("src/features/registrations/infrastructure/registrations.repository.ts");
  const editor = read("src/features/registrations/presentation/RegistrationEditor.tsx");
  const list = read("src/features/registrations/presentation/TabRegistrations.tsx");
  const dashboard = read("src/features/dashboard/presentation/TabDashboard.tsx");
  assert.match(repository, /"customer" \| "employee" \| "supplier" \| "service_provider"/);
  assert.match(editor, /"customer", "employee", "supplier", "service_provider"/);
  assert.match(editor, /<ProviderServicesEditor/);
  assert.match(list, /value: "service_provider", label: "Prestadores de serviço"/);
  assert.match(dashboard, /registrationHasRole\(registration, "service_provider"\)/);
});

test("serviços do prestador têm edição, validação e salvamento no mesmo RPC do cadastro", async () => {
  const editor = read("src/features/registrations/presentation/ProviderServicesEditor.tsx");
  const form = read("src/features/registrations/domain/registration-form.ts");
  const list = read("src/features/registrations/presentation/TabRegistrations.tsx");
  const repository = read("src/features/registrations/infrastructure/registrations.repository.ts");
  const details = read("src/features/registrations/presentation/RegistrationDetails.tsx");
  const compiled = await transformWithEsbuild(editor, "ProviderServicesEditor.tsx", { loader: "tsx" });
  assert.ok(compiled.code.length > 0);
  assert.match(editor, /Adicionar serviço/);
  assert.match(editor, /reference_price/);
  assert.match(form, /validateProviderServices/);
  assert.match(form, /parseProviderReferencePrice/);
  assert.match(form, /provider_services: form\.roles\.includes\("service_provider"\)/);
  assert.match(list, /const servicesValidation = validateProviderServices\(form\)/);
  assert.match(repository, /provider_services:entity_provider_services/);
  assert.match(details, /<Section title="Serviços prestados"/);
});

test("migração preserva isolamento multiempresa e RLS no cadastro de serviços", () => {
  const migration = read("supabase/migrations/20261103143000_registration_service_provider_services.sql");
  assert.match(migration, /enable row level security/);
  assert.match(migration, /entity_provider_services_entity_org_fkey/);
  assert.match(migration, /private\.has_effective_organization_permission/);
  assert.match(migration, /v_has_provider/);
  assert.match(migration, /p_entity \? 'provider_services'/);
  assert.match(migration, /on conflict \(id\) do update/);
});
