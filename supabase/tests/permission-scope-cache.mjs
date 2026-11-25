// Disposable PostgreSQL fixture: no credentials, network, or production writes.
// Install @electric-sql/pglite@0.5.16 outside this repo and set PGLITE_MODULE.
// PERMISSION_SCOPE_CANDIDATE_FILE may point at a migration under development.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

assert.ok(process.env.PGLITE_MODULE, 'Set PGLITE_MODULE to the external PGlite index.js');
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
function definition(sql, name) {
  const start = sql.toLowerCase().indexOf('function ' + name + '(');
  assert.ok(start >= 0, `Missing ${name}`);
  const tail = sql.slice(start);
  const body = tail.match(/\bas\s+(\$[a-z_]*\$)[\s\S]*?\1\s*;?/i);
  assert.ok(body, `Missing function body ${name}`);
  return 'create or replace ' + tail.slice(0, body.index + body[0].length).replace(/;?\s*$/, ';');
}
const migrations = readdirSync(new URL('../migrations/', import.meta.url)).filter(name => name.endsWith('.sql')).sort();
function latestDefinition(name) {
  for (const file of [...migrations].reverse()) {
    const sql = read('../migrations/' + file);
    if (sql.toLowerCase().includes('create or replace function ' + name + '(')) return definition(sql, name);
  }
  throw new Error(`No migration defines ${name}`);
}
const baseline = definition(read('../migrations/20261020090000_individual_permission_denials.sql'), 'public.my_organization_permissions');
const candidate = process.env.PERMISSION_SCOPE_CANDIDATE_FILE
  ? definition(readFileSync(process.env.PERMISSION_SCOPE_CANDIDATE_FILE, 'utf8'), 'public.my_organization_permissions')
  : latestDefinition('public.my_organization_permissions');
const db = new PGlite();
let comparisons = 0;
let baselineCalls = 0;
let optimizedCalls = 0;
try {
  await db.exec(`
    create schema auth; create schema private; create role authenticated nologin;
    create table public.organizations(id uuid primary key,status text,settings jsonb);
    create table public.organization_members(organization_id uuid,user_id uuid,status text,role_id uuid);
    create table public.roles(id uuid primary key,organization_id uuid);
    create table public.permissions(id uuid primary key,key text unique);
    create table public.role_permissions(role_id uuid,permission_id uuid);
    create table public.user_permission_overrides(organization_id uuid,user_id uuid,permission_id uuid,is_allowed boolean);
    create table public.organization_modules(organization_id uuid,module_key text,is_enabled boolean);
    create table public.os_situations(id uuid primary key,organization_id uuid);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('fixture.uid',true),'')::uuid$$;
    create sequence private.scope_calls;
    grant usage on schema public to authenticated;
  `);
  for (const name of ['is_platform_organization', 'is_artvideo_site_organization', 'is_platform_only_permission_key', 'is_artvideo_only_permission_key', 'permission_required_module_keys']) {
    await db.exec(latestDefinition('private.' + name));
  }
  // Sequence instrumentation counts real helper executions without modifying scope logic.
  await db.exec(latestDefinition('private.permission_belongs_to_organization')
    .replace(/\bbegin\b/i, "begin\n  perform nextval('private.scope_calls');"));
  await db.exec(baseline.replace('public.my_organization_permissions(', 'public.fixture_baseline('));
  await db.exec(candidate.replace('public.my_organization_permissions(', 'public.fixture_optimized('));
  await db.exec(`grant execute on function public.fixture_baseline(uuid),public.fixture_optimized(uuid) to authenticated;
    insert into public.organizations values
      ('${id(1)}','active','{"is_platform_operator":true}'),
      ('${id(2)}','active','{}'),('${id(3)}','active','{"is_artvideo_tenant":true}'),
      ('${id(4)}','inactive','{}'),('${id(5)}','active',null),
      ('${id(6)}','active','{"is_platform_operator":true,"is_artvideo_tenant":true}');
    insert into public.os_situations values('${id(901)}','${id(2)}'),('${id(902)}','${id(3)}');
    insert into public.roles values('${id(101)}','${id(1)}'),('${id(102)}','${id(2)}'),('${id(103)}','${id(3)}');
    insert into public.organization_members values
      ('${id(2)}','${id(11)}','active','${id(102)}'),
      ('${id(1)}','${id(12)}','active','${id(101)}'),
      ('${id(3)}','${id(13)}','active','${id(103)}'),
      ('${id(2)}','${id(14)}','inactive','${id(102)}'),
      ('${id(2)}','${id(15)}','active',null),
      ('${id(1)}','${id(16)}','active',null),
      ('${id(1)}','${id(17)}','active','${id(101)}'),
      ('${id(2)}','${id(17)}','active','${id(102)}');`);
  const keys = [
    'organizations.view','organizations.audit.view','integrations.manage','audit.view','orders.monitor.view','platform.management.manage',
    'orders.view','orders.update','customers.view','customer_requests.view','customers.requests.view','technician_panel.view',
    'products.view','categories.view','brands.view','services.view','filters.view','site.view','site_settings.update','contact.view',
    'tools.uniq.use','tools.sac_digital.use','tools.view','pbx.view','finance.view','operation.view','unknown.view',
    `orders.images.situation.${id(901)}.upload`,`orders.images.situation.${id(902)}.upload`,
    `orders.images.situation.${id(903)}.upload`,
    'orders.images.situation.------------------------------------.upload',
    'orders.images.situation.not-a-uuid.upload',
    ...Array.from({length: 200}, (_, n) => `orders.fixture_${n}.view`),
  ];
  for (let n = 0; n < keys.length; n++) await db.query('insert into public.permissions values($1,$2)', [id(1000 + n),keys[n]]);
  await db.exec(`insert into public.role_permissions select r.id,p.id from public.roles r cross join public.permissions p;
    insert into public.organization_modules select o.id,m.key,true from public.organizations o cross join
      (values('orders'),('customers'),('products'),('site_categories'),('site_settings'),('pbx')) m(key);
    insert into public.user_permission_overrides select '${id(2)}','${id(15)}',id,true from public.permissions where key='orders.view';
    insert into public.user_permission_overrides select '${id(1)}','${id(16)}',id,true from public.permissions where key in ('organizations.view','orders.view');`);
  async function execute(name, user, org) {
    await db.exec(`reset role;select setval('private.scope_calls',1,false);set role authenticated;set fixture.uid='${user === null ? '' : id(user)}'`);
    const rows = (await db.query(`select permission_key from public.fixture_${name}($1)`, [org === null ? null : id(org)])).rows.map(row => row.permission_key);
    await db.exec('reset role');
    const sequence = (await db.query('select last_value,is_called from private.scope_calls')).rows[0];
    return {rows,calls: sequence.is_called ? Number(sequence.last_value) : 0};
  }
  async function compare(label,user,org, includes = [], excludes = []) {
    const before = await execute('baseline',user,org);
    const after = await execute('optimized',user,org);
    assert.deepEqual(after.rows,before.rows,label);
    for (const key of includes) assert.ok(after.rows.includes(key),`${label}: missing ${key}`);
    for (const key of excludes) assert.ok(!after.rows.includes(key),`${label}: leaked ${key}`);
    comparisons++;
    baselineCalls += before.calls;
    optimizedCalls += after.calls;
    return {before,after};
  }
  const bulk = await compare('direct tenant',11,2,['orders.view','organizations.audit.view'],['products.view','organizations.view',keys[28],keys[29],keys[30]]);
  assert.ok(bulk.before.calls >= 200, 'Baseline must reproduce repeated scope helper execution');
  assert.ok(bulk.after.calls <= 4, 'Optimized resolver must reserve scope helper calls for dynamic situation keys');
  await compare('own situation belongs; unmatched dynamic format retains original behavior',11,2,[keys[27],keys[31]], [keys[28],keys[29],keys[30]]);
  await compare('platform bypasses contracted modules',12,1,['pbx.view','tools.uniq.use'],['products.view',keys[27]]);
  await compare('artvideo scope',13,3,['products.view',keys[28]],['organizations.view',keys[27]]);
  await compare('platform and artvideo flags together',12,6,['products.view','organizations.view','tools.uniq.use'],[keys[27],keys[28]]);
  await compare('override-only direct membership',15,2,['orders.view'],['orders.update']);
  await compare('override-only platform fallback',16,2,['orders.view'],['orders.update']);
  for (const user of [null,11,12,13,14,15,16,17,99]) for (const org of [null,1,2,3,4,5,999]) await compare(`matrix ${user}/${org}`,user,org);
  await db.exec(`delete from public.organization_modules where organization_id='${id(5)}';
    insert into public.organization_modules values('${id(5)}',null,true);`);
  await compare('null module key does not grant module access',12,5,['organizations.audit.view'],['orders.view','products.view','unknown.view']);
  await db.exec(`delete from public.organization_modules where organization_id='${id(5)}';`);
  await compare('empty module list',12,5,['organizations.audit.view'],['orders.view','products.view']);
  // Changes are observed on the next call: no stale permission/module/settings cache.
  await db.exec(`update public.organization_modules set is_enabled=false where organization_id='${id(2)}' and module_key='orders'`);
  await compare('disabled orders module',11,2,[],['orders.view',keys[27]]);
  await db.exec(`update public.organization_modules set is_enabled=true where organization_id='${id(2)}';
    insert into public.user_permission_overrides select '${id(2)}','${id(17)}',id,false from public.permissions where key='orders.view';`);
  await compare('target deny beats direct and platform grant',17,2,[],['orders.view']);
  await db.exec(`delete from public.os_situations where id='${id(901)}'`);
  await compare('situation deletion revokes dynamic grant immediately',11,2,[],[keys[27]]);
  await db.exec(`delete from public.role_permissions where role_id='${id(101)}' and permission_id=(select id from public.permissions where key='organizations.view');`);
  const revoked = await compare('platform view access revoked',12,2);
  assert.deepEqual(revoked.after.rows,[]);
  await db.exec(`update public.organization_members set status='inactive' where user_id='${id(11)}'`);
  assert.deepEqual((await compare('direct membership revoked',11,2)).after.rows,[]);
  await db.exec(`update public.organizations set settings='{"is_artvideo_tenant":false}' where id='${id(3)}'`);
  await compare('artvideo setting revoked',13,3,[],['products.view']);
  await db.exec(`update public.organizations set status='inactive' where id='${id(3)}'`);
  assert.deepEqual((await compare('organization deactivated',13,3)).after.rows,[]);
  console.log(JSON.stringify({passed:true,comparisons,baselineScopeCalls:baselineCalls,optimizedScopeCalls:optimizedCalls,
    limitations:'Synthetic data and disposable PostgreSQL engine; imports real scope classifiers/module map/helper and SQL RPCs. Does not test network, production query plans, RLS configuration, or production deployment.'}));
} finally {
  await db.close();
}
