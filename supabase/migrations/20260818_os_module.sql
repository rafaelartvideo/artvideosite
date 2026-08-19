-- ============================================================
-- OS MODULE MIGRATION
-- Run this in Supabase → SQL Editor → Run
-- ============================================================

-- 1. Create os_situations table
-- ============================================================
CREATE TABLE IF NOT EXISTS os_situations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE os_situations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_manage_os_situations"
  ON os_situations FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Default situations
INSERT INTO os_situations (name, sort_order, is_active) VALUES
  ('Produto recebido',       1, true),
  ('Em análise',             2, true),
  ('Aguardando orçamento',   3, true),
  ('Orçamento aprovado',     4, true),
  ('Em execução',            5, true),
  ('Aguardando peça',        6, true),
  ('Pronto para retirada',   7, true),
  ('Entregue',               8, true),
  ('Cancelado',              9, true)
ON CONFLICT DO NOTHING;

-- 2. Add new columns to service_orders
-- ============================================================
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS protocol          TEXT;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS priority          TEXT         NOT NULL DEFAULT 'normal';
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS situation_id      UUID         REFERENCES os_situations(id) ON DELETE SET NULL;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS brand_id          UUID         REFERENCES brands(id)        ON DELETE SET NULL;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS product_id        UUID         REFERENCES products(id)      ON DELETE SET NULL;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS model             TEXT;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS serial_number     TEXT;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS accessories       TEXT;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS equipment_condition TEXT;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS diagnosis         TEXT;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS solution          TEXT;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS assigned_to       UUID         REFERENCES profiles(id)      ON DELETE SET NULL;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS estimated_price   NUMERIC(10,2);
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS final_price       NUMERIC(10,2);
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS origin            TEXT         NOT NULL DEFAULT 'manual';

-- Add CHECK constraint for priority (safe — won't fail if constraint already exists)
DO $$
BEGIN
  ALTER TABLE service_orders
    ADD CONSTRAINT service_orders_priority_check
    CHECK (priority IN ('baixa', 'normal', 'alta', 'urgente'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. RLS for service_orders (authenticated full access, anon none)
-- ============================================================
ALTER TABLE service_orders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'service_orders' AND policyname = 'authenticated_manage_service_orders'
  ) THEN
    CREATE POLICY "authenticated_manage_service_orders"
      ON service_orders FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;