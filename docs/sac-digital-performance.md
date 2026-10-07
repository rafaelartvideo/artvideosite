# SAC Digital loading regression — 2026-10-07

The initial screen awaited unread counters, while bootstrap/history writes emitted
one Realtime notification per changed row. Every notification fetched the entire
inbox and counters again, with no coalescing or shared in-flight reads. Database
statistics showed thousands of calls averaging 1.80 s for protocols and 2.56 s for
unread counts; multiple protocol queries were active concurrently.

The authenticated unread query reproduced `57014` with a one-second budget. Its
error context identified `has_organization_permission` through
`has_effective_organization_permission`. A baseline EXPLAIN measured 3554.525 ms.
The migration preserves that exact authorization predicate, but evaluates the
allowed organization set once per statement using an InitPlan, rather than once
per joined row. It also adds an organization/incoming-message index. Customer
permissions and all write policies remain unchanged.

After applying the migration, the same authenticated unread query returned the
same 13 protocol groups in 72.996 ms. A protocol/contact/customer read returned
388 protocols in 261.075 ms, under the one-second regression budget. An unrelated
JWT subject received zero protocols, contacts, messages, pending starts and
unread groups. Tests change transaction-local claims only; no customer messages
are sent and no history is removed.

The client now renders its sections after integration status is available;
inbox and counters load independently. In-flight inbox/history/counter reads are
shared, Realtime bursts are batched with at most one trailing refresh, and
bootstrap starts after the initial render. Browser tabs no longer drain server
jobs; the private scheduled worker remains responsible for that queue.

Validation: domain concurrency/burst/retry/disposal tests, existing SAC/CRM/finance
suites, CRM production build, and an isolated browser test with unread counters
held pending and 100 Realtime events (one protocol refresh, usable screen, zero
page errors). Live SQL verification is read-only and organization permission
checks remain in force. `tests/sac/read-performance.sql` accepts transaction-local
`test.sac_organization` and JWT settings from its runner.
