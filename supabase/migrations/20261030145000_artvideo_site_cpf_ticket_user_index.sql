-- Índice para exclusões e verificações referenciadas a usuários Auth.
CREATE INDEX IF NOT EXISTS artvideo_site_cpf_tickets_used_by_idx
 ON private.artvideo_site_cpf_tickets (used_by)
 WHERE used_by IS NOT NULL;
