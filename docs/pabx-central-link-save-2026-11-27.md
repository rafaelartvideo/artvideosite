# SIP line save: missing company central

## Cause and correction

On 2026-11-27, Teste's universal telephony save failed with PostgreSQL 23514 at the enabled-agent prerequisite in `private.pbx_save_universal_telephony`. The company had an enabled PBX module and a managed extension, but no authorized agent. The generic unconfirmed-write message obscured this prerequisite.

The application now checks `pbx_list_agents` for the current company before sending SIP credentials. Missing linkage has an actionable message. Authorization, revision and validation failures use allowlisted messages; raw backend errors are not rendered. Organization/user changes invalidate the preflight and credential form. The database remains authoritative and no validation is bypassed.

## Operational repair

- Provisioned Teste's own profile on the existing VPS, with its private key retained on the server and a separate company context.
- Authorized agent `ca6f3168-23ed-49da-878f-bac1863b3cb4` for company `5bcd7ec7-38f0-4dda-a84c-10429bd46b23`.
- Prepared internal routes and universal telephony, then enabled the existing agent service template for that profile.
- Backup: `/root/union-pbx-onboard-20261127-teste/before.tgz`; protected legacy file hashes were unchanged after provisioning. Internal-route backup is retained under the agent's config-backups directory.
- Verified signed protocol 3 admission, isolated profile, fresh heartbeat/capability, service active and extension 301 applied. The central had no active calls during configuration.
- Exercised the public save function under the existing company owner's authenticated context using an empty, inactive document inside a transaction followed by `ROLLBACK`. Save accepted revision 1; a subsequent check confirmed zero persisted universal configurations. No test credentials or SIP connections were saved or activated.

No schema migration, Edge Function deployment, production SIP registration change or paid capacity upgrade was required. Existing FVX configuration was preserved. The user's actual line still requires saving its own credentials and subsequent operational validation.

## Follow-up after the actual save

The user subsequently saved two connections (revision 2), exposing a second provisioning prerequisite: the new profile lacked its per-unit `90-union-universal.conf` drop-in. Installed the same reviewed observer dependency and limited writable universal state paths already used by existing profiles; restarted only Teste's agent with no active calls.

Successful observations were then rejected because they were sampled before the previous 30-second agent sleep, outside the database's 30-second freshness window. Reports now sample native state under the operation lock only when a report is due. Sampling failure omits that report while preserving feature/revision polling for recovery. Cached successful timestamps are never changed and database freshness checks remain intact.

Backed up both installed Python modules under `runtime-before-fresh-report` in the onboarding backup directory. Deployed only the two reviewed function changes, preserving all other installed code, and restarted only Teste's service. Confirmed revision 2 applied, preparation and legacy coverage true, and no error in Supabase. Routing remains inactive; this verifies saved configuration and preparation, not SIP registration or real calls. The reported shared global capacity of one was not increased.

Follow-up native validation: 13 focused tests and all 439 Python agent tests passed on Linux using an isolated candidate directory. The initial broad run lacked non-Python fixture files; after including those fixtures, the full suite passed. Subsequent signed service polls kept the configuration applied with fresh observations. No database validation or freshness window was loosened.

## Validation

Focused preflight tests: 9 passed. Telephony: 199 passed. Quality: 8 passed. Full `test:ci`, CRM build and site build completed with exit code 0. Deployment must additionally be confirmed in the HostGator production workflow for the resulting main commit.
