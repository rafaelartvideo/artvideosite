// Disposable SQL execution: synthetic data only; never connects to a production database.
// Install @electric-sql/pglite@0.5.16 outside this repository and set PGLITE_MODULE.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
assert.ok(process.env.PGLITE_MODULE, 'Set PGLITE_MODULE to an external PGlite install.');
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8').replaceAll('\r\n','\n');
const id = n => '00000000-0000-0000-0000-' + String(n).padStart(12,'0');
function definition(sql,name) {
 const start = sql.toLowerCase().indexOf('function public.'+name+'(');
 assert.ok(start >= 0);
 const text=sql.slice(start);
 const body=text.match(/\bas\s+(\$[a-z_]*\$)[\s\S]*?\1\s*;/i);
 assert.ok(body);
 return 'create or replace '+text.slice(0,body.index+body[0].length);
}
const db=new PGlite();
try {
 await db.exec('set check_function_bodies=off;'+read('./technician-permission-cache-fixture.sql')+'set check_function_bodies=on;');
 // This production assignment/tenant/module helper is executed unchanged. Its lower
 // permission, membership and access-window dependencies use synthetic fixture grants.
 const secure=read('../migrations/20261014190000_technician_order_secure_details_actions.sql');
 const helperStart=secure.indexOf('create or replace function private.can_access_technician_order_v1(');
 const helper=secure.slice(helperStart,secure.indexOf('$$;',helperStart)+3);
 await db.exec(helper.replace('private.can_access_technician_order_v1(','private.fixture_real_access('));
 await db.exec(`create function private.can_access_technician_order_v1(ord uuid,perm text default 'technician_panel.view')
 returns boolean language plpgsql stable security definer set search_path='' as $$
 begin perform nextval('private.access_calls'); return private.fixture_real_access(ord,perm); end $$;`);
 const detailBaseline=definition(read('../migrations/20261028124442_technician_customer_document_permission.sql'),'get_my_technician_order_details_v1');
 // Exact live list baseline: it intentionally excludes order_services_completed.
 const listBaseline=definition(read('../migrations/20261015084000_employee_self_schedule_and_technician_order_counts.sql'),'list_my_technician_tasks_v1');
 const candidate=read('../migrations/20261124125650_optimize_technician_permission_evaluation.sql');
 for(const [name,baseline] of [['get_my_technician_order_details_v1',detailBaseline],['list_my_technician_tasks_v1',listBaseline]]) {
  await db.exec(baseline.replace('public.'+name+'(','public.fixture_baseline_'+name+'('));
  await db.exec(definition(candidate,name).replace('public.'+name+'(','public.fixture_candidate_'+name+'('));
 }
 await db.exec(`insert into public.organization_modules values ('${id(1)}','orders',true),('${id(2)}','orders',true);
 insert into private.fixture_memberships values ('${id(1)}','${id(11)}',true),('${id(2)}','${id(12)}',true);
 insert into public.employees values ('${id(21)}','${id(1)}','${id(11)}',true),('${id(22)}','${id(2)}','${id(12)}',true),('${id(23)}','${id(1)}','${id(13)}',true);
 insert into public.customers values ('${id(31)}','${id(1)}','fixture-document',null,'person','Fixture customer','fixture-whatsapp','fixture-phone');
 insert into public.os_situations values ('${id(41)}','${id(1)}','Fixture situation',1,true);
 insert into public.customer_addresses values ('${id(51)}','${id(31)}','${id(1)}','Fixture street','1',null,'District','City','ST','00000000',true,'2026-01-01');
 insert into public.equipment_types values ('${id(61)}','${id(1)}','Fixture equipment');
 insert into public.equipment_brands values ('${id(62)}','${id(1)}','Fixture brand');
 insert into public.equipment_models values ('${id(63)}','${id(1)}','Fixture model');`);
 // 3 own tasks on one order, one other technician, one foreign-tenant task.
 for(const [order,org] of [[101,1],[102,1],[103,2]]) await db.query(`insert into public.service_orders
 (id,organization_id,os_number,is_solved,situation_id,diagnosis,accessories,equipment_condition,equipment_brand_id,equipment_model_id,model,customer_id,service_customer_address_id,internal_notes,equipment_type_id,customer_notes,serial_number,scheduled_at)
 values ($1,$2,$3,false,$4,'diagnosis','accessory','condition',$5,$6,'model',$7,$8,'notes',$9,'problem','serial','2026-11-24')`,
 [id(order),id(org),order,id(41),id(62),id(63),id(31),id(51),id(61)]);
 for(const [n,order,org,employee,status] of [[201,101,1,21,'pending'],[202,101,1,21,'in_progress'],[203,101,1,21,'completed'],[204,102,1,23,'pending'],[205,103,2,22,'pending']]) {
  await db.query(`insert into public.service_order_items values($1,$2,$3,'service','Fixture service','description',1,'2026-01-01')`,[id(n),id(org),id(order)]);
  await db.query(`insert into public.service_order_item_tasks(item_id,organization_id,service_order_id,status,updated_at) values($1,$2,$3,$4,'2026-01-01')`,[id(n),id(org),id(order),status]);
  await db.query('insert into public.service_order_item_task_assignees values($1,$2,$3)',[id(n),id(employee),id(org)]);
 }
 await db.exec(`insert into public.service_order_technical_values values('${id(101)}','${id(1)}','${id(71)}','Fixture field','text',null,'field value');
 insert into public.media values('${id(81)}','${id(1)}','fixture.png','fixture/path.png','service-images');
 insert into public.service_order_media values('${id(82)}','${id(101)}','${id(81)}',1);
 grant usage on schema public to authenticated;
 grant execute on all functions in schema public to authenticated;`);
 const permissionKeys=[...new Set([...candidate.matchAll(/'((?:technician_panel)\.[a-z_.]+)'/g)].map(m=>m[1]))];
 // list-only gates also included.
 for(const k of ['contact','problem','schedule','location']) if(!permissionKeys.includes('technician_panel.data.'+k)) permissionKeys.push('technician_panel.data.'+k);
 async function reset() {
  await db.exec(`reset role; delete from private.fixture_permissions;
  delete from private.fixture_memberships;
  insert into private.fixture_memberships values ('${id(1)}','${id(11)}',true),('${id(2)}','${id(12)}',true);
  update public.employees set is_active=true;
  update public.organization_modules set is_enabled=true;
  insert into private.fixture_permissions select m.organization_id,m.user_id,k,true
  from private.fixture_memberships m cross join unnest(array[${permissionKeys.map(k=>"'"+k+"'").join(',')}]) k;`);
 }
 async function call(name,version,arg) {
  try { const r=await db.query('select public.fixture_'+version+'_'+name+'($1) as value',[id(arg)]);return {value:r.rows[0].value}; }
  catch(e){return {error:e.code};}
 }
 let cases=0;const counts=[];
 const modes=['all',...permissionKeys.map(k=>'deny:'+k),'inactive','access-window','module-disabled','membership-revoked','assignment-revoked','item-tenant-mismatch'];
 for(const mode of modes) {
  await reset();
  if(mode.startsWith('deny:')) await db.query('update private.fixture_permissions set allowed=false where key=$1',[mode.slice(5)]);
  if(mode==='inactive') await db.exec('update public.employees set is_active=false');
  if(mode==='access-window') await db.exec('update private.fixture_memberships set access_now=false');
  if(mode==='module-disabled') await db.exec('update public.organization_modules set is_enabled=false');
  if(mode==='membership-revoked') await db.exec('delete from private.fixture_memberships');
  if(mode==='assignment-revoked') await db.exec(`update public.service_order_item_task_assignees set employee_id='${id(23)}' where employee_id='${id(21)}'`);
  if(mode==='item-tenant-mismatch') await db.exec(`update public.service_order_items set organization_id='${id(2)}' where id='${id(201)}'`);
  await db.exec('set role authenticated');
  const role=(await db.query('select rolsuper,rolbypassrls from pg_roles where rolname=current_user')).rows[0];
  assert.equal(role.rolsuper,false);assert.equal(role.rolbypassrls,false);
  for(const user of [id(11),id(12),id(13),'']) {
   await db.exec("set fixture.uid='"+user+"'");
   for(const [name,args] of [['get_my_technician_order_details_v1',[101,102,103,999]],['list_my_technician_tasks_v1',[1,2,999]]]) {
    for(const arg of args) {
     await db.exec('reset role; alter sequence private.access_calls restart with 1; alter sequence private.permission_calls restart with 1; set role authenticated;');
     const baseline=await call(name,'baseline',arg);
     await db.exec('reset role');
     const before=(await db.query("select (select case when is_called then last_value else 0 end from private.access_calls)::int as access,(select case when is_called then last_value else 0 end from private.permission_calls)::int as permission")).rows[0];
     await db.exec('alter sequence private.access_calls restart with 1; alter sequence private.permission_calls restart with 1; set role authenticated;');
     const result=await call(name,'candidate',arg);
     await db.exec('reset role');
     const after=(await db.query("select (select case when is_called then last_value else 0 end from private.access_calls)::int as access,(select case when is_called then last_value else 0 end from private.permission_calls)::int as permission")).rows[0];
     assert.deepEqual(result,baseline,mode+'/'+user+'/'+name+'/'+arg);
     if(mode==='all'&&user===id(11)&&[101,1].includes(arg)) {
      assert.ok(result.value,'must exercise authorized rows');
      if(name.startsWith('list')) {
       assert.equal(result.value.length,3);
       assert.ok(result.value.every(x=>!('order_services_completed' in x)));
       assert.deepEqual(result.value.map(x=>x.item_id),[id(202),id(201),id(203)]);
      } else {
       assert.equal(result.value.customer_document,'fixture-document');
       assert.equal(result.value.technical_values.length,1);
       assert.equal(result.value.equipment_photos.length,1);
      }
      counts.push({name,baseline:before,candidate:after});
     }
     cases++;await db.exec('set role authenticated');
    }
   }
  }
  await db.exec(`reset role; update public.service_order_item_task_assignees set employee_id='${id(21)}' where item_id in ('${id(201)}','${id(202)}','${id(203)}');update public.service_order_items set organization_id='${id(1)}' where id='${id(201)}';`);
 }
 console.log(JSON.stringify({equivalenceCases:cases,modes:modes.length,counts,limitations:'Synthetic lower permission/membership/access-window helpers; real assignment helper and read SQL. No production latency claim.'},null,2));
} finally {await db.close();}
