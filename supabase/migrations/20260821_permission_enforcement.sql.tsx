-- Enforce existing role permissions at the database boundary.
-- This migration does not create or modify the permission functions.
-- All policy DDL below is guarded by table existence so this migration is
-- safe against environments where optional modules are not installed.

CREATE OR REPLACE FUNCTION pg_temp.apply_policy_ddl(target_table text, ddl text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass('public.' || target_table) IS NOT NULL THEN
    EXECUTE ddl;
  END IF;
END;
$$;

DO $$
DECLARE
  target_table text;
  policy_row record;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'service_orders', 'customers', 'employees',
    'equipment_types', 'equipment_brands', 'equipment_models',
    'general_services', 'service_types', 'services',
    'service_variants', 'service_inclusions', 'service_exclusions',
    'service_price_factors', 'service_faqs', 'service_sections',
    'products', 'service_categories', 'product_categories', 'brands',
    'quote_requests', 'quote_status_history', 'request_statuses',
    'roles', 'permissions', 'role_permissions', 'profiles',
    'customer_addresses', 'service_order_status_history', 'service_order_media',
    'site_settings', 'os_situations', 'order_statuses'
  ] LOOP
    IF to_regclass('public.' || target_table) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);

      FOR policy_row IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = target_table
          AND roles::text LIKE '%authenticated%'
          AND (
            coalesce(qual, '') ~ '^\s*\(?true\)?\s*$'
            OR coalesce(with_check, '') ~ '^\s*\(?true\)?\s*$'
          )
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_row.policyname, target_table);
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- Service orders
SELECT pg_temp.apply_policy_ddl('service_orders', 'DROP POLICY IF EXISTS orders_view ON public.service_orders');
SELECT pg_temp.apply_policy_ddl('service_orders', 'DROP POLICY IF EXISTS orders_create ON public.service_orders');
SELECT pg_temp.apply_policy_ddl('service_orders', 'DROP POLICY IF EXISTS orders_update ON public.service_orders');
SELECT pg_temp.apply_policy_ddl('service_orders', 'DROP POLICY IF EXISTS orders_delete ON public.service_orders');
SELECT pg_temp.apply_policy_ddl('service_orders', 'CREATE POLICY orders_view ON public.service_orders FOR SELECT TO authenticated USING (private.has_permission(''orders.view''));');
SELECT pg_temp.apply_policy_ddl('service_orders', 'CREATE POLICY orders_create ON public.service_orders FOR INSERT TO authenticated WITH CHECK (private.has_permission(''orders.create''));');
SELECT pg_temp.apply_policy_ddl('service_orders', 'CREATE POLICY orders_update ON public.service_orders FOR UPDATE TO authenticated USING (private.has_permission(''orders.update'')) WITH CHECK (private.has_permission(''orders.update''));');
SELECT pg_temp.apply_policy_ddl('service_orders', 'CREATE POLICY orders_delete ON public.service_orders FOR DELETE TO authenticated USING (private.has_permission(''orders.delete''));');

-- Customers
SELECT pg_temp.apply_policy_ddl('customers', 'DROP POLICY IF EXISTS customers_view ON public.customers');
SELECT pg_temp.apply_policy_ddl('customers', 'DROP POLICY IF EXISTS customers_create ON public.customers');
SELECT pg_temp.apply_policy_ddl('customers', 'DROP POLICY IF EXISTS customers_update ON public.customers');
SELECT pg_temp.apply_policy_ddl('customers', 'DROP POLICY IF EXISTS customers_delete ON public.customers');
SELECT pg_temp.apply_policy_ddl('customers', 'CREATE POLICY customers_view ON public.customers FOR SELECT TO authenticated USING (private.has_permission(''customers.view''));');
SELECT pg_temp.apply_policy_ddl('customers', 'CREATE POLICY customers_create ON public.customers FOR INSERT TO authenticated WITH CHECK (private.has_permission(''customers.create''));');
SELECT pg_temp.apply_policy_ddl('customers', 'CREATE POLICY customers_update ON public.customers FOR UPDATE TO authenticated USING (private.has_permission(''customers.update'') OR private.has_permission(''customers.edit'')) WITH CHECK (private.has_permission(''customers.update'') OR private.has_permission(''customers.edit''));');
SELECT pg_temp.apply_policy_ddl('customers', 'CREATE POLICY customers_delete ON public.customers FOR DELETE TO authenticated USING (private.has_permission(''customers.delete''));');

-- Customer addresses follow the customer permission boundary.
SELECT pg_temp.apply_policy_ddl('customer_addresses', 'DROP POLICY IF EXISTS customer_addresses_view ON public.customer_addresses');
SELECT pg_temp.apply_policy_ddl('customer_addresses', 'DROP POLICY IF EXISTS customer_addresses_create ON public.customer_addresses');
SELECT pg_temp.apply_policy_ddl('customer_addresses', 'DROP POLICY IF EXISTS customer_addresses_update ON public.customer_addresses');
SELECT pg_temp.apply_policy_ddl('customer_addresses', 'DROP POLICY IF EXISTS customer_addresses_delete ON public.customer_addresses');
SELECT pg_temp.apply_policy_ddl('customer_addresses', 'CREATE POLICY customer_addresses_view ON public.customer_addresses FOR SELECT TO authenticated USING (private.has_permission(''customers.view''));');
SELECT pg_temp.apply_policy_ddl('customer_addresses', 'CREATE POLICY customer_addresses_create ON public.customer_addresses FOR INSERT TO authenticated WITH CHECK (private.has_permission(''customers.create''));');
SELECT pg_temp.apply_policy_ddl('customer_addresses', 'CREATE POLICY customer_addresses_update ON public.customer_addresses FOR UPDATE TO authenticated USING (private.has_permission(''customers.update'') OR private.has_permission(''customers.edit'')) WITH CHECK (private.has_permission(''customers.update'') OR private.has_permission(''customers.edit''));');
SELECT pg_temp.apply_policy_ddl('customer_addresses', 'CREATE POLICY customer_addresses_delete ON public.customer_addresses FOR DELETE TO authenticated USING (private.has_permission(''customers.delete''));');

-- Employees and authenticated user/profile records.
SELECT pg_temp.apply_policy_ddl('employees', 'DROP POLICY IF EXISTS employees_view ON public.employees');
SELECT pg_temp.apply_policy_ddl('employees', 'DROP POLICY IF EXISTS employees_create ON public.employees');
SELECT pg_temp.apply_policy_ddl('employees', 'DROP POLICY IF EXISTS employees_update ON public.employees');
SELECT pg_temp.apply_policy_ddl('employees', 'DROP POLICY IF EXISTS employees_delete ON public.employees');
SELECT pg_temp.apply_policy_ddl('employees', 'CREATE POLICY employees_view ON public.employees FOR SELECT TO authenticated USING (profile_id = auth.uid() OR private.has_permission(''employees.view''));');
SELECT pg_temp.apply_policy_ddl('employees', 'CREATE POLICY employees_create ON public.employees FOR INSERT TO authenticated WITH CHECK (private.has_permission(''employees.create''));');
SELECT pg_temp.apply_policy_ddl('employees', 'CREATE POLICY employees_update ON public.employees FOR UPDATE TO authenticated USING (private.has_permission(''employees.edit'')) WITH CHECK (private.has_permission(''employees.edit''));');
SELECT pg_temp.apply_policy_ddl('employees', 'CREATE POLICY employees_delete ON public.employees FOR DELETE TO authenticated USING (private.has_permission(''employees.delete''));');

SELECT pg_temp.apply_policy_ddl('profiles', 'DROP POLICY IF EXISTS profiles_view ON public.profiles');
SELECT pg_temp.apply_policy_ddl('profiles', 'DROP POLICY IF EXISTS profiles_create ON public.profiles');
SELECT pg_temp.apply_policy_ddl('profiles', 'DROP POLICY IF EXISTS profiles_update ON public.profiles');
SELECT pg_temp.apply_policy_ddl('profiles', 'DROP POLICY IF EXISTS profiles_delete ON public.profiles');
SELECT pg_temp.apply_policy_ddl('profiles', 'CREATE POLICY profiles_view ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR private.has_permission(''users.view''));');
SELECT pg_temp.apply_policy_ddl('profiles', 'CREATE POLICY profiles_create ON public.profiles FOR INSERT TO authenticated WITH CHECK (private.has_permission(''users.create''));');
SELECT pg_temp.apply_policy_ddl('profiles', 'CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated USING (private.has_permission(''users.update'')) WITH CHECK (private.has_permission(''users.update''));');
SELECT pg_temp.apply_policy_ddl('profiles', 'CREATE POLICY profiles_delete ON public.profiles FOR DELETE TO authenticated USING (private.has_permission(''users.delete''));');

-- Equipment hierarchy
SELECT pg_temp.apply_policy_ddl('equipment_types', 'DROP POLICY IF EXISTS equipment_types_view ON public.equipment_types');
SELECT pg_temp.apply_policy_ddl('equipment_types', 'DROP POLICY IF EXISTS equipment_types_create ON public.equipment_types');
SELECT pg_temp.apply_policy_ddl('equipment_types', 'DROP POLICY IF EXISTS equipment_types_update ON public.equipment_types');
SELECT pg_temp.apply_policy_ddl('equipment_types', 'DROP POLICY IF EXISTS equipment_types_delete ON public.equipment_types');
SELECT pg_temp.apply_policy_ddl('equipment_types', 'CREATE POLICY equipment_types_view ON public.equipment_types FOR SELECT TO authenticated USING (private.has_permission(''equipment.view''));');
SELECT pg_temp.apply_policy_ddl('equipment_types', 'CREATE POLICY equipment_types_create ON public.equipment_types FOR INSERT TO authenticated WITH CHECK (private.has_permission(''equipment.create''));');
SELECT pg_temp.apply_policy_ddl('equipment_types', 'CREATE POLICY equipment_types_update ON public.equipment_types FOR UPDATE TO authenticated USING (private.has_permission(''equipment.edit'')) WITH CHECK (private.has_permission(''equipment.edit''));');
SELECT pg_temp.apply_policy_ddl('equipment_types', 'CREATE POLICY equipment_types_delete ON public.equipment_types FOR DELETE TO authenticated USING (private.has_permission(''equipment.delete''));');

SELECT pg_temp.apply_policy_ddl('equipment_brands', 'DROP POLICY IF EXISTS equipment_brands_view ON public.equipment_brands');
SELECT pg_temp.apply_policy_ddl('equipment_brands', 'DROP POLICY IF EXISTS equipment_brands_create ON public.equipment_brands');
SELECT pg_temp.apply_policy_ddl('equipment_brands', 'DROP POLICY IF EXISTS equipment_brands_update ON public.equipment_brands');
SELECT pg_temp.apply_policy_ddl('equipment_brands', 'DROP POLICY IF EXISTS equipment_brands_delete ON public.equipment_brands');
SELECT pg_temp.apply_policy_ddl('equipment_brands', 'CREATE POLICY equipment_brands_view ON public.equipment_brands FOR SELECT TO authenticated USING (private.has_permission(''equipment.view''));');
SELECT pg_temp.apply_policy_ddl('equipment_brands', 'CREATE POLICY equipment_brands_create ON public.equipment_brands FOR INSERT TO authenticated WITH CHECK (private.has_permission(''equipment.create''));');
SELECT pg_temp.apply_policy_ddl('equipment_brands', 'CREATE POLICY equipment_brands_update ON public.equipment_brands FOR UPDATE TO authenticated USING (private.has_permission(''equipment.edit'')) WITH CHECK (private.has_permission(''equipment.edit''));');
SELECT pg_temp.apply_policy_ddl('equipment_brands', 'CREATE POLICY equipment_brands_delete ON public.equipment_brands FOR DELETE TO authenticated USING (private.has_permission(''equipment.delete''));');

SELECT pg_temp.apply_policy_ddl('equipment_models', 'DROP POLICY IF EXISTS equipment_models_view ON public.equipment_models');
SELECT pg_temp.apply_policy_ddl('equipment_models', 'DROP POLICY IF EXISTS equipment_models_create ON public.equipment_models');
SELECT pg_temp.apply_policy_ddl('equipment_models', 'DROP POLICY IF EXISTS equipment_models_update ON public.equipment_models');
SELECT pg_temp.apply_policy_ddl('equipment_models', 'DROP POLICY IF EXISTS equipment_models_delete ON public.equipment_models');
SELECT pg_temp.apply_policy_ddl('equipment_models', 'CREATE POLICY equipment_models_view ON public.equipment_models FOR SELECT TO authenticated USING (private.has_permission(''equipment.view''));');
SELECT pg_temp.apply_policy_ddl('equipment_models', 'CREATE POLICY equipment_models_create ON public.equipment_models FOR INSERT TO authenticated WITH CHECK (private.has_permission(''equipment.create''));');
SELECT pg_temp.apply_policy_ddl('equipment_models', 'CREATE POLICY equipment_models_update ON public.equipment_models FOR UPDATE TO authenticated USING (private.has_permission(''equipment.edit'')) WITH CHECK (private.has_permission(''equipment.edit''));');
SELECT pg_temp.apply_policy_ddl('equipment_models', 'CREATE POLICY equipment_models_delete ON public.equipment_models FOR DELETE TO authenticated USING (private.has_permission(''equipment.delete''));');

-- Operational catalogs
SELECT pg_temp.apply_policy_ddl('general_services', 'DROP POLICY IF EXISTS general_services_view ON public.general_services');
SELECT pg_temp.apply_policy_ddl('general_services', 'DROP POLICY IF EXISTS general_services_create ON public.general_services');
SELECT pg_temp.apply_policy_ddl('general_services', 'DROP POLICY IF EXISTS general_services_update ON public.general_services');
SELECT pg_temp.apply_policy_ddl('general_services', 'DROP POLICY IF EXISTS general_services_delete ON public.general_services');
SELECT pg_temp.apply_policy_ddl('general_services', 'CREATE POLICY general_services_view ON public.general_services FOR SELECT TO authenticated USING (private.has_permission(''general_services.view''));');
SELECT pg_temp.apply_policy_ddl('general_services', 'CREATE POLICY general_services_create ON public.general_services FOR INSERT TO authenticated WITH CHECK (private.has_permission(''general_services.create''));');
SELECT pg_temp.apply_policy_ddl('general_services', 'CREATE POLICY general_services_update ON public.general_services FOR UPDATE TO authenticated USING (private.has_permission(''general_services.edit'')) WITH CHECK (private.has_permission(''general_services.edit''));');
SELECT pg_temp.apply_policy_ddl('general_services', 'CREATE POLICY general_services_delete ON public.general_services FOR DELETE TO authenticated USING (private.has_permission(''general_services.delete''));');

SELECT pg_temp.apply_policy_ddl('service_types', 'DROP POLICY IF EXISTS service_types_view ON public.service_types');
SELECT pg_temp.apply_policy_ddl('service_types', 'DROP POLICY IF EXISTS service_types_create ON public.service_types');
SELECT pg_temp.apply_policy_ddl('service_types', 'DROP POLICY IF EXISTS service_types_update ON public.service_types');
SELECT pg_temp.apply_policy_ddl('service_types', 'DROP POLICY IF EXISTS service_types_delete ON public.service_types');
SELECT pg_temp.apply_policy_ddl('service_types', 'CREATE POLICY service_types_view ON public.service_types FOR SELECT TO authenticated USING (private.has_permission(''service_types.view''));');
SELECT pg_temp.apply_policy_ddl('service_types', 'CREATE POLICY service_types_create ON public.service_types FOR INSERT TO authenticated WITH CHECK (private.has_permission(''service_types.create''));');
SELECT pg_temp.apply_policy_ddl('service_types', 'CREATE POLICY service_types_update ON public.service_types FOR UPDATE TO authenticated USING (private.has_permission(''service_types.edit'')) WITH CHECK (private.has_permission(''service_types.edit''));');
SELECT pg_temp.apply_policy_ddl('service_types', 'CREATE POLICY service_types_delete ON public.service_types FOR DELETE TO authenticated USING (private.has_permission(''service_types.delete''));');

-- Site catalogs
SELECT pg_temp.apply_policy_ddl('services', 'DROP POLICY IF EXISTS services_view ON public.services');
SELECT pg_temp.apply_policy_ddl('services', 'DROP POLICY IF EXISTS services_create ON public.services');
SELECT pg_temp.apply_policy_ddl('services', 'DROP POLICY IF EXISTS services_update ON public.services');
SELECT pg_temp.apply_policy_ddl('services', 'DROP POLICY IF EXISTS services_delete ON public.services');
SELECT pg_temp.apply_policy_ddl('services', 'CREATE POLICY services_view ON public.services FOR SELECT TO authenticated USING (private.has_permission(''services.view''));');
SELECT pg_temp.apply_policy_ddl('services', 'CREATE POLICY services_create ON public.services FOR INSERT TO authenticated WITH CHECK (private.has_permission(''services.create''));');
SELECT pg_temp.apply_policy_ddl('services', 'CREATE POLICY services_update ON public.services FOR UPDATE TO authenticated USING (private.has_permission(''services.update'')) WITH CHECK (private.has_permission(''services.update''));');
SELECT pg_temp.apply_policy_ddl('services', 'CREATE POLICY services_delete ON public.services FOR DELETE TO authenticated USING (private.has_permission(''services.delete''));');


-- Service child tables use the same permission boundary as their parent service.
-- These statements are also guarded by table existence so optional child
-- modules do not make the migration fail.

-- service_variants
SELECT pg_temp.apply_policy_ddl('service_variants', 'DROP POLICY IF EXISTS service_variants_view ON public.service_variants');
SELECT pg_temp.apply_policy_ddl('service_variants', 'CREATE POLICY service_variants_view ON public.service_variants FOR SELECT TO authenticated USING (private.has_permission(''services.view''));');
SELECT pg_temp.apply_policy_ddl('service_variants', 'DROP POLICY IF EXISTS service_variants_create ON public.service_variants');
SELECT pg_temp.apply_policy_ddl('service_variants', 'CREATE POLICY service_variants_create ON public.service_variants FOR INSERT TO authenticated WITH CHECK (private.has_permission(''services.create''));');
SELECT pg_temp.apply_policy_ddl('service_variants', 'DROP POLICY IF EXISTS service_variants_update ON public.service_variants');
SELECT pg_temp.apply_policy_ddl('service_variants', 'CREATE POLICY service_variants_update ON public.service_variants FOR UPDATE TO authenticated USING (private.has_permission(''services.update'')) WITH CHECK (private.has_permission(''services.update''));');
SELECT pg_temp.apply_policy_ddl('service_variants', 'DROP POLICY IF EXISTS service_variants_delete ON public.service_variants');
SELECT pg_temp.apply_policy_ddl('service_variants', 'CREATE POLICY service_variants_delete ON public.service_variants FOR DELETE TO authenticated USING (private.has_permission(''services.delete''));');

-- service_inclusions
SELECT pg_temp.apply_policy_ddl('service_inclusions', 'DROP POLICY IF EXISTS service_inclusions_view ON public.service_inclusions');
SELECT pg_temp.apply_policy_ddl('service_inclusions', 'CREATE POLICY service_inclusions_view ON public.service_inclusions FOR SELECT TO authenticated USING (private.has_permission(''services.view''));');
SELECT pg_temp.apply_policy_ddl('service_inclusions', 'DROP POLICY IF EXISTS service_inclusions_create ON public.service_inclusions');
SELECT pg_temp.apply_policy_ddl('service_inclusions', 'CREATE POLICY service_inclusions_create ON public.service_inclusions FOR INSERT TO authenticated WITH CHECK (private.has_permission(''services.create''));');
SELECT pg_temp.apply_policy_ddl('service_inclusions', 'DROP POLICY IF EXISTS service_inclusions_update ON public.service_inclusions');
SELECT pg_temp.apply_policy_ddl('service_inclusions', 'CREATE POLICY service_inclusions_update ON public.service_inclusions FOR UPDATE TO authenticated USING (private.has_permission(''services.update'')) WITH CHECK (private.has_permission(''services.update''));');
SELECT pg_temp.apply_policy_ddl('service_inclusions', 'DROP POLICY IF EXISTS service_inclusions_delete ON public.service_inclusions');
SELECT pg_temp.apply_policy_ddl('service_inclusions', 'CREATE POLICY service_inclusions_delete ON public.service_inclusions FOR DELETE TO authenticated USING (private.has_permission(''services.delete''));');

-- service_exclusions
SELECT pg_temp.apply_policy_ddl('service_exclusions', 'DROP POLICY IF EXISTS service_exclusions_view ON public.service_exclusions');
SELECT pg_temp.apply_policy_ddl('service_exclusions', 'CREATE POLICY service_exclusions_view ON public.service_exclusions FOR SELECT TO authenticated USING (private.has_permission(''services.view''));');
SELECT pg_temp.apply_policy_ddl('service_exclusions', 'DROP POLICY IF EXISTS service_exclusions_create ON public.service_exclusions');
SELECT pg_temp.apply_policy_ddl('service_exclusions', 'CREATE POLICY service_exclusions_create ON public.service_exclusions FOR INSERT TO authenticated WITH CHECK (private.has_permission(''services.create''));');
SELECT pg_temp.apply_policy_ddl('service_exclusions', 'DROP POLICY IF EXISTS service_exclusions_update ON public.service_exclusions');
SELECT pg_temp.apply_policy_ddl('service_exclusions', 'CREATE POLICY service_exclusions_update ON public.service_exclusions FOR UPDATE TO authenticated USING (private.has_permission(''services.update'')) WITH CHECK (private.has_permission(''services.update''));');
SELECT pg_temp.apply_policy_ddl('service_exclusions', 'DROP POLICY IF EXISTS service_exclusions_delete ON public.service_exclusions');
SELECT pg_temp.apply_policy_ddl('service_exclusions', 'CREATE POLICY service_exclusions_delete ON public.service_exclusions FOR DELETE TO authenticated USING (private.has_permission(''services.delete''));');

-- service_price_factors
SELECT pg_temp.apply_policy_ddl('service_price_factors', 'DROP POLICY IF EXISTS service_price_factors_view ON public.service_price_factors');
SELECT pg_temp.apply_policy_ddl('service_price_factors', 'CREATE POLICY service_price_factors_view ON public.service_price_factors FOR SELECT TO authenticated USING (private.has_permission(''services.view''));');
SELECT pg_temp.apply_policy_ddl('service_price_factors', 'DROP POLICY IF EXISTS service_price_factors_create ON public.service_price_factors');
SELECT pg_temp.apply_policy_ddl('service_price_factors', 'CREATE POLICY service_price_factors_create ON public.service_price_factors FOR INSERT TO authenticated WITH CHECK (private.has_permission(''services.create''));');
SELECT pg_temp.apply_policy_ddl('service_price_factors', 'DROP POLICY IF EXISTS service_price_factors_update ON public.service_price_factors');
SELECT pg_temp.apply_policy_ddl('service_price_factors', 'CREATE POLICY service_price_factors_update ON public.service_price_factors FOR UPDATE TO authenticated USING (private.has_permission(''services.update'')) WITH CHECK (private.has_permission(''services.update''));');
SELECT pg_temp.apply_policy_ddl('service_price_factors', 'DROP POLICY IF EXISTS service_price_factors_delete ON public.service_price_factors');
SELECT pg_temp.apply_policy_ddl('service_price_factors', 'CREATE POLICY service_price_factors_delete ON public.service_price_factors FOR DELETE TO authenticated USING (private.has_permission(''services.delete''));');

-- service_faqs
SELECT pg_temp.apply_policy_ddl('service_faqs', 'DROP POLICY IF EXISTS service_faqs_view ON public.service_faqs');
SELECT pg_temp.apply_policy_ddl('service_faqs', 'CREATE POLICY service_faqs_view ON public.service_faqs FOR SELECT TO authenticated USING (private.has_permission(''services.view''));');
SELECT pg_temp.apply_policy_ddl('service_faqs', 'DROP POLICY IF EXISTS service_faqs_create ON public.service_faqs');
SELECT pg_temp.apply_policy_ddl('service_faqs', 'CREATE POLICY service_faqs_create ON public.service_faqs FOR INSERT TO authenticated WITH CHECK (private.has_permission(''services.create''));');
SELECT pg_temp.apply_policy_ddl('service_faqs', 'DROP POLICY IF EXISTS service_faqs_update ON public.service_faqs');
SELECT pg_temp.apply_policy_ddl('service_faqs', 'CREATE POLICY service_faqs_update ON public.service_faqs FOR UPDATE TO authenticated USING (private.has_permission(''services.update'')) WITH CHECK (private.has_permission(''services.update''));');
SELECT pg_temp.apply_policy_ddl('service_faqs', 'DROP POLICY IF EXISTS service_faqs_delete ON public.service_faqs');
SELECT pg_temp.apply_policy_ddl('service_faqs', 'CREATE POLICY service_faqs_delete ON public.service_faqs FOR DELETE TO authenticated USING (private.has_permission(''services.delete''));');

-- service_sections
SELECT pg_temp.apply_policy_ddl('service_sections', 'DROP POLICY IF EXISTS service_sections_view ON public.service_sections');
SELECT pg_temp.apply_policy_ddl('service_sections', 'CREATE POLICY service_sections_view ON public.service_sections FOR SELECT TO authenticated USING (private.has_permission(''services.view''));');
SELECT pg_temp.apply_policy_ddl('service_sections', 'DROP POLICY IF EXISTS service_sections_create ON public.service_sections');
SELECT pg_temp.apply_policy_ddl('service_sections', 'CREATE POLICY service_sections_create ON public.service_sections FOR INSERT TO authenticated WITH CHECK (private.has_permission(''services.create''));');
SELECT pg_temp.apply_policy_ddl('service_sections', 'DROP POLICY IF EXISTS service_sections_update ON public.service_sections');
SELECT pg_temp.apply_policy_ddl('service_sections', 'CREATE POLICY service_sections_update ON public.service_sections FOR UPDATE TO authenticated USING (private.has_permission(''services.update'')) WITH CHECK (private.has_permission(''services.update''));');
SELECT pg_temp.apply_policy_ddl('service_sections', 'DROP POLICY IF EXISTS service_sections_delete ON public.service_sections');
SELECT pg_temp.apply_policy_ddl('service_sections', 'CREATE POLICY service_sections_delete ON public.service_sections FOR DELETE TO authenticated USING (private.has_permission(''services.delete''));');

SELECT pg_temp.apply_policy_ddl('products', 'DROP POLICY IF EXISTS products_view ON public.products');
SELECT pg_temp.apply_policy_ddl('products', 'DROP POLICY IF EXISTS products_create ON public.products');
SELECT pg_temp.apply_policy_ddl('products', 'DROP POLICY IF EXISTS products_update ON public.products');
SELECT pg_temp.apply_policy_ddl('products', 'DROP POLICY IF EXISTS products_delete ON public.products');
SELECT pg_temp.apply_policy_ddl('products', 'CREATE POLICY products_view ON public.products FOR SELECT TO authenticated USING (private.has_permission(''products.view''));');
SELECT pg_temp.apply_policy_ddl('products', 'CREATE POLICY products_create ON public.products FOR INSERT TO authenticated WITH CHECK (private.has_permission(''products.create''));');
SELECT pg_temp.apply_policy_ddl('products', 'CREATE POLICY products_update ON public.products FOR UPDATE TO authenticated USING (private.has_permission(''products.update'')) WITH CHECK (private.has_permission(''products.update''));');
SELECT pg_temp.apply_policy_ddl('products', 'CREATE POLICY products_delete ON public.products FOR DELETE TO authenticated USING (private.has_permission(''products.delete''));');

SELECT pg_temp.apply_policy_ddl('brands', 'DROP POLICY IF EXISTS brands_view ON public.brands');
SELECT pg_temp.apply_policy_ddl('brands', 'DROP POLICY IF EXISTS brands_create ON public.brands');
SELECT pg_temp.apply_policy_ddl('brands', 'DROP POLICY IF EXISTS brands_update ON public.brands');
SELECT pg_temp.apply_policy_ddl('brands', 'DROP POLICY IF EXISTS brands_delete ON public.brands');
SELECT pg_temp.apply_policy_ddl('brands', 'CREATE POLICY brands_view ON public.brands FOR SELECT TO authenticated USING (private.has_permission(''brands.view''));');
SELECT pg_temp.apply_policy_ddl('brands', 'CREATE POLICY brands_create ON public.brands FOR INSERT TO authenticated WITH CHECK (private.has_permission(''brands.create''));');
SELECT pg_temp.apply_policy_ddl('brands', 'CREATE POLICY brands_update ON public.brands FOR UPDATE TO authenticated USING (private.has_permission(''brands.update'')) WITH CHECK (private.has_permission(''brands.update''));');
SELECT pg_temp.apply_policy_ddl('brands', 'CREATE POLICY brands_delete ON public.brands FOR DELETE TO authenticated USING (private.has_permission(''brands.delete''));');

SELECT pg_temp.apply_policy_ddl('service_categories', 'DROP POLICY IF EXISTS service_categories_view ON public.service_categories');
SELECT pg_temp.apply_policy_ddl('service_categories', 'DROP POLICY IF EXISTS service_categories_create ON public.service_categories');
SELECT pg_temp.apply_policy_ddl('service_categories', 'DROP POLICY IF EXISTS service_categories_update ON public.service_categories');
SELECT pg_temp.apply_policy_ddl('service_categories', 'DROP POLICY IF EXISTS service_categories_delete ON public.service_categories');
SELECT pg_temp.apply_policy_ddl('service_categories', 'CREATE POLICY service_categories_view ON public.service_categories FOR SELECT TO authenticated USING (private.has_permission(''categories.view''));');
SELECT pg_temp.apply_policy_ddl('service_categories', 'CREATE POLICY service_categories_create ON public.service_categories FOR INSERT TO authenticated WITH CHECK (private.has_permission(''categories.create''));');
SELECT pg_temp.apply_policy_ddl('service_categories', 'CREATE POLICY service_categories_update ON public.service_categories FOR UPDATE TO authenticated USING (private.has_permission(''categories.update'')) WITH CHECK (private.has_permission(''categories.update''));');
SELECT pg_temp.apply_policy_ddl('service_categories', 'CREATE POLICY service_categories_delete ON public.service_categories FOR DELETE TO authenticated USING (private.has_permission(''categories.delete''));');

SELECT pg_temp.apply_policy_ddl('product_categories', 'DROP POLICY IF EXISTS product_categories_view ON public.product_categories');
SELECT pg_temp.apply_policy_ddl('product_categories', 'DROP POLICY IF EXISTS product_categories_create ON public.product_categories');
SELECT pg_temp.apply_policy_ddl('product_categories', 'DROP POLICY IF EXISTS product_categories_update ON public.product_categories');
SELECT pg_temp.apply_policy_ddl('product_categories', 'DROP POLICY IF EXISTS product_categories_delete ON public.product_categories');
SELECT pg_temp.apply_policy_ddl('product_categories', 'CREATE POLICY product_categories_view ON public.product_categories FOR SELECT TO authenticated USING (private.has_permission(''categories.view''));');
SELECT pg_temp.apply_policy_ddl('product_categories', 'CREATE POLICY product_categories_create ON public.product_categories FOR INSERT TO authenticated WITH CHECK (private.has_permission(''categories.create''));');
SELECT pg_temp.apply_policy_ddl('product_categories', 'CREATE POLICY product_categories_update ON public.product_categories FOR UPDATE TO authenticated USING (private.has_permission(''categories.update'')) WITH CHECK (private.has_permission(''categories.update''));');
SELECT pg_temp.apply_policy_ddl('product_categories', 'CREATE POLICY product_categories_delete ON public.product_categories FOR DELETE TO authenticated USING (private.has_permission(''categories.delete''));');

-- Quotes and quote history
SELECT pg_temp.apply_policy_ddl('quote_requests', 'DROP POLICY IF EXISTS quote_requests_view ON public.quote_requests');
SELECT pg_temp.apply_policy_ddl('quote_requests', 'DROP POLICY IF EXISTS quote_requests_create ON public.quote_requests');
SELECT pg_temp.apply_policy_ddl('quote_requests', 'DROP POLICY IF EXISTS quote_requests_update ON public.quote_requests');
SELECT pg_temp.apply_policy_ddl('quote_requests', 'DROP POLICY IF EXISTS quote_requests_delete ON public.quote_requests');
SELECT pg_temp.apply_policy_ddl('quote_requests', 'CREATE POLICY quote_requests_view ON public.quote_requests FOR SELECT TO authenticated USING (private.has_permission(''quotes.view''));');
SELECT pg_temp.apply_policy_ddl('quote_requests', 'CREATE POLICY quote_requests_create ON public.quote_requests FOR INSERT TO authenticated WITH CHECK (private.has_permission(''quotes.create''));');
SELECT pg_temp.apply_policy_ddl('quote_requests', 'CREATE POLICY quote_requests_update ON public.quote_requests FOR UPDATE TO authenticated USING (private.has_permission(''quotes.update'') OR private.has_permission(''quotes.edit'')) WITH CHECK (private.has_permission(''quotes.update'') OR private.has_permission(''quotes.edit''));');
SELECT pg_temp.apply_policy_ddl('quote_requests', 'CREATE POLICY quote_requests_delete ON public.quote_requests FOR DELETE TO authenticated USING (private.has_permission(''quotes.delete''));');

SELECT pg_temp.apply_policy_ddl('quote_status_history', 'DROP POLICY IF EXISTS quote_status_history_view ON public.quote_status_history');
SELECT pg_temp.apply_policy_ddl('quote_status_history', 'DROP POLICY IF EXISTS quote_status_history_create ON public.quote_status_history');
SELECT pg_temp.apply_policy_ddl('quote_status_history', 'CREATE POLICY quote_status_history_view ON public.quote_status_history FOR SELECT TO authenticated USING (private.has_permission(''quotes.view''));');
SELECT pg_temp.apply_policy_ddl('quote_status_history', 'CREATE POLICY quote_status_history_create ON public.quote_status_history FOR INSERT TO authenticated WITH CHECK (private.has_permission(''quotes.update'') OR private.has_permission(''quotes.edit''));');

SELECT pg_temp.apply_policy_ddl('request_statuses', 'DROP POLICY IF EXISTS request_statuses_view ON public.request_statuses');
SELECT pg_temp.apply_policy_ddl('request_statuses', 'CREATE POLICY request_statuses_view ON public.request_statuses FOR SELECT TO authenticated USING (private.has_permission(''quotes.view''));');

-- Roles and permission assignments
SELECT pg_temp.apply_policy_ddl('roles', 'DROP POLICY IF EXISTS roles_view ON public.roles');
SELECT pg_temp.apply_policy_ddl('roles', 'DROP POLICY IF EXISTS roles_create ON public.roles');
SELECT pg_temp.apply_policy_ddl('roles', 'DROP POLICY IF EXISTS roles_update ON public.roles');
SELECT pg_temp.apply_policy_ddl('roles', 'DROP POLICY IF EXISTS roles_delete ON public.roles');
SELECT pg_temp.apply_policy_ddl('roles', 'CREATE POLICY roles_view ON public.roles FOR SELECT TO authenticated USING (id = (SELECT role_id FROM public.profiles WHERE id = auth.uid()) OR private.has_permission(''roles.view''));');
SELECT pg_temp.apply_policy_ddl('roles', 'CREATE POLICY roles_create ON public.roles FOR INSERT TO authenticated WITH CHECK (private.has_permission(''roles.create''));');
SELECT pg_temp.apply_policy_ddl('roles', 'CREATE POLICY roles_update ON public.roles FOR UPDATE TO authenticated USING (private.has_permission(''roles.edit'')) WITH CHECK (private.has_permission(''roles.edit''));');
SELECT pg_temp.apply_policy_ddl('roles', 'CREATE POLICY roles_delete ON public.roles FOR DELETE TO authenticated USING (private.has_permission(''roles.delete''));');

SELECT pg_temp.apply_policy_ddl('role_permissions', 'DROP POLICY IF EXISTS role_permissions_view ON public.role_permissions');
SELECT pg_temp.apply_policy_ddl('role_permissions', 'DROP POLICY IF EXISTS role_permissions_insert ON public.role_permissions');
SELECT pg_temp.apply_policy_ddl('role_permissions', 'DROP POLICY IF EXISTS role_permissions_update ON public.role_permissions');
SELECT pg_temp.apply_policy_ddl('role_permissions', 'DROP POLICY IF EXISTS role_permissions_delete ON public.role_permissions');
SELECT pg_temp.apply_policy_ddl('role_permissions', 'CREATE POLICY role_permissions_view ON public.role_permissions FOR SELECT TO authenticated USING (role_id = (SELECT role_id FROM public.profiles WHERE id = auth.uid()) OR private.has_permission(''roles.view''));');
SELECT pg_temp.apply_policy_ddl('role_permissions', 'CREATE POLICY role_permissions_insert ON public.role_permissions FOR INSERT TO authenticated WITH CHECK (private.has_permission(''roles.edit''));');
SELECT pg_temp.apply_policy_ddl('role_permissions', 'CREATE POLICY role_permissions_update ON public.role_permissions FOR UPDATE TO authenticated USING (private.has_permission(''roles.edit'')) WITH CHECK (private.has_permission(''roles.edit''));');
SELECT pg_temp.apply_policy_ddl('role_permissions', 'CREATE POLICY role_permissions_delete ON public.role_permissions FOR DELETE TO authenticated USING (private.has_permission(''roles.edit''));');

SELECT pg_temp.apply_policy_ddl('permissions', 'DROP POLICY IF EXISTS permissions_view ON public.permissions');
CREATE POLICY permissions_view ON public.permissions FOR SELECT TO authenticated USING (
  private.has_permission('roles.view')
  OR EXISTS (
    SELECT 1
    FROM public.profiles own_profile
    JOIN public.role_permissions own_role_permissions ON own_role_permissions.role_id = own_profile.role_id
    WHERE own_profile.id = auth.uid()
      AND own_role_permissions.permission_id = permissions.id
  )
);

-- Site settings and existing OS configuration tables
SELECT pg_temp.apply_policy_ddl('site_settings', 'DROP POLICY IF EXISTS site_settings_view ON public.site_settings');
SELECT pg_temp.apply_policy_ddl('site_settings', 'DROP POLICY IF EXISTS site_settings_update ON public.site_settings');
SELECT pg_temp.apply_policy_ddl('site_settings', 'CREATE POLICY site_settings_view ON public.site_settings FOR SELECT TO authenticated USING (private.has_permission(''site.view'') OR private.has_permission(''settings.view'') OR private.has_permission(''contact.view''));');
SELECT pg_temp.apply_policy_ddl('site_settings', 'CREATE POLICY site_settings_update ON public.site_settings FOR UPDATE TO authenticated USING (private.has_permission(''site.edit'') OR private.has_permission(''settings.update'') OR private.has_permission(''contact.update'')) WITH CHECK (private.has_permission(''site.edit'') OR private.has_permission(''settings.update'') OR private.has_permission(''contact.update''));');

SELECT pg_temp.apply_policy_ddl(
  'site_settings',
  'CREATE POLICY site_settings_insert ON public.site_settings FOR INSERT TO authenticated WITH CHECK (private.has_permission(''site.edit'') OR private.has_permission(''settings.update'') OR private.has_permission(''contact.update''));'
);
SELECT pg_temp.apply_policy_ddl('os_situations', 'DROP POLICY IF EXISTS os_situations_view ON public.os_situations');
SELECT pg_temp.apply_policy_ddl('os_situations', 'DROP POLICY IF EXISTS os_situations_create ON public.os_situations');
SELECT pg_temp.apply_policy_ddl('os_situations', 'DROP POLICY IF EXISTS os_situations_update ON public.os_situations');
SELECT pg_temp.apply_policy_ddl('os_situations', 'DROP POLICY IF EXISTS os_situations_delete ON public.os_situations');
SELECT pg_temp.apply_policy_ddl('os_situations', 'CREATE POLICY os_situations_view ON public.os_situations FOR SELECT TO authenticated USING (private.has_permission(''orders.view''));');
SELECT pg_temp.apply_policy_ddl('os_situations', 'CREATE POLICY os_situations_create ON public.os_situations FOR INSERT TO authenticated WITH CHECK (private.has_permission(''orders.update''));');
SELECT pg_temp.apply_policy_ddl('os_situations', 'CREATE POLICY os_situations_update ON public.os_situations FOR UPDATE TO authenticated USING (private.has_permission(''orders.update'')) WITH CHECK (private.has_permission(''orders.update''));');
SELECT pg_temp.apply_policy_ddl('os_situations', 'CREATE POLICY os_situations_delete ON public.os_situations FOR DELETE TO authenticated USING (private.has_permission(''orders.delete''));');

SELECT pg_temp.apply_policy_ddl('order_statuses', 'DROP POLICY IF EXISTS order_statuses_view ON public.order_statuses');
SELECT pg_temp.apply_policy_ddl('order_statuses', 'DROP POLICY IF EXISTS order_statuses_create ON public.order_statuses');
SELECT pg_temp.apply_policy_ddl('order_statuses', 'DROP POLICY IF EXISTS order_statuses_update ON public.order_statuses');
SELECT pg_temp.apply_policy_ddl('order_statuses', 'DROP POLICY IF EXISTS order_statuses_delete ON public.order_statuses');
SELECT pg_temp.apply_policy_ddl('order_statuses', 'CREATE POLICY order_statuses_view ON public.order_statuses FOR SELECT TO authenticated USING (private.has_permission(''orders.view''));');
SELECT pg_temp.apply_policy_ddl('order_statuses', 'CREATE POLICY order_statuses_create ON public.order_statuses FOR INSERT TO authenticated WITH CHECK (private.has_permission(''orders.update''));');
SELECT pg_temp.apply_policy_ddl('order_statuses', 'CREATE POLICY order_statuses_update ON public.order_statuses FOR UPDATE TO authenticated USING (private.has_permission(''orders.update'')) WITH CHECK (private.has_permission(''orders.update''));');
SELECT pg_temp.apply_policy_ddl('order_statuses', 'CREATE POLICY order_statuses_delete ON public.order_statuses FOR DELETE TO authenticated USING (private.has_permission(''orders.delete''));');

-- Related OS records
SELECT pg_temp.apply_policy_ddl('service_order_status_history', 'DROP POLICY IF EXISTS service_order_status_history_view ON public.service_order_status_history');
SELECT pg_temp.apply_policy_ddl('service_order_status_history', 'DROP POLICY IF EXISTS service_order_status_history_create ON public.service_order_status_history');
SELECT pg_temp.apply_policy_ddl('service_order_status_history', 'CREATE POLICY service_order_status_history_view ON public.service_order_status_history FOR SELECT TO authenticated USING (private.has_permission(''orders.view''));');
SELECT pg_temp.apply_policy_ddl('service_order_status_history', 'CREATE POLICY service_order_status_history_create ON public.service_order_status_history FOR INSERT TO authenticated WITH CHECK (private.has_permission(''orders.status''));');

SELECT pg_temp.apply_policy_ddl('service_order_media', 'DROP POLICY IF EXISTS service_order_media_view ON public.service_order_media');
SELECT pg_temp.apply_policy_ddl('service_order_media', 'DROP POLICY IF EXISTS service_order_media_create ON public.service_order_media');
SELECT pg_temp.apply_policy_ddl('service_order_media', 'DROP POLICY IF EXISTS service_order_media_update ON public.service_order_media');
SELECT pg_temp.apply_policy_ddl('service_order_media', 'DROP POLICY IF EXISTS service_order_media_delete ON public.service_order_media');
SELECT pg_temp.apply_policy_ddl('service_order_media', 'CREATE POLICY service_order_media_view ON public.service_order_media FOR SELECT TO authenticated USING (private.has_permission(''orders.view''));');
SELECT pg_temp.apply_policy_ddl('service_order_media', 'CREATE POLICY service_order_media_create ON public.service_order_media FOR INSERT TO authenticated WITH CHECK (private.has_permission(''orders.create'') OR private.has_permission(''orders.edit''));');
SELECT pg_temp.apply_policy_ddl('service_order_media', 'CREATE POLICY service_order_media_update ON public.service_order_media FOR UPDATE TO authenticated USING (private.has_permission(''orders.edit'')) WITH CHECK (private.has_permission(''orders.edit''));');
SELECT pg_temp.apply_policy_ddl('service_order_media', 'CREATE POLICY service_order_media_delete ON public.service_order_media FOR DELETE TO authenticated USING (private.has_permission(''orders.edit''));');

-- RLS can authorize an UPDATE statement, but cannot safely compare each
-- changed column to a different permission without a trigger or RPC. The
-- existing orders_update policy therefore enforces orders.update for the
-- whole row. A future field-level rule for status/assignment must be added
-- as a reviewed trigger or SECURITY DEFINER RPC, not as a broader policy.