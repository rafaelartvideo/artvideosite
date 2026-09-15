# Cadastros — Contatos, Registros e Acesso Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Padronizar os detalhes de Cadastros com toolbar, múltiplos contatos e registros permanentes, removendo a ativação/inativação dos detalhes e corrigindo o fluxo de acesso ao sistema do funcionário.

**Architecture:** `entities` continua como identidade central. `entity_contacts` e `entity_records` serão relações tenant-scoped com RLS e permissões próprias; o frontend acessará cada fluxo por repositories e páginas focadas. O provisionamento Auth/Profile/Membership continua centralizado na Edge Function `employee-access`, com propagação explícita das mensagens reais de erro para o frontend.

**Tech Stack:** React 18, TypeScript, Vite 6, Supabase JS 2.112.3, PostgreSQL 17, Supabase Auth/Edge Functions, Tailwind/Radix admin UI.

**Spec:** `docs/superpowers/specs/2026-09-15-cadastros-contatos-registros-acesso-design.md`

## Global Constraints

- Implementar diretamente na `main`, conforme aprovado pelo usuário.
- Toda nova tabela deve ser isolada por `organization_id` e possuir RLS.
- Não criar usuário Auth diretamente pelo frontend.
- Não remover os campos diretos `entities.phone`, `entities.whatsapp` e `entities.email`.
- Não permitir exclusão física de registros do cadastro pelo fluxo normal.
- Ativar/inativar usuário continua apenas nas ações rápidas e usa `employees.toggle_active`.
- Reutilizar UI administrativa existente e evitar ampliar desnecessariamente `RegistrationDetails.tsx` e `TabRegistrations.tsx`.
- Projeto não possui test runner frontend configurado; validação automatizada mínima será feita com `npm run build`, consultas SQL de invariantes, Edge Function verificada no Supabase e GitHub Actions de deploy/build.

---

### Task 1: Persistência, permissões e RLS para contatos e registros

**Files:**
- Create: `supabase/migrations/20260915_registration_contacts_records.sql`
- Modify: `src/features/employees/domain/permission-taxonomy.ts`

**Interfaces:**
- Produces table `public.entity_contacts` with tenant/entity ownership.
- Produces table `public.entity_records` with immutable normal-flow records.
- Produces permissions `registrations.contacts.view`, `registrations.contacts.manage`, `registrations.records.view`, `registrations.records.create`.

- [ ] **Step 1: Capture current invariants before DDL**
  - Confirm the new tables and permission keys do not exist.
  - Confirm `private.has_effective_organization_permission(uuid,text)` exists.

- [ ] **Step 2: Write the migration**
  - `entity_contacts`: `id`, `organization_id`, `entity_id`, `name`, `role_label`, `phone`, `whatsapp`, `email`, `is_primary`, `is_active`, `created_by`, timestamps.
  - `entity_records`: `id`, `organization_id`, `entity_id`, `created_by`, `record_type`, `title`, `content`, `created_at`.
  - Composite FK `(entity_id, organization_id)` -> `entities(id, organization_id)` after ensuring the referenced unique key exists.
  - Indexes by `(organization_id, entity_id)` and record created date.
  - Enable RLS; revoke `anon`; grant only required operations to `authenticated`.
  - SELECT/INSERT/UPDATE policies use effective permission helper and tenant predicate.
  - No DELETE grant/policy for `entity_records`; contacts use update/inactivation instead of delete.
  - Insert permission rows idempotently.

- [ ] **Step 3: Apply the exact migration to Supabase**
  - Use one named migration and no hard-coded generated IDs.

- [ ] **Step 4: Verify DB behavior**
  - Confirm tables, RLS, grants, indexes and policies.
  - Confirm the four permission keys exist exactly once.
  - Run security and performance advisors and address findings caused by this migration.

- [ ] **Step 5: Update permission taxonomy**
  - Add the new registration groups/keys to the UI ordering so role configuration can display them consistently.

### Task 2: Repositories for contacts and records

**Files:**
- Create: `src/features/registrations/infrastructure/registration-contacts.repository.ts`
- Create: `src/features/registrations/infrastructure/registration-records.repository.ts`

**Interfaces:**
- `listRegistrationContacts(organizationId, entityId)` -> primary legacy contact plus persisted additional contacts at presentation composition time.
- `createRegistrationContact(input)`, `updateRegistrationContact(input)` and `setRegistrationContactActive(...)`.
- `listRegistrationRecords(organizationId, entityId)` -> record rows joined to author profile when available.
- `createRegistrationRecord(input)` -> permanent note.

- [ ] **Step 1: Define exact TypeScript types and normalized error handling** using existing Supabase repository conventions.
- [ ] **Step 2: Implement tenant-scoped reads** with both `organization_id` and `entity_id` filters.
- [ ] **Step 3: Implement contact writes** without DELETE paths.
- [ ] **Step 4: Implement record insert/read** without UPDATE/DELETE exports.
- [ ] **Step 5: Verify repository query shapes against live schema** and ensure no relationship name is guessed.

### Task 3: Toolbar and contatos UI

**Files:**
- Create: `src/features/registrations/presentation/RegistrationDetailsToolbar.tsx`
- Create: `src/features/registrations/presentation/RegistrationContactsPage.tsx`
- Modify: `src/features/registrations/presentation/RegistrationDetails.tsx`
- Modify: `src/features/registrations/presentation/TabRegistrations.tsx`

**Interfaces:**
- Toolbar callbacks: `onOpenContacts`, `onOpenRecords`, `onOpenPermissions`.
- Contacts page gets `registration`, `organizationId`, view/manage capability and close callback.

- [ ] **Step 1: Remove activate/inactivate from `RegistrationDetails`** and remove now-unused state/imports; keep quick actions in `TabRegistrations` untouched.
- [ ] **Step 2: Add toolbar next to role tags** with vertical divider on desktop and responsive wrapping/mobile icon behavior.
- [ ] **Step 3: Add `contacts` route subpage** in `TabRegistrations` and load only when selected.
- [ ] **Step 4: Build contacts page** using shared `AdminPage`, `AdminCard`, `AdminDialog`, form controls and phone/email formatters.
- [ ] **Step 5: Render the entity's current direct phone/WhatsApp/email as the primary contact block** and additional `entity_contacts` below it.
- [ ] **Step 6: Support add/edit/activate/inactivate** for additional contacts when `registrations.contacts.manage` is granted.
- [ ] **Step 7: Confirm mobile layout has no horizontal overflow and actions collapse safely.**

### Task 4: Registros permanentes UI

**Files:**
- Create: `src/features/registrations/presentation/RegistrationRecordsPage.tsx`
- Modify: `src/features/registrations/presentation/TabRegistrations.tsx`
- Reuse patterns from: `src/features/orders/presentation/OrderHistoryPage.tsx`

**Interfaces:**
- Route subpage: `records`.
- Filters: author, date, order asc/desc.
- Creation: note with max 2000 chars and permanent-record notice.

- [ ] **Step 1: Add records subpage routing and permission gates.**
- [ ] **Step 2: Implement record loading and filters** matching the OS history visual language.
- [ ] **Step 3: Implement New record dialog** with author from authenticated user, permanent copy and 2000-char max.
- [ ] **Step 4: Refresh timeline immediately after insert** and preserve filters.
- [ ] **Step 5: Verify no edit/delete affordance exists.**

### Task 5: Root-cause fix for employee access errors

**Files:**
- Modify: `src/features/access/infrastructure/user-access.repository.ts`
- Modify: `src/features/access/presentation/UserAccessSection.tsx` only if field-level feedback is needed.
- Modify: `src/features/registrations/presentation/TabRegistrations.tsx`
- Modify: `supabase/functions/employee-access/index.ts`

**Interfaces:**
- `saveEmployeeAccess(...)` returns an error whose `.message` is the backend JSON `error` when a Function returns non-2xx.
- Edge Function remains authenticated and is the only Auth admin writer.

- [ ] **Step 1: Preserve diagnostic evidence**
  - Deployed `employee-access` is version 1 and differs from current `main`.
  - Current repository throws the generic `FunctionsHttpError` instead of reading its response body.

- [ ] **Step 2: Add a helper to extract Edge Function error JSON**
  - Prefer backend `{ error: string }`.
  - Fall back to function/client error message if body cannot be read.
  - Do not expose stack traces or credentials.

- [ ] **Step 3: Use the helper in `getEmployeeAccess` and `saveEmployeeAccess`** so toasts receive useful messages.
- [ ] **Step 4: Keep frontend validation aligned with backend**: valid email, role required, new password >= 8, existing blank password allowed.
- [ ] **Step 5: Bring Edge Function to the approved `main` behavior** including active-state synchronization and rollback path.
- [ ] **Step 6: Improve Auth error mapping** for duplicate email, invalid email/password and other safe client-facing validation messages.
- [ ] **Step 7: Deploy `employee-access` with `verify_jwt=true`.**
- [ ] **Step 8: Retrieve deployed function again and compare critical blocks** to verify parity.

### Task 6: Integration, build and production checks

**Files:**
- Modify only files required by failures discovered here.

- [ ] **Step 1: Review all permission gates** for contacts, records, access and list quick actions.
- [ ] **Step 2: Confirm route closing/back navigation** returns to registration details/list without stale subpages.
- [ ] **Step 3: Confirm Cliente and Fornecedor detail paths still render.**
- [ ] **Step 4: Trigger/inspect GitHub Actions build for latest main commit** and require `npm run build` success.
- [ ] **Step 5: Run Supabase security/performance advisors after final DB state.**
- [ ] **Step 6: Verify live schema and deployed Edge Function one final time.**
- [ ] **Step 7: Summarize commits, database migration, Edge Function deployment and any remaining manual UI smoke test.**
