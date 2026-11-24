# Technician permission cache validation

This harness creates a fresh, disposable PGlite database. It uses synthetic IDs and data, reads no credentials, and never connects to Supabase. Install `@electric-sql/pglite@0.5.16` outside the repository. No repository dependency is required.

From the repository root in PowerShell:

```powershell
$env:PGLITE_MODULE='C:/Users/Usuario/AppData/Local/Temp/union-audit-postgres/node_modules/@electric-sql/pglite/dist/index.js'
node supabase/tests/technician-permission-cache.mjs
```

The candidate SQL comes from `20261124125650_optimize_technician_permission_evaluation.sql`. The baseline detail function comes from `20261028124442_technician_customer_document_permission.sql`; the baseline list comes from `20261015084000_employee_self_schedule_and_technician_order_counts.sql`. Those bodies match the live definitions inspected on 2026-11-24. In particular, the live list does not return `order_services_completed`, so this fixture verifies that the performance change does not add it.

The fixture runs the production assignment helper from `20261014190000_technician_order_secure_details_actions.sql`. Its lower membership, effective-permission and access-window helpers are synthetic, configurable stand-ins. A sequence-backed wrapper counts actual calls without changing the assignment helper's predicates. Each read executes as a non-superuser role without `BYPASSRLS`; the read functions retain their existing `SECURITY DEFINER` behavior.

The 616 comparisons cover 22 modes, four callers (including no session), four detail targets and three organization targets. Modes include every independent field permission denial, disabled module, inactive employee, closed access window, revoked membership, reassigned tasks and an item whose tenant does not match its task. Each comparison requires identical JSON results or identical error SQLSTATE. Authorized cases verify nonempty results, task ordering, document/technical-value/photo payloads and the unchanged list response fields.

The successful run measured detail access-helper calls decreasing from 21 to 11, and nested effective-permission calls from 42 to 22. Listing three assigned tasks decreased effective-permission calls from 34 to 9.

These are SQL execution and call-count results on a synthetic database. They do not establish production latency improvement, reproduce the complete production permission engine, or identify the cause of a database-wide stall. Production deployment and bounded before/after measurements remain separate checks.
