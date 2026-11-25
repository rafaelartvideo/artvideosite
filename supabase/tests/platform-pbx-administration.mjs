// Disposable PostgreSQL fixture. Never reads credentials or connects to Supabase.
// Install @electric-sql/pglite@0.5.16 outside the repository; set PGLITE_MODULE.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
assert.ok(process.env.PGLITE_MODULE);
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const read = path => readFileSync(new URL(path,import.meta.url),'utf8');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const key = Buffer.alloc(32,1).toString('base64');
function definition(sql,name) {
 const start=sql.toLowerCase().indexOf('function '+name+'('); assert.ok(start>=0);
 const tail=sql.slice(start),body=tail.match(/\bas\s+(\$[a-z_]*\$)[\s\S]*?\1\s*;/i); assert.ok(body);
 return 'create or replace '+tail.slice(0,body.index+body[0].length);
}
const db=new PGlite();let checks=0;
try {
 await db.exec(`create schema auth;create schema private;create role authenticated nologin;create role anon nologin;
 create table public.organizations(id uuid primary key,status text,settings jsonb);
 create table public.organization_members(organization_id uuid,user_id uuid,status text,role_id uuid);
 create table public.roles(id uuid,organization_id uuid);
 create table public.organization_modules(organization_id uuid,module_key text,is_enabled boolean);
 create table public.system_modules(key text,is_active boolean);
 create table private.fixture_permissions(organization_id uuid,user_id uuid,key text,allowed boolean);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('fixture.uid',true),'')::uuid$$;
 create function private.has_effective_organization_permission(org uuid,permission text) returns boolean language sql stable as $$
 select exists(select 1 from private.fixture_permissions where organization_id=org and user_id=auth.uid() and key=permission and allowed)$$;
 create function private.has_organization_permission(org uuid,permission text) returns boolean language sql stable as $$select private.has_effective_organization_permission(org,permission)$$;
 create table public.pbx_agents(id uuid primary key default gen_random_uuid(),organization_id uuid references public.organizations,
 label text,public_key text unique,enabled boolean default true,last_seen_at timestamptz,created_at timestamptz default now(),capability_seen_at timestamptz,profile_id uuid,profile_context text);
 create unique index one_enabled on public.pbx_agents(organization_id) where enabled;
 grant usage on schema public,private to authenticated;`);
 const platform=read('../migrations/20260928123000_separate_unionworld_and_artvideo_permission_scopes.sql');
 const admission=read('../migrations/20261110140045_pbx_tenant_runtime_admission.sql');
 await db.exec(definition(platform,'private.is_platform_organization'));
 for(const name of ['pbx_org_enabled','pbx_has_permission'])await db.exec(definition(admission,'private.'+name));
 const migration=read('../migrations/20261125123903_platform_pbx_agent_administration.sql');
 await db.exec(migration.slice(migration.indexOf('-- Administrative authority')));
 for(const name of ['pbx_register_agent','pbx_list_agents','pbx_disable_agent']) {
  await db.exec(definition(admission,'public.'+name));
  const args=name==='pbx_register_agent'?'uuid,text,text':name==='pbx_list_agents'?'uuid':'uuid,uuid';
  await db.exec(`revoke all on function public.${name}(${args}) from public;grant execute on function public.${name}(${args}),private.${name}(${args}) to authenticated;`);
 }
 await db.exec(`insert into public.organizations values('${id(1)}','active','{"is_platform_operator":true}'),('${id(2)}','active','{}'),('${id(3)}','active','{}');
 insert into public.organization_members values('${id(1)}','${id(11)}','active',null),('${id(2)}','${id(12)}','active',null),('${id(1)}','${id(13)}','active',null);
 insert into private.fixture_permissions values('${id(1)}','${id(11)}','platform.management.manage',true),('${id(2)}','${id(12)}','pbx.manage',true);
 insert into public.system_modules values('pbx',true);
 insert into public.organization_modules values('${id(2)}','pbx',true),('${id(3)}','pbx',true);`);
 async function as(user) { await db.exec(`set role authenticated;set fixture.uid='${user?id(user):''}'`); }
 async function denied(query,args,code='42501') { await assert.rejects(()=>db.query(query,args),error=>error.code===code);checks++; }
 const register='select public.pbx_register_agent($1,$2,$3) id';
 for(const user of [null,12,13]) { await as(user);await denied(register,[id(2),'Fixture central',key]); }
 await as(11);
 assert.equal((await db.query('select rolsuper,rolbypassrls from pg_roles where rolname=current_user')).rows[0].rolsuper,false);
 await denied(register,[id(999),'Fixture',key]);
 await denied(register,[id(2),'Fixture','invalid'],'23514');
 const agent=(await db.query(register,[id(2),'Fixture central',key])).rows[0].id;checks++;
 await denied(register,[id(2),'Other',Buffer.alloc(32,2).toString('base64')],'23505');
 assert.equal((await db.query('select * from public.pbx_list_agents($1)',[id(2)])).rows.length,1);checks++;
 await as(12);
 assert.equal((await db.query('select * from public.pbx_list_agents($1)',[id(2)])).rows.length,1);checks++;
 await denied('select * from public.pbx_list_agents($1)',[id(3)]);
 await denied('select public.pbx_disable_agent($1,$2)',[id(2),agent]);
 await as(11);
 assert.equal((await db.query('select public.pbx_disable_agent($1,$2) ok',[id(3),agent])).rows[0].ok,false);checks++;
 await db.exec(`reset role;update public.organization_members set status='inactive' where user_id='${id(11)}'`);
 await as(11);await denied('select public.pbx_disable_agent($1,$2)',[id(2),agent]);
 await db.exec(`reset role;update public.organization_members set status='active';update private.fixture_permissions set allowed=false where user_id='${id(11)}'`);
 await as(11);await denied('select public.pbx_disable_agent($1,$2)',[id(2),agent]);
 await db.exec(`reset role;update private.fixture_permissions set allowed=true;update public.organization_modules set is_enabled=false;update public.organizations set status='inactive' where id='${id(2)}'`);
 await as(11);await denied(register,[id(3),'Fixture',Buffer.alloc(32,3).toString('base64')]);
 // Revocation remains possible even when a target is inactive or its module disabled.
 assert.equal((await db.query('select public.pbx_disable_agent($1,$2) ok',[id(2),agent])).rows[0].ok,true);checks++;
 assert.equal((await db.query('select public.pbx_disable_agent($1,$2) ok',[id(2),agent])).rows[0].ok,false);checks++;
 await denied('select * from public.pbx_agents',[]);
 await denied('select private.pbx_can_administer_agents($1)',[id(2)]);
 console.log(JSON.stringify({checks,passed:true,limitations:'Synthetic permission resolver; production authority, agent APIs and tenant read guards. No production writes or VPS execution.'}));
}finally{await db.close();}
