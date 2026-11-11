-- TEST ONLY: Vault API-compatible encrypted emulator for vanilla disposable PG.
-- Production uses supabase_vault 0.3.1, independently verified read-only.
-- Never run this bootstrap against a persistent database.
\set ON_ERROR_STOP on
create extension if not exists pgcrypto;
create schema vault;
create table vault.secrets(id uuid primary key default gen_random_uuid(),secret bytea not null,name text unique,description text);
create view vault.decrypted_secrets as select id,name,description,
 pgp_sym_decrypt(secret,'DISPOSABLE-FIXTURE-ONLY') as decrypted_secret from vault.secrets;
create function vault.create_secret(new_secret text,new_name text default null,new_description text default '')
 returns uuid language plpgsql set search_path='' as $$
declare sid uuid;
begin insert into vault.secrets(secret,name,description)
 values(public.pgp_sym_encrypt(new_secret,'DISPOSABLE-FIXTURE-ONLY'),new_name,new_description) returning id into sid;
 return sid; end;$$;
create function vault.update_secret(secret_id uuid,new_secret text default null,new_name text default null,new_description text default null)
 returns void language sql set search_path='' as $$
 update vault.secrets set secret=case when new_secret is null then secret else public.pgp_sym_encrypt(new_secret,'DISPOSABLE-FIXTURE-ONLY') end,
 name=coalesce(new_name,name),description=coalesce(new_description,description) where id=secret_id;$$;
revoke all on schema vault from public,anon,authenticated,service_role;
revoke all on all tables in schema vault from public,anon,authenticated,service_role;
revoke all on all functions in schema vault from public,anon,authenticated,service_role;
