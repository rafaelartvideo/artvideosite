import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../../../../docs/logistics/fleet-schema-staging.sql", import.meta.url), "utf8");
const repository = readFileSync(new URL("../infrastructure/logistics.repository.ts", import.meta.url), "utf8");
const map = readFileSync(new URL("../presentation/TabFieldTracking.tsx", import.meta.url), "utf8");

test("fleet schema contains organization-scoped foreign keys and exclusive open shifts", () => {
  for (const key of ["driver_id","vehicle_id","tracker_id"]) {
    assert.match(schema,new RegExp("foreign key\\(organization_id,"+key+"\\)"));
  }
  for (const key of ["driver","vehicle","tracker"]) {
    assert.match(schema,new RegExp("create unique index logistics_active_"+key+".*where ended_at is null"));
  }
});

test("each logistics table enables RLS and restricts access to existing map managers", () => {
  for(const name of ["drivers","vehicles","shifts"]) {
    assert.match(schema,new RegExp("alter table public.logistics_"+name+" enable row level security"));
  }
  assert.match(schema,/private\.can_access_field_tracking\(organization_id,''field_tracking\.view''\)/);
  assert.match(schema,/private\.can_access_field_tracking\(organization_id,''field_tracking\.manage''\)/);
  assert.match(schema,/revoke all on public\.%I from public, anon, authenticated/);
  assert.doesNotMatch(schema,/grant delete/i);
});

test("shift closing is scoped and recorded once",()=>{
  assert.match(repository,/\.eq\("organization_id",org\)\.eq\("id",id\)\.is\("ended_at",null\)/);
  assert.match(schema,/old\.ended_at is not null/);
  assert.match(schema,/new\.ended_by := auth\.uid\(\)/);
  assert.match(schema,/new\.final_odometer_km < old\.initial_odometer_km/);
});
test("fleet is lazy-mounted and scoped to organization",()=>{
  assert.match(map,/workspace==="fleet" && canView && canManage && activeOrganizationId/);
  assert.match(map,/<FleetWorkspace key=\{activeOrganizationId\}/);
});
