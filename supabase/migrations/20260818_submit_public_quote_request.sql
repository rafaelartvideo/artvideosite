-- RPC function for public quote submission.
-- Runs as SECURITY DEFINER so anon users don't need direct INSERT on customers
-- or quote_requests. No RLS policy changes required on those tables.
--
-- HOW TO APPLY:
--   Paste this entire file into Supabase → SQL Editor → Run.

CREATE OR REPLACE FUNCTION submit_public_quote_request(
  p_full_name       text,
  p_whatsapp        text        DEFAULT NULL,
  p_email           text        DEFAULT NULL,
  p_document        text        DEFAULT NULL,  -- CPF digits only (11 chars)
  p_service_id      uuid        DEFAULT NULL,
  p_brand_id        uuid        DEFAULT NULL,
  p_customer_message text       DEFAULT NULL,
  p_protocol        text        DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_status_id   uuid;
  v_quote_id    uuid;
BEGIN
  -- 1. Find existing customer
  IF p_document IS NOT NULL AND length(trim(p_document)) = 11 THEN
    SELECT id INTO v_customer_id
    FROM customers
    WHERE document = trim(p_document)
    LIMIT 1;

    IF v_customer_id IS NOT NULL THEN
      UPDATE customers SET
        full_name  = p_full_name,
        whatsapp   = NULLIF(trim(p_whatsapp), ''),
        email      = NULLIF(trim(p_email), ''),
        updated_at = now()
      WHERE id = v_customer_id;
    END IF;
  END IF;

  IF v_customer_id IS NULL AND p_whatsapp IS NOT NULL AND trim(p_whatsapp) != '' THEN
    SELECT id INTO v_customer_id
    FROM customers
    WHERE whatsapp = trim(p_whatsapp)
    LIMIT 1;
  END IF;

  -- 2. Create customer if not found
  IF v_customer_id IS NULL THEN
    INSERT INTO customers (full_name, whatsapp, email, phone, document)
    VALUES (
      p_full_name,
      NULLIF(trim(p_whatsapp), ''),
      NULLIF(trim(p_email), ''),
      NULL,
      NULLIF(trim(p_document), '')
    )
    RETURNING id INTO v_customer_id;
  END IF;

  -- 3. Resolve "Pendente" status
  SELECT id INTO v_status_id
  FROM request_statuses
  WHERE lower(name) LIKE '%pend%'
  ORDER BY sort_order
  LIMIT 1;

  -- 4. Insert quote request
  INSERT INTO quote_requests (
    customer_id,
    service_id,
    brand_id,
    status_id,
    customer_message,
    protocol
  ) VALUES (
    v_customer_id,
    p_service_id,
    p_brand_id,
    v_status_id,
    NULLIF(trim(p_customer_message), ''),
    p_protocol
  )
  RETURNING id INTO v_quote_id;

  RETURN json_build_object(
    'success',     true,
    'quote_id',    v_quote_id,
    'customer_id', v_customer_id,
    'protocol',    p_protocol
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error',   SQLERRM
  );
END;
$$;

-- Allow the anon role (unauthenticated browser requests) to call this function.
-- The function itself enforces all data access — no table-level anon grants needed.
GRANT EXECUTE ON FUNCTION submit_public_quote_request TO anon;
