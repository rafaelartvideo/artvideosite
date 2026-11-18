// Isolated experiment; never connects to Supabase or reads database credentials.
// Requires an independently installed @electric-sql/pglite 0.5.16:
// $env:PGLITE_MODULE='C:/external/node_modules/@electric-sql/pglite/dist/index.js'
// node supabase/tests/notification-payload-materialization.mjs
// Optional: FIXTURE_ROWS=100 or 10000; FIXTURE_BLOCKS=32 or 256 (32 bytes/block).
// No candidate below is a production migration: both have measured tradeoffs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

assert.ok(process.env.PGLITE_MODULE, 'Set PGLITE_MODULE to the external PGlite module path; no repository dependency is installed.');
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const rowCount = Number(process.env.FIXTURE_ROWS || 10000);
const payloadBlocks = Number(process.env.FIXTURE_BLOCKS || 32);
assert.ok(Number.isSafeInteger(rowCount) && rowCount >= 100 && rowCount <= 100000);
assert.ok(Number.isSafeInteger(payloadBlocks) && payloadBlocks >= 1 && payloadBlocks <= 1024);
const baseline = read('../migrations/20261108194500_optimize_notification_scope_delivery.sql');
const latePayload = baseline
  .replace('select n.*\n  from public.organization_notifications n', 'select n.id, n.module_key, n.recipient_user_id, n.created_at\n  from public.organization_notifications n')
  .replace("'delivery_allowed', n.delivery_allowed", "'delivery_allowed', selected.delivery_allowed")
  .replace('from recent n\n    left join', 'from recent selected\n    join public.organization_notifications n on n.id = selected.id\n    left join');
const narrowAuthorized = baseline
  .replace('select n.*,\n', 'select n.id, n.created_at,\n')
  .replace("'delivery_allowed', n.delivery_allowed", "'delivery_allowed', selected.delivery_allowed")
  .replace('from recent n\n    left join', 'from recent selected\n    join visible_notifications n on n.id = selected.id\n    left join');
assert.notEqual(latePayload, baseline);
assert.notEqual(narrowAuthorized, baseline);
const candidates = { baseline, latePayload, narrowAuthorized };
const db = new PGlite();
try {
  const [setup, seed] = read('./notification-payload-materialization-fixture.sql').split('-- FIXTURE SEED');
  await db.exec(setup);
  const policies = read('../migrations/20261107212000_notifications_meaningful_events_and_permissions.sql');
  for (const name of ['notification_scope_v1', 'notification_is_relevant_v1']) {
    const start = policies.indexOf(`create or replace function private.${name}`);
    assert.ok(start >= 0);
    await db.exec(policies.slice(start, policies.indexOf('$$;', start) + 3));
  }
  const start = policies.indexOf('create policy organization_notifications_select');
  assert.ok(start >= 0);
  await db.exec(policies.slice(start, policies.indexOf('\n);', start) + 4));
  const foundation = read('../migrations/20261002230216_organization_notifications_foundation.sql');
  const readsStart = foundation.indexOf('create policy organization_notification_reads_select');
  assert.ok(readsStart >= 0);
  await db.exec(foundation.slice(readsStart, foundation.indexOf('\n);', readsStart) + 4));
  for (const [name, sql] of Object.entries(candidates)) {
    await db.exec(sql.replace('public.load_admin_notifications_v1(', `public.fixture_${name.toLowerCase()}(`));
  }
  await db.exec(seed.replace('generate_series(1,32)', `generate_series(1,${payloadBlocks})`).replace('generate_series(1,10000)', `generate_series(1,${rowCount})`));
  const user = '00000000-0000-0000-0000-000000000011';
  const org = '00000000-0000-0000-0000-000000000001';
  const variants = [
    'baseline', 'personalReceive', 'noReceive', 'noPersonalView', 'noInboxView',
  ];
  let cases = 0;
  for (const variant of variants) {
    // Modify synthetic grants as the fixture owner, then return to the role that
    // cannot bypass RLS. Production helpers and policies are never altered.
    await db.exec(`reset role; delete from private.permissions;
      insert into private.permissions select organization_id,user_id,key from private.memberships
      cross join unnest(array['notifications.view','notifications.orders.view','notifications.orders.receive','notifications.finance.view','notifications.personal.view']) key;`);
    if (variant === 'personalReceive') await db.exec(`insert into private.permissions values ('${org}','${user}','notifications.personal.receive')`);
    if (variant === 'noReceive') await db.exec("delete from private.permissions where key like '%.receive'");
    if (variant === 'noPersonalView') await db.exec("delete from private.permissions where key='notifications.personal.view'");
    if (variant === 'noInboxView') await db.exec("delete from private.permissions where key='notifications.view'");
    await db.exec('set role authenticated');
    const role = (await db.query('select rolsuper,rolbypassrls from pg_roles where rolname=current_user')).rows[0];
    assert.equal(role.rolsuper, false);
    assert.equal(role.rolbypassrls, false);
    for (const caller of [user, '00000000-0000-0000-0000-000000000012', '']) {
      await db.exec(`set fixture.uid='${caller}'`);
      for (const tenant of [org, '00000000-0000-0000-0000-000000000002']) {
        for (const limit of [null, -1, 0, 1, 2, 50, 100, 101]) {
          const result = (await db.query(`select
            public.fixture_baseline($1,$2) as baseline,
            public.fixture_latepayload($1,$2) as late,
            public.fixture_narrowauthorized($1,$2) as narrow`, [tenant, limit])).rows[0];
          assert.deepEqual(result.late, result.baseline, `late payload ${variant}/${caller}/${tenant}/${limit}`);
          assert.deepEqual(result.narrow, result.baseline, `narrow authorized ${variant}/${caller}/${tenant}/${limit}`);
          const { items, unreadCount } = result.baseline;
          assert.ok(items.length <= Math.max(1, Math.min(limit ?? 50, 100)));
          if (caller !== user || tenant !== org || variant === 'noInboxView') assert.deepEqual(result.baseline, { items: [], unreadCount: 0 });
          else assert.ok(items.length > 0, 'RLS equivalence must include visible rows');
          if (variant === 'noReceive') assert.equal(unreadCount, 0);
          for (let i = 0; i < items.length; i++) {
            assert.notEqual(items[i].actor_user_id, caller);
            assert.ok(items[i].recipient_user_id === null || items[i].recipient_user_id === caller);
            assert.notEqual(items[i].id % 29, 0, 'dismissed notifications stay hidden');
            assert.equal(items[i].read_at !== null, items[i].id % 2 === 0, 'other users read/dismiss state must not affect this inbox');
            if (variant === 'noPersonalView') assert.equal(items[i].recipient_user_id, null);
            if (items[i].recipient_user_id !== null && variant !== 'personalReceive') assert.equal(items[i].delivery_allowed, false);
            if (i > 0) assert.ok(items[i - 1].created_at > items[i].created_at || (items[i - 1].created_at === items[i].created_at && items[i - 1].id > items[i].id));
          }
          cases++;
        }
      }
    }
  }
  console.log(JSON.stringify({ equivalenceCasesPerCandidate: cases, rowCount, payloadBlocks }));
  // Restore baseline grants and benchmark exactly the extracted RPC bodies so
  // EXPLAIN exposes materializations instead of hiding the SQL function plan.
  await db.exec(`reset role; insert into private.permissions values ('${org}','${user}','notifications.view'); set role authenticated; set fixture.uid='${user}'`);
  console.log(JSON.stringify((await db.query('select version() as postgres')).rows[0]));
  const walk = node => [node, ...(node.Plans || []).flatMap(walk)];
  for (const [name, sql] of Object.entries(candidates)) {
    const body = sql.split('$function$')[1].replaceAll('p_organization_id', `'${org}'::uuid`).replaceAll('p_limit', '50');
    await db.query(body);
    const runs = [];
    for (let i = 0; i < 3; i++) {
      const plan = (await db.query(`explain(analyze,buffers,format json) ${body}`)).rows[0]['QUERY PLAN'][0];
      runs.push({ milliseconds: plan['Execution Time'], tempReadBlocks: plan.Plan['Temp Read Blocks'], tempWrittenBlocks: plan.Plan['Temp Written Blocks'],
        materializations: walk(plan.Plan).filter(n => (n['Subplan Name'] || '').startsWith('CTE ')).map(n => ({ name: n['Subplan Name'], width: n['Plan Width'], actualRows: n['Actual Rows'] })),
        payloadScans: walk(plan.Plan).filter(n => n['Relation Name'] === 'organization_notifications').map(n => ({ node: n['Node Type'], index: n['Index Name'], loops: n['Actual Loops'], rows: n['Actual Rows'] })) });
    }
    console.log(JSON.stringify({ candidate: name, runs }));
  }
} finally {
  await db.close();
}
