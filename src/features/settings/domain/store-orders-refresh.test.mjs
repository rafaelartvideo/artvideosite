import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Store order refresh uses scoped complete snapshots instead of an unrelated historical item window", () => {
  const source = readFileSync("src/features/settings/presentation/SiteStoreOrdersPage.tsx", "utf8");
  assert.match(source, /loadStoreOrdersSnapshot/);
  assert.doesNotMatch(source, /ascending: true \}\)\.limit\(2000\)/);
});

const helpers = () => import("../application/store-orders-refresh.mjs");
function mockClient(tables, cap = 73) {
  const calls = [];
  return { calls, from(table) {
    let rows = [...(tables[table] || [])], from = 0, to = Infinity;
    const call = { table, scoped: false }; calls.push(call);
    const query = {
      select() { return query; },
      eq(key, value) { rows = rows.filter(row => row[key] === value); return query; },
      in(key, values) { call.scoped = true; call.filterSize = values.length; rows = rows.filter(row => values.includes(row[key])); return query; },
      order(key, options = {}) { rows.sort((a,b) => String(a[key]).localeCompare(String(b[key])) * (options.ascending === false ? -1 : 1)); return query; },
      range(a,b) { from = a; to = b; return query; },
      abortSignal() { return query; },
      then(resolve, reject) { return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + cap)), count: rows.length, error: null }).then(resolve, reject); },
    };
    return query;
  } };
}

test("Newest multi-item orders retain all scoped items beyond historical and response caps", async () => {
  const { loadStoreOrdersSnapshot } = await helpers();
  const rows = Array.from({length: 2401}, (_,i) => ({id:`line-${String(i).padStart(5,"0")}`, order_id:"new", organization_id:"org", quantity:2, unit_price:3}));
  const client = mockClient({
    artvideo_store_orders: [{id:"new",organization_id:"org",created_at:"2026-11-18"}],
    artvideo_store_order_items: [...Array.from({length:2100},(_,i)=>({id:`old-${i}`,order_id:"old",organization_id:"org"})), ...rows],
    artvideo_store_fulfillments: [{order_id:"new",organization_id:"org",status:"ready"}],
    artvideo_store_support_cases: [{id:"case",order_id:"new",organization_id:"org",status:"open"}],
  });
  const snapshot = await loadStoreOrdersSnapshot(client, "org", new AbortController().signal);
  assert.equal(snapshot.lines.length, 2401);
  assert.equal(snapshot.lines.reduce((sum,row)=>sum+row.quantity*row.unit_price,0),14406);
  assert.equal(new Set(snapshot.lines.map(row=>row.id)).size,2401);
  assert.ok(client.calls.filter(call=>call.table!=="artvideo_store_orders").every(call=>call.scoped));
  assert.equal(snapshot.fulfillments[0].status,"ready");
});

test("An empty order window never scans child tables", async () => {
  const { loadStoreOrdersSnapshot } = await helpers();
  const client = mockClient({});
  assert.deepEqual(await loadStoreOrdersSnapshot(client,"org",new AbortController().signal), {orders:[],lines:[],fulfillments:[],supportCases:[]});
  assert.equal(client.calls.length,1);
});

test("Order windows page through server caps and keep child UUID filters bounded", async () => {
  const { loadStoreOrdersSnapshot } = await helpers();
  const orders=Array.from({length:530},(_,i)=>({id:String(i).padStart(4,"0"),organization_id:"org",created_at:"2026-11-18"}));
  const client=mockClient({artvideo_store_orders:orders,artvideo_store_order_items:orders.map(order=>({id:`line-${order.id}`,organization_id:"org",order_id:order.id}))});
  const snapshot=await loadStoreOrdersSnapshot(client,"org",new AbortController().signal);
  assert.equal(snapshot.orders.length,500); assert.equal(snapshot.lines.length,500);
  assert.ok(client.calls.filter(call=>call.scoped).every(call=>call.filterSize<=100));
});

test("The legacy singleton fallback applies only after a successful complete item lookup", () => {
  const source=readFileSync("src/features/settings/presentation/SiteStoreOrdersPage.tsx","utf8");
  const body=source.match(/const orderLines = \(order: StoreOrder\) => \{([\s\S]*?)\n  \};/)[1];
  const forLines=lines=>new Function("lines",`return order => {${body}}`)(lines);
  const order={id:"order",product_name:"legacy",quantity:1,unit_price:2,inventory_item_id:"inventory"};
  const items=[{id:"real-line-a",order_id:"order",quantity:2,unit_price:3},{id:"real-line-b",order_id:"order",quantity:4,unit_price:5}];
  assert.deepEqual(forLines(items)(order),items);
  assert.equal(forLines([])(order)[0].id,"order");
});

const deferred = () => { let resolve; const promise = new Promise(done=>{resolve=done;}); return {promise,resolve}; };
test("Refreshes are single-flight and publish the final reconciliation after in-flight events", async () => {
  const { createStoreOrdersRefresh } = await helpers();
  const pending=[], applied=[];
  const refresh = createStoreOrdersRefresh({load:()=>{const next=deferred();pending.push(next);return next.promise;},onSnapshot:value=>applied.push(value)});
  const first=refresh.request();
  for(let i=0;i<30;i++) refresh.request(true);
  assert.equal(pending.length,1);
  pending[0].resolve("obsolete"); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(pending.length,2); assert.deepEqual(applied,[]);
  pending[1].resolve("fresh"); await first;
  assert.deepEqual(applied,["fresh"]);
  refresh.dispose();
});

test("Realtime bursts coalesce and disposal aborts and suppresses late snapshots", async () => {
  const { createStoreOrdersRefresh } = await helpers();
  const next=deferred(), applied=[]; let calls=0, signal;
  const refresh=createStoreOrdersRefresh({delay:5,load:abort=>{calls++;signal=abort;return next.promise;},onSnapshot:value=>applied.push(value)});
  for(let i=0;i<30;i++) refresh.schedule();
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(calls,1);
  refresh.dispose(); assert.equal(signal.aborted,true);
  next.resolve("old-company"); await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(applied,[]);
  refresh.schedule(); await refresh.request(); assert.equal(calls,1);
});

test("Company replacement publishes only its own snapshot and cancels scheduled work", async () => {
  const { createStoreOrdersRefresh } = await helpers();
  const old=deferred(), applied=[];
  const first=createStoreOrdersRefresh({load:()=>old.promise,onSnapshot:value=>applied.push(value),delay:5});
  const oldRequest=first.request(); first.schedule(); first.dispose();
  const second=createStoreOrdersRefresh({load:async()=>"new-company",onSnapshot:value=>applied.push(value)});
  await second.request(); old.resolve("old-company"); await oldRequest;
  assert.deepEqual(applied,["new-company"]); second.dispose();
  let calls=0;
  const scheduled=createStoreOrdersRefresh({load:async()=>calls++,onSnapshot:()=>{},delay:5});
  scheduled.schedule(); scheduled.dispose(); await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(calls,0);
});
