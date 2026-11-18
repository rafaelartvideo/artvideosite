# Notification payload materialization experiment

No production migration is proposed. The current `SECURITY INVOKER` RPC remains
unchanged. Moving payload loading after the limit saves temporary storage for
some larger inboxes, but adds a second notification RLS check for every selected
row and measurably slows the small inbox fixture. Narrowing only the authorized
materialization avoids that extra RLS check but adds another full payload CTE
scan; it also has mixed timing results and increases temporary block reads when
the payload materialization spills. These results do not justify shipping either
candidate as a general performance improvement.

## Reproduce without production access

Install `@electric-sql/pglite@0.5.16` into a disposable directory outside this
repository, then run in PowerShell:

```powershell
$env:PGLITE_MODULE='C:/external/node_modules/@electric-sql/pglite/dist/index.js'
$env:FIXTURE_ROWS='100'
$env:FIXTURE_BLOCKS='32'
node supabase/tests/notification-payload-materialization.mjs
```

Repeat with `FIXTURE_ROWS=10000` / `FIXTURE_BLOCKS=32`, or `1000` / `256`.
The runner creates a fresh in-memory database, imports the baseline RPC and
notification SELECT policies directly from their migrations, and creates two
experimental functions only inside that database. It never reads credentials,
connects to a remote database, installs dependencies, or applies migrations.

`notification-payload-materialization-fixture.sql` is synthetic bootstrap and
seed data for that runner; do not apply it to an application database. Its
membership and permission helpers are intentionally simplified stand-ins.
Notification policies and scope/relevance functions are imported unchanged.

## Behavioral checks

Each candidate is compared to baseline with full JSON equality across 240 cases
per fixture: two organizations; a member, outsider, and null user; limits null,
-1, 0, 1, 2, 50, 100, and 101; normal grants, personal receive enabled, no receive,
no personal view, and no inbox view. The authenticated role has neither superuser
nor RLS-bypass privileges. Rows include own actors, other recipients, irrelevant
audit events, denied module/visibility grants, tied dates, and own/other users'
read/dismiss states. Additional assertions check nonempty authorized results,
empty unauthorized results, actor/recipient isolation, dismissals, read state,
delivery separation, limit clamping, and date/ID ordering.

## Local measurements, 18 November 2026

Engine: PostgreSQL 18.6 / PGlite 0.5.16, WebAssembly, `work_mem=1MB`.
Each plan uses one warmup and three `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`
samples of the extracted RPC body with limit 50. Payloads are synthetic MD5
strings, with 32 bytes per block before JSON overhead. The runner prints widths,
temporary blocks, payload scan plans, and execution times for independent review.

| Fixture | Baseline ms | Late payload ms | Narrow authorized ms |
| --- | --- | --- | --- |
| 100 rows, approximately 1 KB metadata | 11.883 / 10.858 / 12.421 | 13.726 / 14.300 / 13.464 | 12.473 / 25.865 / 15.212 |
| 1000 rows, approximately 8 KB metadata | 122.428 / 128.063 / 117.358 | 110.289 / 112.592 / 115.590 | 112.308 / 113.661 / 125.588 |
| 10000 rows, approximately 1 KB metadata | 910.796 / 1163.027 / 1077.501 | 807.000 / 836.726 / 869.482 | 1233.012 / 1883.094 / 2140.417 |

All these fixtures pass 240 full-JSON equivalence cases for each candidate.
The larger payload fixture has zero temporary blocks for all three plans; large
TOAST-backed metadata does not automatically imply expensive payload copying.
The late-payload plan adds primary-key lookups with a second RLS evaluation for
the selected rows. The original materializations still require the full history
to preserve the exact unread count.

For the 100-row fixture, estimated visible/authorized plan widths are 1192/393
bytes for baseline, 39/65 for late payload, and 1192/17 for narrow authorized.
For the 8 KB metadata fixture, baseline visible width is only 165 bytes because
the large metadata is externally stored. Estimated plan widths are not measured
total memory consumption.

The 10000-row fixture has 6219 visible notifications. Baseline reads/writes 2118
temporary blocks in every sample; late payload reads/writes zero; narrow
authorized reads 2608 and writes 1711. The late-payload benefit on this spilling
fixture does not eliminate the measured regression on small inboxes. The timing
spread, particularly for the last candidate, also demonstrates local noise.

Timings are local diagnostic evidence, not production latency estimates or a
claimed percentage improvement. These samples use simplified indexed permission
helpers, a virtual filesystem, and a WebAssembly engine. They do not reproduce
production helper cost, data distributions, cache state, concurrency, PostgreSQL
version, native disk behavior, or hosting conditions. No production scans or
permission/policy/helper changes were made.
