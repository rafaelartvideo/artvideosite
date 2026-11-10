-- Public invoker facades call private helpers with explicit EXECUTE grants.
-- Preserve all end-user/schema ACLs; only the trusted Edge service needs USAGE.
grant usage on schema private to service_role;
