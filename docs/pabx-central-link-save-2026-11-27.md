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

## Activation button cadence correction

The subsequent disabled activation button was reproduced with an applied, prepared configuration: `can_activate` accepted only observations younger than 30 seconds, while unchanged reports are intentionally sent every 60 seconds. A rollback probe confirmed that an otherwise valid 45-second observation was rejected.

Migration `20261127132331_align_pbx_activation_observation_cadence.sql` changes only the activation snapshot age to 90 seconds (60-second reporting cadence plus 30-second margin). Incoming native reports still require samples younger than 30 seconds, and the independent signed-agent admission, capacity, revision, zero-call, legacy coverage and tenant checks remain unchanged. The migration requires exactly one matching predicate in the installed function, retaining its remaining definition and permissions.

Nine database assertions passed in a rolled-back transaction: ages 0, 45 and 89 seconds accepted; age 91 seconds and six seconds in the future rejected; unprepared central, active call, pending revision and unknown capacity rejected. The SQL regression suite includes these activation boundaries and applies the migration before testing. Reversal restores only the same activation predicate to 30 seconds after verifying its single occurrence. No account registration, call or capacity increase is part of this correction.

## Actual activation validation

After the user requested activation (revision 3), native validation exposed two compatibility defects. The foreign-account resolver treated every included PJSIP file as a separate reference namespace, so the legacy endpoint could not resolve its authentication object in another included file. References are now resolved across the trusted included sources, with separate AOR/auth namespaces and conflicting definitions rejected. The legacy account files were not edited.

Asterisk 22 also abbreviates long endpoint labels in exact CLI lookups (51 characters observed). Verification ignores table headers and requires a matching label prefix of at least 50 characters plus the complete account-specific inbound context. Missing objects, shorter labels and incorrect contexts remain rejected. Targeted tests reproduced these failures before the fixes.

Initialized Teste's missing call-mode prerequisite from the authoritative revision-1 catalog for its existing 301, preserving both internal and external directions. Native changes used the existing idle-call and transactional backup checks. Each adapter patch was backed up in the onboarding directory and only Teste's agent was restarted; unrelated installed code and legacy accounts were preserved. Operational SIP registration must be confirmed separately from these test results.

After native activation, the isolated-admission checker rejected the profile's own new universal include, causing protocol downgrade and preventing cloud reports. It now accepts that exact generated profile context when the trusted universal attachment is active; complete file comparisons and loaded-context checks still reject foreign includes. The regression exercises both cases. All 443 Python tests passed on Linux and independent review approved the final changes. Both FVX account registrations were then directly confirmed as Registered in Asterisk; this does not by itself validate real call audio or inbound routing.

## Recurring confirmation loss

The user subsequently reproduced Registered alternating with Awaiting confirmation. A multi-cycle native trace located rejection at the lease-renewal readiness guard. The separate observer was repeatedly blocking the manifest after its strict channel parser failed, despite the same collector succeeding from the operator shell.

A read-only transient unit with the observer's exact restrictions reproduced the cause: under `RestrictAddressFamilies=AF_UNIX`, Asterisk's CLI emits the leading notice `Unable to open socket for seeding global EID. You will have to set it manually.` before the otherwise valid response. Boot identity and channel count were valid, but the concise list parser correctly rejected the extra line.

The snapshot collector now removes exactly one occurrence of that exact leading notice for both native and injected command adapters. It normalizes once at collection; the parsers remain strict. Duplicate notices, unknown diagnostics, malformed lists, missing rows, changing snapshots and command failures still fail closed. No address family, network access, admission, capacity, lease or tenant restriction was widened. Tests cover empty and populated channel lists through both collection paths plus unexpected output. Five focused tests and all 444 Python tests passed on Linux, with independent review approval. Backed up the original observer module in the existing onboarding directory and restarted only the observer to load the correction; Asterisk was not restarted.

## Validation

Focused preflight tests: 9 passed. Telephony: 199 passed. Quality: 8 passed. Full `test:ci`, CRM build and site build completed with exit code 0. Deployment must additionally be confirmed in the HostGator production workflow for the resulting main commit.
