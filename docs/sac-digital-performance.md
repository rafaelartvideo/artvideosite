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

## 2026-10-09: sessions, routing, outbox and reconciliation

Routine Operator requests no longer log in as Client to repeatedly resolve an
already verified Operator identity. The saved OAuth grant still rechecks active
membership, binding/version and credentials; SAC validates the Bearer on every
operational request. Client reads share a Vault-backed cache keyed by company,
current credential fingerprint and canonical scopes, with a durable login lease,
expiry, failure cooldown and conditional invalidation for late 401 responses.
The token table has no direct API privileges; only the service-role RPC accesses it.

Routing uses protocol-specific Operator destinations. Returning to the queue
selects the protocol, reads its current Operator department and forwards that ID;
Client department IDs are not interchangeable. New OAuth consent requests include
`department`; older grants continue to support existing operations and report a
specific notice if department listing requires new consent.

The composer consumes each draft synchronously and immediately displays a local
bubble. Per-Operator sends are ordered without blocking the next draft. Every
attempt carries a client request ID, records preparation before transport, and
correlates server IDs and Realtime updates. Explicit rejection allows editing the
failed draft; unknown outcomes retain correlation and are never automatically
resent. Provider acceptance, sending, delivery and reading remain distinct.
History UPDATE events refresh the open conversation, including delivery changes;
bulk historic INSERT events remain suppressed. Relevant reads run in parallel
with a 250 ms debounce instead of serial full-inbox refreshes with 900 ms delay.

Confirmed protocol operations project their local state before background
metadata enrichment. The worker claims newly created reconciliation jobs in the
same invocation and processes at most three jobs concurrently. Enrichment and
history each run once per reconciliation job, rather than history running twice.

Validation: 133 SAC tests, 14 CRM regression tests, 28 finance tests and CRM build.
The cache/Vault SQL regression rolls back all fixture writes; verified owner leases,
cold-process reuse, expired lease protection, credential mismatch, conditional
invalidation, failure cooldown and denied anon/authenticated/direct table access.
No real customer message or protocol mutation was used to test this release.
