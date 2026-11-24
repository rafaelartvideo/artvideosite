-- Synthetic fixture only, loaded into a fresh in-memory PGlite database.
create schema auth;
create schema private;
create role authenticated nologin;
create table private.fixture_permissions(organization_id uuid,user_id uuid,key text,allowed boolean);
create table private.fixture_memberships(organization_id uuid,user_id uuid,access_now boolean default true);
create sequence private.permission_calls;
create sequence private.access_calls;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('fixture.uid',true),'')::uuid $$;
create function private.is_organization_member(org uuid) returns boolean language sql stable as $$
 select exists(select 1 from private.fixture_memberships where organization_id=org and user_id=auth.uid()) $$;
create function private.is_organization_module_enabled(org uuid,module_key text) returns boolean language sql stable as $$
 select exists(select 1 from public.organization_modules m where m.organization_id=org and m.module_key=$2 and m.is_enabled) $$;
create function private.has_effective_organization_permission(org uuid,permission text) returns boolean language plpgsql stable as $$
begin
 perform nextval('private.permission_calls');
 return exists(select 1 from private.fixture_memberships m join private.fixture_permissions p using(organization_id,user_id)
 where m.organization_id=org and m.user_id=auth.uid() and m.access_now and p.key=permission and p.allowed);
end $$;
create table public.organization_modules(organization_id uuid,module_key text,is_enabled boolean);
create table public.service_orders(id uuid primary key,organization_id uuid,os_number int,completed_at timestamptz,cancelled_at timestamptz,is_solved boolean,
 situation_id uuid,service_type_id uuid,diagnosis text,accessories text,equipment_condition text,equipment_brand_id uuid,equipment_model_id uuid,model text,
 customer_id uuid,service_customer_address_id uuid,internal_notes text,equipment_type_id uuid,customer_notes text,serial_number text,scheduled_at timestamptz,
 service_street text,service_number text,service_complement text,service_neighborhood text,service_city text,service_state text,service_zip_code text);
create table public.service_order_item_tasks(item_id uuid primary key,organization_id uuid,service_order_id uuid,status text,started_at timestamptz,
 completed_at timestamptz,execution_report text,started_lat numeric,started_lng numeric,started_accuracy_m numeric,started_location_at timestamptz,
 completed_lat numeric,completed_lng numeric,completed_accuracy_m numeric,completed_location_at timestamptz,updated_at timestamptz);
create table public.service_order_items(id uuid primary key,organization_id uuid,service_order_id uuid,item_type text,title_snapshot text,description_snapshot text,quantity numeric,created_at timestamptz);
create table public.service_order_item_task_assignees(item_id uuid,employee_id uuid,organization_id uuid,primary key(item_id,employee_id));
create table public.employees(id uuid primary key,organization_id uuid,profile_id uuid,is_active boolean);
create table public.customers(id uuid primary key,organization_id uuid,document text,cnpj text,customer_type text,full_name text,whatsapp text,phone text);
create table public.os_situations(id uuid primary key,organization_id uuid,name text,sort_order int,is_active boolean);
create table public.service_type_situations(organization_id uuid,service_type_id uuid,situation_id uuid);
create table public.equipment_brands(id uuid primary key,organization_id uuid,name text);
create table public.equipment_models(id uuid primary key,organization_id uuid,name text);
create table public.equipment_types(id uuid primary key,organization_id uuid,name text);
create table public.customer_addresses(id uuid primary key,customer_id uuid,organization_id uuid,street text,number text,complement text,neighborhood text,city text,state text,zip_code text,is_default boolean,created_at timestamptz);
create table public.service_order_technical_values(service_order_id uuid,organization_id uuid,technical_field_id uuid,label_snapshot text,field_type_snapshot text,value_number numeric,value_text text);
create table public.service_order_media(id uuid primary key,service_order_id uuid,media_id uuid,sort_order int);
create table public.media(id uuid primary key,organization_id uuid,file_name text,storage_path text,bucket_id text);
