# Auth loading optimization implementation plan

Goal: shorten authenticated startup and avoid full-screen loading during same-tenant access refresh.

Architecture: retain all server authorization checks; bundle the selected tenant's access window in the existing bootstrap RPC. Refresh an already authorized tenant in place, and prefetch only Home code during sign-in.

Spec: the owner's 11 November request to restore login, preserve tenancy/security, and remove unnecessary loading. Existing Home/OS skeletons remain available for initial data loads.

Constraints: no data removal, security bypass, timeout increases, dependencies, or unrelated business workflow changes. Main is the delivery branch per AGENTS.md.

Review focus: malformed access windows fail closed; older backend fallback; denied schedules; organization switches must block; refresh errors must clear resolved access.

- [x] Reproduce login failure, compare published build and server logs, recover the unhealthy instance with explicit owner approval.
- [x] Add runtime tests for bundled and legacy access windows and tenant-aware loading policy. Observe failure before implementation.
- [x] Add server contract test; observe missing accessWindow failure before migration.
- [x] Deploy the additive bootstrap field without changing function privileges; verify existing and new SQL contracts.
- [x] Run 782 regression tests and both builds; review diff including malformed schedule boundary rejection. Deliver via one validated optimization commit to main.
- [ ] Confirm FTPS success and published asset hash; revalidate login/session restoration, Dashboard and Orders in production.

Evidence before optimization: profile SELECT planned/executed in 2,911 ms while degraded, then 14 ms after restart, with only two shared-buffer hits in both cases. Real login, Dashboard indicators and the OS list loaded after recovery. The underlying infrastructure trigger cannot be proved from unavailable fine-grained telemetry.

Validation: existing and new SQL contracts passed; security advisors unchanged (five existing notices, no new findings). Restricted allowed windows reject missing, invalid or reversed server timestamps. Migration applied as 20261111233237; exact rollback function preserved.
