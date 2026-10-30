-- Cache de sete dias para conferência de CPF e nome no cadastro da Eletrônica Artvideo.
-- Armazena somente HMAC-SHA256 (CPFs e nomes nunca em texto puro nem como hashes simples).
CREATE TABLE IF NOT EXISTS private.artvideo_site_cpf_cache (
 cpf_key text PRIMARY KEY CHECK(cpf_key ~ '^[a-f0-9]{64}$'),
 name_key text NOT NULL CHECK(name_key ~ '^[a-f0-9]{64}$'),
 checked_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
 CONSTRAINT artvideo_site_cpf_cache_valid_expiration CHECK(expires_at > checked_at)
);
CREATE INDEX IF NOT EXISTS artvideo_site_cpf_cache_expires_idx
 ON private.artvideo_site_cpf_cache(expires_at);
REVOKE ALL ON private.artvideo_site_cpf_cache FROM PUBLIC, anon, authenticated;
ALTER TABLE private.artvideo_site_cpf_cache ENABLE ROW LEVEL SECURITY;

-- Apenas o backend com service_role pode ler ou preencher o cache.
CREATE OR REPLACE FUNCTION public.artvideo_site_cpf_cache_read_v1(p_cpf_key text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_name_key text;
BEGIN
 IF p_cpf_key IS NULL OR p_cpf_key !~ '^[a-f0-9]{64}$' THEN
   RETURN jsonb_build_object('hit',false);
 END IF;
 SELECT c.name_key INTO v_name_key
 FROM private.artvideo_site_cpf_cache c
 WHERE c.cpf_key=p_cpf_key AND c.expires_at > now();
 IF NOT FOUND THEN RETURN jsonb_build_object('hit',false); END IF;
 RETURN jsonb_build_object('hit',true,'name_key',v_name_key);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.artvideo_site_cpf_cache_save_v1(
 p_cpf_key text,p_name_key text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
 IF p_cpf_key IS NULL OR p_cpf_key !~ '^[a-f0-9]{64}$'
    OR p_name_key IS NULL OR p_name_key !~ '^[a-f0-9]{64}$'
 THEN
   RAISE EXCEPTION 'Invalid CPF cache digest' USING errcode='22023';
 END IF;
 INSERT INTO private.artvideo_site_cpf_cache (cpf_key,name_key,checked_at,expires_at)
 VALUES(p_cpf_key,p_name_key,now(),now()+interval '7 days')
 ON CONFLICT(cpf_key) DO UPDATE SET
   name_key=excluded.name_key,
   checked_at=excluded.checked_at,
   expires_at=excluded.expires_at;
END;
$fn$;

REVOKE ALL ON FUNCTION public.artvideo_site_cpf_cache_read_v1(text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.artvideo_site_cpf_cache_save_v1(text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.artvideo_site_cpf_cache_read_v1(text)
 TO service_role;
GRANT EXECUTE ON FUNCTION public.artvideo_site_cpf_cache_save_v1(text,text)
 TO service_role;

-- O cron elimina a retenção residual das entradas vencidas, sem depender de acessos ao site.
SELECT cron.schedule(
 'artvideo-site-cpf-cache-prune',
 '0 3 * * *',
 $job$DELETE FROM private.artvideo_site_cpf_cache WHERE expires_at <= now()$job$
);
