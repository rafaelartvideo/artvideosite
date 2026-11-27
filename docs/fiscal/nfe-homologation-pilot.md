# Pilot NF-e — homologação
This is a staged pilot for the platform administration, not the final tenant issuance UI. It does not change the existing NFS-e draft tables or any commercial/financial/stock entries.

## Contract and rollout
Based on Fiscontrole's documented create, validate, issue, process_pending, detail and download contract supplied on 27/11/2026. Always environment 2, model 55. No actual tax calculations are invented. The first scenario is a single item, domestic sale in Sergipe, non-ICMS-contributing consumer, cash payment, and a provider-selected versioned profile. Other regions, tax scenarios and multiple items need generalization before normal tenant use.

- A platform administrator must verify the CNPJ and numeric ID in the provider panel. A matching explicit issuer response is preferred. If the response has no explicit identity, a manually attested panel mapping is allowed **only** while the account inventory and current accessible CNPJs contain exactly one company. A mismatch always blocks. This does not grant production access. Shared accounts with multiple CNPJs require authoritative identity.
- Every action checks active membership, the platform management permissions, target company module, verified CNPJ, account state and current session revision. Issuer/operations are server-only tables protected by RLS and revoked direct browser grants.
- The operations ledger is distinct from the commercial invoice entity: stores the prepared snapshot, immutable local request ID, remote UUID, revision, idempotency key and state. A partial unique index blocks a second open operation. Claims precede provider calls. Unknown result blocks retry rather than creating another note.
- Issue and process require separate explicit confirmation; only an authorized detail with protocol permits XML/PDF downloads. Downloads validate MIME and checksum (assumed SHA-256 hex; if actual contract differs, adapt after inspecting real response).
- Actual validation/detail/profile return schemas are not completely specified in the documentation. Unknown shapes fail closed. No real authorization has been tested. Readiness does not establish actual authorization.
- No financial, inventory or OS effects for homologation. No production calls, no NFS-e or NFC-e transmission. NFS-e Aracaju remains pending provider coverage.

## Release gates
1. Review PR and CI, run candidate SQL 07 in disposable database, review privileges and production schema compatibility.
2. Register exact migration and apply only after verification. Existing capture migrations are not rerun.
3. Deploy fiscal-admin including nfe-homologation.mjs, nfe-admin-service.mjs, emission-diagnostics.mjs and fiscontrole-provider.mjs; require JWT and existing ACL. Keep FISCAL_NFE_HOMOLOGATION_ENABLED unset/false until reviewed.
4. Publish frontend. Enable the dedicated switch for homologation only via approved configuration. Confirm Artvideo mapping, inspect actual catalog fields, create/validate one draft, verify returned schema. No issue/process until explicit operator confirmation.
5. Before production: real contract checks, persistent reconciliation and recovery for locked/uncertain drafts, edits using /save with revision, fiscal review, separate production privileges, audit, integration with existing OS/stock/finance and canonical fiscal documents. Do not bypass the database and provider production locks.

Known limits: current pilot stops at unrecognized profile/validation/authorization schemas; validation-rejected/uncertain/claimed operations need a reconciliation/revision flow, not a new note. Do not manually change states to bypass this lock. The existing capture continues independently.
