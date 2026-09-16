# Service Order Solution Reversal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auditable multi-attempt OS solutions with safe undo, pending part returns, preserved historical media, and no automatic Situation change.

**Architecture:** Keep `service_orders` as the active/current solution projection and add immutable attempt/item/media snapshot tables for audit. Extend the existing solve RPC to create an attempt and add one atomic undo RPC that converts used parts back into existing custody return-pending state, clears the active solution projection, and preserves history. The React layer reads attempt history through a focused repository, adds an undo dialog, and routes to a solution-records page modeled after the existing Situation records page.

**Tech Stack:** React + TypeScript + Supabase/PostgreSQL + existing Admin UI primitives.

**Spec:** `docs/superpowers/specs/2026-09-16-service-order-solution-reversal-design.md`

## Global Constraints

- Solving or undoing must never modify `service_orders.situation_id`.
- Undo is forbidden when `completed_at is not null` or the OS is cancelled.
- Used parts become return-pending; inventory is not increased until the existing warehouse return-receipt flow confirms physical receipt.
- TEST-derived resolution parts return through the original TEST custody item.
- Reverted solution images disappear from active Documents > Solução but remain in attempt history.
- Existing fixed lifecycle Status behavior remains unchanged.
- Do not introduce a new test framework; this repository currently has only `vite build` and `vite dev` scripts.

---

### Task 1: Database history and atomic reversal

**Files:**
- Create: `supabase/migrations/20260916143000_service_order_solution_attempts_and_undo.sql`

**Produces:**
- `public.service_order_solution_attempts`
- `public.service_order_solution_attempt_items`
- `public.service_order_solution_attempt_media`
- extended `public.resolve_service_order_with_loose_parts(...)` returning `solution_attempt_id`
- `public.attach_service_order_solution_media(uuid, uuid, uuid, integer)`
- `public.undo_service_order_solution(uuid, text)`

- [ ] Create the three audit tables, indexes, tenant-aware RLS policies, and grants.
- [ ] Backfill currently solved OS as attempt 1, snapshotting current used items and current solution media (`sort_order >= 1000`).
- [ ] Replace the resolution wrapper so it preserves `situation_id`, calls the existing resolution validation, creates the next attempt number, snapshots used items, and returns the attempt id.
- [ ] Add media-attachment RPC that verifies the attempt belongs to the OS and inserts both active `service_order_media` and durable attempt-media snapshot rows.
- [ ] Add undo RPC that locks the OS/current attempt, rejects closed/cancelled/unsolved OS, validates complete custody mapping first, creates `RETURN_REGISTERED` pending returns on normal or source TEST custody rows, marks the attempt reverted, deletes active used-item rows and active solution-media links, and clears only current solution projection fields.
- [ ] Ensure undo uses the existing `app.resolve_service_order` workflow flag so the direct-update guard accepts the controlled reversal while preserving `situation_id`.
- [ ] Apply the migration in Supabase and query information_schema/pg_proc to verify objects/signatures exist.

### Task 2: Solution history repository

**Files:**
- Create: `src/features/orders/infrastructure/order-solution-history.repository.ts`
- Modify: `src/features/orders/infrastructure/order-resolution-extra.repository.ts`

**Produces:**
- `listServiceOrderSolutionAttempts(organizationId, serviceOrderId)`
- `attachServiceOrderSolutionMedia({ organizationId, serviceOrderId, attemptId, mediaId, sortOrder })`
- `undoServiceOrderSolution({ organizationId, serviceOrderId, reason })`
- `resolveServiceOrderWithLooseParts(...)` result exposes `solution_attempt_id`

- [ ] Add typed attempt/item/media shapes and query nested snapshots, media metadata, solver/reverter profile names.
- [ ] Add tenant assertion before RPC calls, matching existing repository style.
- [ ] Update resolution repository result handling without changing callers unrelated to solution history.

### Task 3: Resolution application flow

**Files:**
- Modify: `src/features/orders/application/useOrderResolution.ts`

**Produces:**
- solution attempt list/count state
- `loadSolutionAttempts(orderId)`
- undo-dialog state and `undoOrderSolution(reason)`
- solve flow attaches uploaded solution images to the returned attempt id

- [ ] Load attempts when opening/detail-refreshing a solved or historically solved OS.
- [ ] After the solve RPC, require/consume `solution_attempt_id` and use the new media-attachment RPC for each new solution image instead of direct `insertServiceOrderMedia`.
- [ ] Add undo flow that calls the atomic RPC, refreshes detail/used items/media/part requests/orders, clears active solution image state, and reloads attempt history.
- [ ] Surface concise success/error messages, including the fact that returned parts are pending warehouse receipt.

### Task 4: Undo dialog and Solution Records page

**Files:**
- Create: `src/features/orders/presentation/OrderUndoSolutionDialog.tsx`
- Create: `src/features/orders/presentation/OrderSolutionRecordsPage.tsx`

**Produces:**
- destructive confirmation dialog with required reason
- records page showing all attempts, active/reverted state, actor/timestamps, reason, diagnosis, solution, loose parts, snapshotted items/prices and images

- [ ] Mirror `OrderCancelDialog` for the undo reason UX and clearly explain pending warehouse return.
- [ ] Mirror `OrderSituationRecordsPage` page structure/mobile bottom-safe toolbar for solution history.
- [ ] Render media via existing storage URL/image patterns without reactivating them in Documents.

### Task 5: Solution section and routing

**Files:**
- Modify: `src/features/orders/presentation/OrderSolutionSummary.tsx`
- Modify: `src/features/orders/presentation/OrderDetailsPage.tsx`
- Modify: `src/features/orders/presentation/TabOrders.tsx`

**Produces:**
- `Registros` action with cumulative solution count
- `Desfazer solução` action when solved, permitted, and not financially closed
- `solution-records` routed detail subpage
- clean historical indicator when no active solution remains but attempts exist

- [ ] Add solution actions in the Section header using existing Admin buttons/icons.
- [ ] Keep current active details unchanged when solved.
- [ ] When unsolved with historical attempts, show only history/count access, never stale reverted content.
- [ ] Add `solution-records` to both detail-subpage unions and permission routing using `orders.section.solution`/existing view permissions.
- [ ] Mount undo dialog from the details page and wire it to the resolution hook.

### Task 6: Verification

**Files:** none

- [ ] Re-fetch every modified file from `main` and compare commit diffs for unintended changes.
- [ ] Verify the database has one active-attempt partial unique index and the undo/attach RPC signatures.
- [ ] Verify `situation_id` is neither assigned nor updated by the new solve/undo functions.
- [ ] Verify the undo RPC contains `completed_at` and `cancelled_at` guards before any custody mutation.
- [ ] Do not claim build/test success unless explicitly run; repository has no test runner and the user did not request build execution.
