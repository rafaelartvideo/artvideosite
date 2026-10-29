# Performance incident remediation

Scope: production CRM and Artvideo site, especially OS request storms,
Storage authorization, login, tenant switching, Agenda and technician panel.

1. Correlate production logs, recent commits, pg_stat_statements and authenticated
   query plans; retain baseline timings and access results.
2. Fix the confirmed Storage policy query-plan regression without changing any
   permission predicate, role, grant, table RLS or stored user data. Reproduce
   with a failing SQL plan test before applying the migration.
3. Compare authorized photo IDs for the same four identities before/after and
   repeat the exact EXPLAIN ANALYZE. Check unrelated buckets and anonymous access.
4. Inspect frontend request lifecycles and Realtime subscriptions. Add focused
   behavioral tests for any additional confirmed defect before changing code.
5. Run regression, finance and SAC suites plus both production builds. Commit
   the verified changes through GitHub with a guarded update of main, preserving
   concurrent work. Verify deployment and exercise the real UI, including tenant
   A → B → A, photos, Agenda, technician panel and public product/service pages.
6. Report measured results with time windows, applied commits and remaining
   limitations. Historical statistics are not controlled before/after benchmarks.
