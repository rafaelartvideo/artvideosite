-- The SAC messages/protocols/jobs tables are small but update-heavy.
-- Lower autovacuum threshold improves index-only read visibility and limits bloat.
set lock_timeout='4s';
alter table public.sac_digital_messages set (
 autovacuum_vacuum_scale_factor=0.05,
 autovacuum_vacuum_threshold=100,
 autovacuum_analyze_scale_factor=0.05,
 autovacuum_analyze_threshold=100
);
alter table public.sac_digital_protocols set (
 autovacuum_vacuum_scale_factor=0.05,
 autovacuum_vacuum_threshold=100,
 autovacuum_analyze_scale_factor=0.05,
 autovacuum_analyze_threshold=100
);
alter table public.sac_digital_jobs set (
 autovacuum_vacuum_scale_factor=0.05,
 autovacuum_vacuum_threshold=100,
 autovacuum_analyze_scale_factor=0.05,
 autovacuum_analyze_threshold=100
);
