# Service Order Solution Reversal Design

## Goal

Allow a solved service order to be safely reverted while preserving a complete audit trail, without changing the service-order Situation automatically and without returning parts to stock before the warehouse physically receives them.

## Confirmed business rules

- Solving an OS must not change `situation_id`.
- Reverting a solution must not change `situation_id`.
- Solution history is independent from Situation/SLA history.
- The active Solution section shows only the current active solution.
- Reverted solutions disappear from the active section and remain available only in Solution Records.
- A service order may be solved multiple times while it remains financially open.
- The UI must show a cumulative solved-attempt count and a `Registros` action.
- A solved OS that is not financially closed may expose a `Desfazer solução` action.
- A financially closed OS (`completed_at is not null`) can never have its solution reverted, including via direct RPC calls.
- Reverting a solution requires a reason and records actor/date/time.
- Solution images are resolution-owned media, not Situation media.
- When a solution is reverted, active solution-image links are removed from Documents > Solução, but the media remain preserved in the solution-attempt history.
- Used parts are not immediately added back to inventory when the solution is reverted.
- Reverting marks the physical parts as pending return using the existing custody workflow. Inventory increases only when the warehouse confirms receipt through the existing return-receipt operation.
- For normal resolution parts, the pending return is registered on the request item physically delivered to the technician.
- For resolution parts derived from TEST requests, the pending return is registered on the original TEST custody item referenced by `source_test_item_id`.
- Every stock return remains auditable through the existing custody events and inventory movement history.

## Data model

Create an immutable solution-attempt history:

### `service_order_solution_attempts`

One row for every successful solve action.

Key fields:
- `id`
- `organization_id`
- `service_order_id`
- `attempt_number`
- `diagnosis`
- `solution`
- `loose_parts`
- `solved_at`
- `solved_by`
- `reverted_at`
- `reverted_by`
- `revert_reason`
- `created_at`

Only one non-reverted attempt may exist for an OS at a time.

### `service_order_solution_attempt_items`

Snapshots the parts used in each attempt so later changes to `service_order_used_items`, inventory names, or prices do not erase the historical solution.

Fields include:
- `solution_attempt_id`
- `inventory_item_id`
- `inventory_name_snapshot`
- `unit_snapshot`
- `quantity`
- `unit_sale_price`
- `total_sale_price`

### `service_order_solution_attempt_media`

Snapshots media belonging to an attempt.

Fields include:
- `solution_attempt_id`
- `media_id`
- `sort_order`
- `file_name_snapshot`

Active solution images continue to use `service_order_media` with `sort_order >= 1000`; the attempt-media table is the durable audit relation.

## Solve transaction

Extend the existing resolution workflow rather than creating a competing path.

A successful solve must:
1. Validate permissions, OS ownership, open/cancelled/completed state, test-part state, custody, and used-part quantities using the current rules.
2. Preserve `situation_id` unchanged.
3. Save the active solution (`diagnosis`, `solution`, `loose_parts`, `is_solved`).
4. Save the current `service_order_used_items` state.
5. Create a new `service_order_solution_attempts` row with the next `attempt_number`.
6. Snapshot used items into `service_order_solution_attempt_items`.
7. Return the new attempt id to the frontend.
8. As each solution image is uploaded, link it to the active OS through `service_order_media` and snapshot the same media in `service_order_solution_attempt_media` for the returned attempt id.

Legacy currently-solved orders are backfilled as attempt 1, including used-item and existing solution-image snapshots where available.

## Revert transaction

Expose one server-side RPC for reversal so all state changes happen atomically.

`undo_service_order_solution(service_order_id, reason)` must:
1. Require authentication and `orders.solve`.
2. Lock the OS.
3. Reject cancelled OS.
4. Reject unsolved OS.
5. Reject financially closed OS (`completed_at is not null`).
6. Require a non-empty reason.
7. Locate and lock the current non-reverted solution attempt.
8. Ensure all current used-part quantities can be mapped back to custody rows before modifying anything.
9. For each current used quantity:
   - normal resolution item: increment its `return_pending_quantity`;
   - TEST-derived resolution item: increment the original TEST item's `return_pending_quantity`;
   - insert a `RETURN_REGISTERED` custody event with an automatic reversal note.
10. Mark the attempt reverted with actor/date/reason.
11. Preserve all attempt-item and attempt-media snapshots.
12. Remove active `service_order_used_items` rows.
13. Remove active solution image links (`service_order_media.sort_order >= 1000`) without deleting the underlying media objects.
14. Clear active `diagnosis`, `solution`, solution-only loose-parts value, `is_solved`, and solved metadata so the Solution section is clean for another solve.
15. Preserve `situation_id` exactly as it was.
16. Return success plus attempt/count metadata.

The RPC must fail entirely if custody cannot be mapped safely. It must never partially revert a solution.

## UI

### Active `Solução da OS` section

When solved:
- show solved badge/date/actor;
- show current diagnosis, solution, loose parts, used items, and active solution images;
- show `Registros` with a count badge representing total successful solve attempts;
- show `Desfazer solução` when the OS is not financially closed and the user has `orders.solve`.

When not solved but historical attempts exist:
- do not show stale diagnosis/solution/images as active;
- show a compact historical indicator with the total solve count and a `Registros` button.

### Undo dialog

- Title: `Desfazer solução`
- Explain that used parts will become pending return and only re-enter stock after warehouse receipt.
- Required `Motivo` field.
- Confirm button uses destructive styling.
- Closed OS never exposes the action.

### Solution Records page

Follow the visual pattern of `OrderSituationRecordsPage` but use solution semantics.

Each attempt card shows:
- `1ª solução`, `2ª solução`, etc.;
- active/reverted state;
- solved date/user;
- reverted date/user/reason when applicable;
- diagnosis;
- solution;
- loose parts;
- snapshotted used parts and prices;
- snapshotted solution images.

The current active attempt is visually identified.

## Repository/application boundaries

Add a focused solution-history repository for:
- listing attempts and nested snapshots;
- attaching uploaded media to an attempt;
- calling the undo RPC.

Keep the existing `useOrderResolution` hook responsible for active solve/undo orchestration and local detail refresh.

## Safety and compatibility

- No automatic Situation transition is introduced.
- Existing financial completion continues to require `is_solved = true`.
- The fixed lifecycle Status behavior remains unchanged: solving does not close the OS; financial completion sets `completed_at` and therefore Status `Fechada`.
- Existing part dispatch/return/receive flows remain the source of truth for physical stock custody.
- Existing solution media remain compatible through `sort_order >= 1000`.
- Existing solved OS rows are backfilled into solution-attempt history so the records UI has a starting point.
