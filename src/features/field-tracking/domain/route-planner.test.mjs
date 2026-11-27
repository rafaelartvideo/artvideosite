import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluateRoute,optimizeRoute} from "./route-planner.mjs";
const date=(h,m=0)=>new Date(Date.UTC(2026,10,25,h,m)).toISOString();
const stop=(id,longitude,from=date(8),to=date(12))=>({id,latitude:0,longitude,window_start:from,window_end:to,serviceMinutes:10});
const input=stops=>({origin:{latitude:0,longitude:0},departure:date(8),speedKmh:30,returnToOrigin:true,stops});
test("includes return, service and waiting time",()=>{
  const result=evaluateRoute(input([stop("a",0.01,date(9),date(10))]));
  assert.ok(Math.abs(result.km-2.2239)<0.01);
  assert.equal(result.schedule[0].serviceStart,date(9));
  assert.equal(result.schedule[0].departure,date(9,10));
  assert.ok(result.schedule[0].waitMinutes>0);
});
test("optimization prioritizes service windows over geography and preserves every stop",()=>{
  const initial=input([stop("a",0.01,date(10),date(12)),stop("b",0.02,date(8),date(9))]);
  const r=optimizeRoute(initial);
  assert.equal(r.baseline.lateStops,1);
  assert.equal(r.optimized.lateStops,0);
  assert.equal(r.stops[0].id,"b");
  assert.deepEqual(r.stops.map(x=>x.id).sort(),["a","b"]);
});
test("never worsens the existing schedule or changes it to hide an impossible appointment",()=>{
  const initial=input([stop("a",0.1,date(7),date(7,30)),stop("b",0.01,date(7),date(7,30))]);
  const r=optimizeRoute(initial);
  assert.equal(r.optimized.lateStops,2);
  assert.ok(r.optimized.lateMinutes<=r.baseline.lateMinutes);
});
test("rejects duplicate stops, invalid coordinates and invalid service time",()=>{
  assert.throws(()=>evaluateRoute(input([stop("a",0.01),stop("a",0.02)])));
  assert.throws(()=>evaluateRoute(input([stop("a",181)])));
  assert.throws(()=>evaluateRoute(input([{...stop("a",0.01),serviceMinutes:0}])));
});
test("route snapshots are organization-scoped and immutable for authenticated users",()=>{
  const sql=readFileSync(new URL("../../../../docs/logistics/routes-schema-staging.sql",import.meta.url),"utf8");
  assert.match(sql,/foreign key\(organization_id,shift_id\)/);
  assert.match(sql,/alter table public.logistics_route_plans enable row level security/);
  assert.match(sql,/j.organization_id=new.organization_id and j.shift_id=new.shift_id/);
  assert.doesNotMatch(sql,/grant (update|delete)/i);
});
