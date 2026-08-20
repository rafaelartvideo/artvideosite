-- Service order service types and technician assignment.
-- This migration is idempotent and reuses the existing employees table.

CREATE TABLE IF NOT EXISTS service_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  forecast_days INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS service_types_is_active_idx ON service_types(is_active);
CREATE INDEX IF NOT EXISTS service_types_sort_order_idx ON service_types(sort_order);

ALTER TABLE service_types ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'service_types' AND policyname = 'authenticated_manage_service_types'
  ) THEN
    CREATE POLICY "authenticated_manage_service_types"
      ON service_types FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS service_type_id UUID REFERENCES service_types(id) ON DELETE SET NULL;

ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS technician_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'service_orders_technician_id_fkey'
      AND conrelid = 'service_orders'::regclass
  ) THEN
    ALTER TABLE service_orders
      ADD CONSTRAINT service_orders_technician_id_fkey
      FOREIGN KEY (technician_id) REFERENCES employees(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS service_orders_service_type_id_idx ON service_orders(service_type_id);
CREATE INDEX IF NOT EXISTS service_orders_technician_id_idx ON service_orders(technician_id);