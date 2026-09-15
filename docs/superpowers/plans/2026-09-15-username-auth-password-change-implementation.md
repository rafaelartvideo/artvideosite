# Username Authentication and Password Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace admin e-mail login with globally unique usernames, add automatic username availability checks and pre-login password change, while preserving Supabase Auth and existing multi-company authorization.

**Architecture:** Add a globally unique normalized `profiles.username`; keep Auth e-mail as an internal credential identifier. A public username-auth Edge Function resolves username server-side for login/password change, while the authenticated employee-access Edge Function handles availability checks and access provisioning. The browser never receives another user's e-mail.

**Tech Stack:** React + TypeScript + Supabase Auth/Postgres/Edge Functions + React Query.

**Spec:** `docs/superpowers/specs/2026-09-15-username-auth-password-change-design.md`

## Global Constraints

- Username is globally unique and case-insensitive.
- Store normalized lowercase username, 3–32 chars, `[a-z0-9._-]`, starting with an alphanumeric character.
- Do not expose profile e-mails or usernames through public table policies.
- Keep current organization memberships/permissions unchanged.
- Keep contact e-mail independent from login identity.
- Password minimum remains 8 characters.
- Reuse existing eye/eye-off password controls.
- Checklist progress badge turns green only for checklist `status = completed`.

---

### Task 1: Checklist completion badge

**Files:**
- Modify: `src/features/checklists/presentation/OrderChecklistToolbarButton.tsx`

**Interfaces:**
- Consumes: `OrderChecklist.status`, `checklistProgress()`.
- Produces: toolbar progress badge class derived from true checklist completion.

- [ ] Verify the existing badge is always blue.
- [ ] Change badge class to emerald only when `query.data?.status === "completed"`; otherwise keep primary blue.
- [ ] Inspect resulting source and confirm progress text is unchanged.
- [ ] Commit independently.

### Task 2: Username database model and migration

**Files:**
- Create: `supabase/migrations/20260915_global_username_auth.sql`
- Create: `supabase/tests/global_username_auth.sql`

**Interfaces:**
- Produces: `public.profiles.username text`, normalized constraints, global unique index.
- Existing consumers of `profiles` remain valid.

- [ ] Write transactional SQL assertions that require normalized uniqueness and reject duplicate/case-variant usernames.
- [ ] Run the assertions against current production schema and verify they fail because `username` does not yet exist.
- [ ] Add migration: column, migration/backfill, check constraint and global unique index.
- [ ] Apply migration through Supabase.
- [ ] Re-run SQL assertions and verify they pass.
- [ ] Verify all existing profiles now have usernames and no duplicates exist.
- [ ] Commit migration/test files.

### Task 3: Username auth Edge Function

**Files:**
- Create: `supabase/functions/username-auth/index.ts`

**Interfaces:**
- `POST { action: "login", username, password }` -> `{ access_token, refresh_token }` or generic auth error.
- `POST { action: "change_password", username, current_password, new_password }` -> `{ success: true }` or generic error.

- [ ] Implement pure normalization/validation helpers first and exercise them with local/isolated examples where possible.
- [ ] Implement server-side profile lookup by normalized username using service role.
- [ ] Implement login by resolving Auth e-mail server-side and authenticating through anon client.
- [ ] Reject inactive profiles after credential validation.
- [ ] Implement current-password verification before admin password update.
- [ ] Keep login failures generic and do not return e-mail/profile data.
- [ ] Deploy with JWT verification disabled because both operations occur before login and the function performs credential verification itself.
- [ ] Exercise invalid username, invalid password and valid password-change behavior without exposing account metadata.
- [ ] Commit function source.

### Task 4: Employee access username provisioning and availability

**Files:**
- Modify: `supabase/functions/employee-access/index.ts`
- Modify: `src/features/access/infrastructure/user-access.repository.ts`

**Interfaces:**
- `EmployeeAccess` adds `username`.
- `SaveEmployeeAccessInput` replaces login e-mail input with `username`.
- New repository call `checkEmployeeUsernameAvailability(organizationId, employeeId, username)`.
- Edge action `check_username` -> `{ success: true, available, username }`.

- [ ] Extend access loading to return current profile username.
- [ ] Add authenticated `check_username` action with existing permission checks and own-user exclusion.
- [ ] Normalize/validate username on upsert and reject duplicates server-side.
- [ ] For new Auth users, generate a private synthetic e-mail from username; preserve existing Auth e-mails for existing users.
- [ ] Upsert `profiles.username` with the access links.
- [ ] Update repository types/payloads.
- [ ] Deploy updated employee-access function.
- [ ] Verify same username is accepted for the current employee during edit, but rejected for another employee.
- [ ] Commit server and repository changes.

### Task 5: Employee access UI with automatic availability

**Files:**
- Modify: `src/features/access/presentation/UserAccessSection.tsx`
- Modify: `src/features/registrations/presentation/RegistrationEditor.tsx`
- Modify: `src/features/registrations/presentation/TabRegistrations.tsx`

**Interfaces:**
- `EmployeeAccessFormState.email` becomes `username`.
- `UserAccessSection` receives employee context required by the availability check.

- [ ] Replace login e-mail field/copy helper with `Usuário` field.
- [ ] Normalize input visually to lowercase without silently accepting invalid spaces/characters.
- [ ] Add debounce around valid candidates.
- [ ] Show `Verificando...`, green `Usuário disponível`, red `Usuário já está em uso`, and syntax feedback.
- [ ] Preserve username availability for unchanged existing username.
- [ ] Block save for enabled new/changed access until valid/available.
- [ ] Update access hydration, validation and save payload in registrations.
- [ ] Preserve role, active state, password and Uniq behavior.
- [ ] Commit UI changes.

### Task 6: Frontend username authentication repository

**Files:**
- Modify: `src/features/auth/infrastructure/auth.repository.ts`

**Interfaces:**
- `authenticateAdmin(username, password)` installs returned Supabase session.
- New `changeAdminPassword(username, currentPassword, newPassword)`.

- [ ] Replace direct browser `signInWithPassword(email)` with username-auth function invocation.
- [ ] Normalize Edge Function errors into stable result codes/messages.
- [ ] Install returned session using `supabase.auth.setSession`.
- [ ] Preserve inactive-user behavior.
- [ ] Add password-change repository call.
- [ ] Commit repository changes.

### Task 7: Login and password-change UI

**Files:**
- Modify: `src/features/auth/presentation/AdminLogin.tsx`

**Interfaces:**
- Default mode: username/password login.
- Change mode: username/current/new/confirm password.

- [ ] Rename e-mail state/field to username and update icon/input attributes.
- [ ] Keep existing password eye control.
- [ ] Add `Alterar senha` action.
- [ ] Add current/new/confirm password fields with independent visibility controls.
- [ ] Validate minimum 8 chars and confirmation equality before request.
- [ ] On success, return to login with username preserved and success feedback.
- [ ] Ensure mobile layout remains within current login card width.
- [ ] Commit login UI.

### Task 8: Verification and compatibility audit

**Files:**
- Inspect all files changed above plus `src/lib/auth.ts` and access callers.

**Interfaces:**
- No new API contract beyond prior tasks.

- [ ] Search the repo for remaining login-e-mail wording and `accessForm.email` references.
- [ ] Verify no public policy exposes username/e-mail lookup.
- [ ] Verify existing users retained Auth e-mail and received username.
- [ ] Verify new user access can be created with username/password and no login e-mail input.
- [ ] Verify username availability detects collision regardless of case.
- [ ] Verify login succeeds with username and wrong password remains generic.
- [ ] Verify password change rejects wrong current password and accepts correct current password.
- [ ] Verify old password fails and new password succeeds afterward.
- [ ] Run Vite build if executable environment is available; otherwise explicitly report that no full build ran.
- [ ] Inspect GitHub status/CI for final commits before claiming completion.
