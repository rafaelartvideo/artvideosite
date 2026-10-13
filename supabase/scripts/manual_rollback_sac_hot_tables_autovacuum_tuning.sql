-- RUN ONLY AFTER USER APPROVAL. Restore table-specific autovacuum defaults.
set lock_timeout='4s';
alter table public.sac_digital_messages reset (
 autovacuum_vacuum_scale_factor,autovacuum_vacuum_threshold,
 autovacuum_analyze_scale_factor,autovacuum_analyze_threshold
);
alter table public.sac_digital_protocols reset (
 autovacuum_vacuum_scale_factor,autovacuum_vacuum_threshold,
 autovacuum_analyze_scale_factor,autovacuum_analyze_threshold
);
alter table public.sac_digital_jobs reset (
 autovacuum_vacuum_scale_factor,autovacuum_vacuum_threshold,
 autovacuum_analyze_scale_factor,autovacuum_analyze_threshold
);
