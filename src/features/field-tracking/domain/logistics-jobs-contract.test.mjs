import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const schema=readFileSync(new URL("../../../../docs/logistics/jobs-schema-staging.sql",import.meta.url),"utf8");
const repository=readFileSync(new URL("../infrastructure/logistics-jobs.repository.ts",import.meta.url),"utf8");
const page=readFileSync(new URL("../../orders/presentation/OrderDetailsPage.tsx",import.meta.url),"utf8");
test("jobs use same-organization order and shift relationships",()=>{
  assert.match(schema,/foreign key\(organization_id,order_id\)/);
  assert.match(schema,/foreign key\(organization_id,shift_id\)/);
  assert.match(schema,/alter table public.logistics_jobs enable row level security/);
  assert.match(schema,/private\.can_access_field_tracking\(organization_id,'field_tracking.manage'\)/);
  assert.match(schema,/logistics_jobs_unique_open.*organization_id,order_id\)/);
});
test("pickup and delivery do not skip custody checkpoints",()=>{
  assert.match(schema,/old.kind='pickup' and old.status='arrived' and new.status='collected'/);
  assert.match(schema,/old.kind='pickup' and old.status='collected' and new.status='received'/);
  assert.match(schema,/old.kind='delivery' and old.status='assigned' and new.status='loaded'/);
  assert.match(schema,/old.kind='delivery' and old.status='arrived' and new.status='delivered'/);
  assert.match(schema,/new.events := old.events \|\| jsonb_build_array/);
  assert.match(schema,/logistics_shift_close_guard/);
  assert.doesNotMatch(schema,/update public\.service_orders/i);
});
test("updates use the expected state and organization",()=>{
  assert.match(repository,/\.eq\("organization_id",org\)\.eq\("id",job.id\)\.eq\("status",job.status\)/);
  assert.match(page,/!monitorView && !isDisposal && <OrderLogisticsSection/);
});
