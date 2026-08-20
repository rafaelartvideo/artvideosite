-- RPC function for public quote submission.
-- Runs as SECURITY DEFINER so anon users don't need direct INSERT on customers
-- or quote_requests. No RLS policy changes required on those tables.
--
-- HOW TO APPLY:
--   Paste this entire file into Supabase → SQL Editor → Run.

DROP FUNCTION IF EXISTS submit_public_quote_request(text, text, text, text, uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION submit_public_quote_request(
  p_customer_type   text        DEFAULT 'PF',
  p_full_name       text        DEFAULT NULL,
  p_whatsapp        text        DEFAULT NULL,
  p_phone           text        DEFAULT NULL,
  p_email           text        DEFAULT NULL,
  p_document        text        DEFAULT NULL,
  p_trade_name      text        DEFAULT NULL,
  p_legal_name      text        DEFAULT NULL,
  p_cnpj            text        DEFAULT NULL,
  p_state_registration text      DEFAULT NULL,
  p_foundation_date date        DEFAULT NULL,
  p_service_id      uuid        DEFAULT NULL,
  p_brand_id        uuid        DEFAULT NULL,
  p_customer_message text       DEFAULT NULL,
  p_protocol        text        DEFAULT NULL,
  p_zip_code        text        DEFAULT NULL,
  p_street          text        DEFAULT NULL,
  p_number          text        DEFAULT NULL,
  p_complement      text        DEFAULT NULL,
  p_neighborhood    text        DEFAULT NULL,
  p_city            text        DEFAULT NULL,
  p_state           text        DEFAULT NULL
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
  v_address_id  uuid;
BEGIN
  IF p_customer_type NOT IN ('PF', 'PJ') THEN
    RAISE EXCEPTION 'Tipo de cliente inválido.';
  END IF;

  -- 1. Find existing customer
  IF p_customer_type = 'PF' AND p_document IS NOT NULL AND length(trim(p_document)) = 11 THEN
    SELECT id INTO v_customer_id
    FROM customers
    WHERE document = trim(p_document)
    LIMIT 1;

    IF v_customer_id IS NOT NULL THEN
      UPDATE customers SET
        customer_type = 'PF',
        full_name  = NULLIF(trim(p_full_name), ''),
        whatsapp   = NULLIF(trim(p_whatsapp), ''),
        phone      = NULLIF(trim(p_phone), ''),
        email      = NULLIF(trim(p_email), ''),
        document   = NULLIF(trim(p_document), ''),
        updated_at = now()
      WHERE id = v_customer_id;
    END IF;
  END IF;

  IF p_customer_type = 'PJ' AND p_cnpj IS NOT NULL AND trim(p_cnpj) <> '' THEN
    SELECT id INTO v_customer_id
    FROM customers
    WHERE cnpj = trim(p_cnpj)
    LIMIT 1;

    IF v_customer_id IS NOT NULL THEN
      UPDATE customers SET
        customer_type = 'PJ',
        full_name = NULLIF(trim(p_trade_name), ''),
        trade_name = NULLIF(trim(p_trade_name), ''),
        legal_name = NULLIF(trim(p_legal_name), ''),
        cnpj = NULLIF(trim(p_cnpj), ''),
        state_registration = NULLIF(trim(p_state_registration), ''),
        foundation_date = p_foundation_date,
        whatsapp = NULLIF(trim(p_whatsapp), ''),
        phone = NULLIF(trim(p_phone), ''),
        email = NULLIF(trim(p_email), ''),
        updated_at = now()
      WHERE id = v_customer_id;
    END IF;
  END IF;

  IF v_customer_id IS NULL AND p_whatsapp IS NOT NULL AND trim(p_whatsapp) != '' THEN
    SELECT id INTO v_customer_id
    FROM customers
    WHERE whatsapp = trim(p_whatsapp) AND customer_type = p_customer_type
    LIMIT 1;
  END IF;

  -- 2. Create customer if not found
  IF v_customer_id IS NULL THEN
    INSERT INTO customers (customer_type, full_name, whatsapp, email, phone, document, trade_name, legal_name, cnpj, state_registration, foundation_date)
    VALUES (
      p_customer_type,
      CASE WHEN p_customer_type = 'PJ' THEN NULLIF(trim(p_trade_name), '') ELSE NULLIF(trim(p_full_name), '') END,
      NULLIF(trim(p_whatsapp), ''),
      NULLIF(trim(p_email), ''),
      NULLIF(trim(p_phone), ''),
      CASE WHEN p_customer_type = 'PF' THEN NULLIF(trim(p_document), '') ELSE NULL END,
      CASE WHEN p_customer_type = 'PJ' THEN NULLIF(trim(p_trade_name), '') ELSE NULL END,
      CASE WHEN p_customer_type = 'PJ' THEN NULLIF(trim(p_legal_name), '') ELSE NULL END,
      CASE WHEN p_customer_type = 'PJ' THEN NULLIF(trim(p_cnpj), '') ELSE NULL END,
      CASE WHEN p_customer_type = 'PJ' THEN NULLIF(trim(p_state_registration), '') ELSE NULL END,
      CASE WHEN p_customer_type = 'PJ' THEN p_foundation_date ELSE NULL END
    )
    RETURNING id INTO v_customer_id;
  END IF;

  IF NULLIF(concat_ws('', p_zip_code, p_street, p_number, p_complement, p_neighborhood, p_city, p_state), '') IS NOT NULL THEN
    SELECT id INTO v_address_id
    FROM customer_addresses
    WHERE customer_id = v_customer_id AND is_default = true
    ORDER BY created_at
    LIMIT 1;

    IF v_address_id IS NULL THEN
      INSERT INTO customer_addresses (customer_id, zip_code, street, number, complement, neighborhood, city, state, is_default)
      VALUES (v_customer_id, NULLIF(trim(p_zip_code), ''), NULLIF(trim(p_street), ''), NULLIF(trim(p_number), ''), NULLIF(trim(p_complement), ''), NULLIF(trim(p_neighborhood), ''), NULLIF(trim(p_city), ''), NULLIF(trim(p_state), ''), true);
    ELSE
      UPDATE customer_addresses SET
        zip_code = NULLIF(trim(p_zip_code), ''), street = NULLIF(trim(p_street), ''), number = NULLIF(trim(p_number), ''), complement = NULLIF(trim(p_complement), ''), neighborhood = NULLIF(trim(p_neighborhood), ''), city = NULLIF(trim(p_city), ''), state = NULLIF(trim(p_state), ''), updated_at = now()
      WHERE id = v_address_id;
    END IF;
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