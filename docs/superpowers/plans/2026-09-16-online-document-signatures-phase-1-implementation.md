# Assinatura eletrônica — Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preparar o sistema para assinatura eletrônica criando a assinatura versionada do funcionário, tornando `signatures.employee` a chave canônica e adicionando as configurações de assinatura online aos modelos de documento.

**Architecture:** A Fase 1 não cria links públicos nem solicitações de assinatura. Ela estabelece os contratos de dados e UI dos quais as fases seguintes dependem: `print_templates` passa a declarar as regras de assinatura online, `employee_signatures` armazena versões privadas da assinatura ligadas ao `entities.id`, e o renderer/editor migram de “técnico” para “funcionário” mantendo alias legado.

**Tech Stack:** React 18 + TypeScript + Vite, Supabase Postgres/RLS/Storage, TanStack Query, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-16-online-document-signatures-design.md`

## Global Constraints

- A V1 usa o termo “assinatura eletrônica”; não alegar ICP-Brasil ou assinatura qualificada.
- `signatures.employee` é a chave canônica; `signatures.technician` permanece somente como alias de compatibilidade.
- Modelos antigos não podem perder campos de assinatura durante carregamento/salvamento.
- Assinatura do funcionário pertence ao cadastro unificado (`entities.id`), não ao registro legado de `employees`.
- A imagem da assinatura deve permanecer privada e nunca ter URL pública permanente.
- Substituir assinatura cria nova versão; versão histórica não é apagada.
- Apenas uma versão pode estar ativa por organização + funcionário.
- O padrão de validade de link é 72 horas, aceitando 1–720 horas.
- Modelo online precisa exigir ao menos uma assinatura.
- Se exigir funcionário, `employee_signature_source` é obrigatório e aceita `responsible`, `technician`, `completed_by`, `manual`.
- O repositório não possui runner de testes automatizados na data deste plano; verificações desta fase usam constraints/consultas SQL, inspeção de diff e build quando disponível, sem adicionar dependência de testes apenas para esta fase.

---

### Task 1: Persistência, permissões, RLS e Storage da Fase 1

**Files:**
- Create: `supabase/migrations/20260916160000_online_document_signatures_phase_1.sql`

**Interfaces:**
- Produces columns on `public.print_templates`: `allow_online_signature`, `signature_link_ttl_hours`, `require_external_signature`, `require_employee_signature`, `employee_signature_source`.
- Produces `public.employee_signatures` keyed by `(organization_id, entity_id)`.
- Produces permission `registrations.employee_signature.manage`.
- Produces private Storage bucket `employee-signatures` and policies scoped by organization/permission.

- [ ] **Step 1: Add template configuration columns and constraints**

Add idempotent columns to `public.print_templates`:

```sql
alter table public.print_templates
  add column if not exists allow_online_signature boolean not null default false,
  add column if not exists signature_link_ttl_hours integer not null default 72,
  add column if not exists require_external_signature boolean not null default true,
  add column if not exists require_employee_signature boolean not null default false,
  add column if not exists employee_signature_source text;
```

Add named CHECK constraints after dropping same-name constraints if they already exist:

```sql
check (signature_link_ttl_hours between 1 and 720)
check (employee_signature_source is null or employee_signature_source in ('responsible','technician','completed_by','manual'))
check (
  not allow_online_signature
  or require_external_signature
  or require_employee_signature
)
check (
  not require_employee_signature
  or employee_signature_source is not null
)
```

- [ ] **Step 2: Create versioned employee signatures table**

Create:

```sql
public.employee_signatures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entity_id uuid not null,
  version integer not null,
  is_active boolean not null default true,
  storage_path text not null,
  signature_hash text not null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default timezone('utc', now()),
  deactivated_at timestamptz,
  foreign key (entity_id, organization_id)
    references public.entities(id, organization_id)
    on delete restrict,
  check (version > 0),
  check (btrim(storage_path) <> ''),
  check (btrim(signature_hash) <> '')
)
```

Create indexes:

```sql
create unique index employee_signatures_entity_version_uidx
  on public.employee_signatures(organization_id, entity_id, version);

create unique index employee_signatures_one_active_uidx
  on public.employee_signatures(organization_id, entity_id)
  where is_active = true;
```

No DELETE grant/policy is created.

- [ ] **Step 3: Add permission and preserve practical access**

Insert permission:

```text
registrations.employee_signature.manage
label: Gerenciar assinatura do funcionário
module: Cadastros — Funcionários
```

Inherit it for roles that currently possess `employees.edit`, `customers.edit` or `customers.update`, matching the migration pattern already used by Cadastros.

- [ ] **Step 4: Add RLS**

Enable RLS and grant authenticated `select, insert, update` only. Policies must require `private.has_effective_organization_permission(organization_id, 'registrations.employee_signature.manage')` and verify that `entity_id` belongs to the same organization and has active employee role.

For INSERT, require `created_by = auth.uid()` when non-null.

For UPDATE, allow only deactivation metadata (`is_active`, `deactivated_at`) through normal frontend flow; immutable fields are protected by a BEFORE UPDATE trigger that raises when `organization_id`, `entity_id`, `version`, `storage_path`, `signature_hash`, `created_by` or `created_at` changes.

- [ ] **Step 5: Add private Storage bucket and policies**

Create bucket if absent:

```sql
insert into storage.buckets (id, name, public)
values ('employee-signatures', 'employee-signatures', false)
on conflict (id) do update set public = false;
```

Storage object path is exactly:

```text
{organization_id}/{entity_id}/{employee_signature_id}.png
```

Policies for SELECT/INSERT require first path segment to match an organization for which the user has `registrations.employee_signature.manage`. UPDATE/DELETE of stored historical objects is not exposed to the client.

- [ ] **Step 6: Add server-side version activation RPC**

Create `public.save_employee_signature(p_organization_id uuid, p_entity_id uuid, p_storage_path text, p_signature_hash text)` as SECURITY DEFINER with fixed `search_path`. It must:

1. require `registrations.employee_signature.manage`;
2. verify active employee role for entity/org;
3. advisory-lock the employee scope;
4. deactivate current active row and stamp `deactivated_at`;
5. compute next version as `coalesce(max(version),0)+1`;
6. insert the new active row with `created_by = auth.uid()`;
7. return the inserted row.

This RPC makes version replacement atomic and prevents two active rows under concurrent saves.

- [ ] **Step 7: Apply migration and verify database invariants**

Run migration through Supabase `apply_migration` using name `online_document_signatures_phase_1`.

Then query `pg_attribute`, `pg_constraint`, `pg_indexes`, `pg_policies` and `storage.buckets` to confirm:

- five new template columns exist;
- table exists;
- one-active partial unique index exists;
- permission exists;
- bucket is private;
- no DELETE policy exists for employee signatures;
- RPC exists.

Commit migration before moving to frontend contracts.

---

### Task 2: Canonicalizar “Assinatura do funcionário” sem quebrar modelos antigos

**Files:**
- Modify: `src/features/documents/domain/print-field-registry.ts`
- Modify: `src/features/documents/domain/order-print-document.ts`

**Interfaces:**
- Produces canonical field `signatures.employee`.
- Consumes legacy saved key `signatures.technician` and normalizes it to `signatures.employee`.
- Printed employee signature label resolves employee identity through existing responsibility data until Phase 2 supplies a frozen signer snapshot.

- [ ] **Step 1: Change registry field**

Replace visible field:

```ts
{ key: "signatures.technician", label: "Assinatura do técnico", kind: "signature" }
```

with:

```ts
{ key: "signatures.employee", label: "Assinatura do funcionário", kind: "signature" }
```

- [ ] **Step 2: Add compatibility alias before field filtering**

Extend `aliases`:

```ts
"signatures.technician": "signatures.employee",
```

Update legacy signature fallback so it checks `signatures.customer` + `signatures.employee`, not the removed canonical technician key.

- [ ] **Step 3: Update print renderer signature resolution**

In the signatures section, treat `signatures.customer` as external; otherwise resolve employee display name using the best currently available internal responsibility in order:

```text
assigned_to_profile -> technician_links/technician -> completed_by_profile
```

The renderer keeps a generic “Assinatura do funcionário” label. Phase 2 will inject the exact frozen employee source for online emissions.

- [ ] **Step 4: Verify compatibility by source inspection**

Confirm there is no canonical registry entry named `signatures.technician`, but there is exactly one alias mapping it to `signatures.employee`. Confirm no code path silently filters the legacy key before aliasing.

Commit this compatibility change separately.

---

### Task 3: Modelar e salvar configurações de assinatura online no template

**Files:**
- Modify: `src/features/documents/domain/print-template.ts`
- Modify: `src/features/documents/infrastructure/documents.repository.ts`
- Modify: `src/features/documents/presentation/PrintTemplateEditor.tsx`

**Interfaces:**
- Produces type `EmployeeSignatureSource = "responsible" | "technician" | "completed_by" | "manual"`.
- `PrintTemplate` and `PrintTemplateEditorValue` expose the five database settings.
- `loadPrintTemplateEditorValue` supplies defaults for old rows.
- `savePrintTemplate` persists all settings.

- [ ] **Step 1: Extend domain types and defaults**

Add:

```ts
export type EmployeeSignatureSource = "responsible" | "technician" | "completed_by" | "manual";
```

Add to both template types:

```ts
allow_online_signature: boolean;
signature_link_ttl_hours: number;
require_external_signature: boolean;
require_employee_signature: boolean;
employee_signature_source: EmployeeSignatureSource | null;
```

Defaults:

```ts
allow_online_signature: false,
signature_link_ttl_hours: 72,
require_external_signature: true,
require_employee_signature: false,
employee_signature_source: null,
```

- [ ] **Step 2: Load and save fields in repository**

`loadPrintTemplateEditorValue` converts missing/invalid TTL to 72 and old nullable booleans to safe defaults. `savePrintTemplate` includes all five values in `payload`.

Before persistence normalize selected fields:

- if online + external required, add `signatures.customer`;
- if online + employee required, add `signatures.employee`;
- if employee not required, do not automatically remove a manually selected employee signature because normal printed documents may still want it.

- [ ] **Step 3: Add editor card “Assinatura online”**

Place after the main Configuração card and before Aparência. It contains:

- checkbox `Permitir assinatura online`;
- when enabled: checkboxes `Exigir assinatura do cliente/responsável` and `Exigir assinatura do funcionário`;
- when employee is enabled: select `Origem do funcionário` with Responsável da OS, Técnico, Quem concluiu, Selecionar manualmente;
- select/preset for validity 24h, 48h, 72h, 7 dias, Personalizado;
- custom integer input when outside presets.

When an online-required signature is enabled, its field checkbox in the Campos section is checked and disabled from removal. Disabling online removes only the requirement, not manually selected signature fields.

- [ ] **Step 4: Add client-side validation**

Before save:

```text
online requires external || employee
TTL must be integer 1..720
employee requires employee_signature_source
```

Validation messages use Portuguese and identify the missing configuration.

- [ ] **Step 5: Verify persisted contract**

Fetch saved row shape/source and ensure old templates receive defaults while newly saved templates write all five fields. Review diff to confirm unrelated print layout logic did not change.

Commit template configuration as one change.

---

### Task 4: Infraestrutura frontend para assinatura versionada do funcionário

**Files:**
- Create: `src/features/registrations/infrastructure/employee-signatures.repository.ts`
- Create: `src/features/registrations/domain/employee-signature.ts`
- Create: `src/features/registrations/presentation/EmployeeSignaturePad.tsx`
- Create: `src/features/registrations/presentation/EmployeeSignatureSection.tsx`

**Interfaces:**
- `getActiveEmployeeSignature(organizationId, entityId)` returns current version or `null`.
- `saveEmployeeSignature({ organizationId, entityId, blob })` uploads private PNG, computes SHA-256 in browser, calls atomic RPC, and returns inserted version.
- `EmployeeSignatureSection` owns query/mutation state and can be embedded in an existing employee registration editor.

- [ ] **Step 1: Define employee signature domain type**

```ts
export type EmployeeSignature = {
  id: string;
  organization_id: string;
  entity_id: string;
  version: number;
  is_active: boolean;
  storage_path: string;
  signature_hash: string;
  created_by: string | null;
  created_at: string;
  deactivated_at: string | null;
};
```

- [ ] **Step 2: Build repository read + temporary preview**

Read active row from `employee_signatures` scoped by org/entity. For preview, request a short-lived signed URL from bucket `employee-signatures`; never persist that URL.

- [ ] **Step 3: Build atomic save flow**

The pad exports a PNG Blob. Repository:

1. validates MIME `image/png` and maximum size of 1 MB;
2. generates UUID client-side for object path placeholder or uploads to a unique temporary filename under `{org}/{entity}/`;
3. computes `SHA-256` via `crypto.subtle.digest`;
4. uploads with `upsert: false`;
5. calls `save_employee_signature` with exact private storage path/hash;
6. if RPC fails, removes the just-uploaded object only when policy/server path permits cleanup; otherwise leaves it unreachable and reports error (no historical record points to it).

Do not overwrite a previous object.

- [ ] **Step 4: Build signature pad**

Canvas/pointer-events component supports mouse, touch and stylus. Requirements:

- white signing area;
- pointer capture;
- clear action;
- canvas scales for devicePixelRatio;
- export crops transparent/white whitespace to a reasonable bounding area;
- reject an empty/tap-only signature with message “Faça sua assinatura antes de salvar.”;
- output PNG with transparent background or white background consistently (choose transparent PNG and keep renderer responsible for white page background).

No third-party signature library is added.

- [ ] **Step 5: Build employee signature section**

UI states:

- no permission: do not render management controls;
- new unsaved registration: show “Salve o cadastro antes de cadastrar a assinatura.”;
- existing employee without signature: pad + `Salvar assinatura`;
- existing employee with signature: preview, `Versão N`, registration date, `Substituir assinatura`;
- replacement mode: show pad + Cancelar/Salvar nova assinatura.

Saving a replacement does not delete the old image or row.

- [ ] **Step 6: Verify repository path/permission assumptions**

Cross-check the bucket path against Storage policy and the table against RLS. Confirm the repository never calls DELETE on a historical signature row.

Commit employee-signature infrastructure/components.

---

### Task 5: Integrar assinatura ao Cadastro de Funcionário

**Files:**
- Modify: `src/features/registrations/presentation/RegistrationEditor.tsx`
- Modify: `src/features/registrations/presentation/TabRegistrations.tsx`
- Modify: `src/features/employees/domain/permission-taxonomy.ts`

**Interfaces:**
- RegistrationEditor receives `registrationId?: string | null` and `canManageEmployeeSignature: boolean`.
- It renders `EmployeeSignatureSection` only while the `employee` role is selected.
- Permission taxonomy exposes the new manage permission under the Cadastros/Funcionários area and retains dependency on a base Cadastros/employee edit permission.

- [ ] **Step 1: Add permission to frontend taxonomy**

Add `registrations.employee_signature.manage` to labels/grouping/dependencies following the existing registrations contacts/records pattern. Dependency must include view access and an edit capability so the permission is not isolated from Cadastros.

- [ ] **Step 2: Pass permission and entity id through TabRegistrations**

Compute:

```ts
const canManageEmployeeSignature = hasPermission("registrations.employee_signature.manage");
```

Pass `selected?.id || routeRegistration?.id || null` to editor without changing the existing save/navigation behavior.

- [ ] **Step 3: Render section in employee editor**

Inside the existing employee `Geral` section or directly after it, render a clearly separated `Assinatura` section. It must not appear for customer-only/supplier-only registrations.

For a new registration, the section explains that the cadastro must be saved first. After create, the existing save behavior opens details; user can Edit and add the signature.

- [ ] **Step 4: Verify role switching**

If employee role is unchecked before save, signature management UI disappears but existing historical signature records are not deleted. Re-adding employee role later may reveal the prior active signature only if the database still considers the entity an active employee after save; RLS/RPC prevents creating a new signature for a non-employee.

Commit registration integration.

---

### Task 6: Fase 1 verification checkpoint

**Files:**
- No new production files unless a verification finding requires a fix.

**Interfaces:**
- Produces a stable base contract for Phase 2.

- [ ] **Step 1: Database verification query**

Run one read-only SQL report returning booleans for:

```text
print template columns present
TTL constraint present
employee signature source constraint present
employee_signatures table present
one active unique index present
immutable update trigger present
save_employee_signature RPC present
permission present
private bucket present
RLS enabled
```

All must be true.

- [ ] **Step 2: Inspect migration/application drift**

`list_migrations` must show `online_document_signatures_phase_1`. Repository migration file and applied SQL must match semantically.

- [ ] **Step 3: Review GitHub diff against Phase 1 scope**

Expected touched areas only:

```text
supabase/migrations/...phase_1.sql
src/features/documents/domain/*
src/features/documents/infrastructure/documents.repository.ts
src/features/documents/presentation/PrintTemplateEditor.tsx
src/features/registrations/domain/employee-signature.ts
src/features/registrations/infrastructure/employee-signatures.repository.ts
src/features/registrations/presentation/EmployeeSignature*.tsx
src/features/registrations/presentation/RegistrationEditor.tsx
src/features/registrations/presentation/TabRegistrations.tsx
src/features/employees/domain/permission-taxonomy.ts
```

No Phase 2 request/link/OTP code is introduced yet.

- [ ] **Step 4: Build verification when execution environment supports it**

Run:

```bash
npm run build
```

Expected: Vite exits 0. Existing bundle-size warnings are not a failure. If this connector-only execution cannot run a local build, report that explicitly instead of claiming the build passed.

- [ ] **Step 5: Phase checkpoint**

Report commits/migration applied and stop before Phase 2 if any database invariant or frontend contract is unresolved.
