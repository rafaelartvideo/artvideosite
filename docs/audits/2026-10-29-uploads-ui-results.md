# Uploads, resources and professional UI audit — 29 October 2026

## Scope and result
Continuation of the approved Union World/Artvideo audit, based on current main `6cf6531` (includes quote photos, optional company identity and three-column print layout). Preserve data, RLS, original documents and established navigation. No database migration or production object deletion in this round.

## Corrections
- Central image preparation deduplicates concurrent calls by File/preset with weak references. It closes ImageBitmap, releases canvas buffers, supports HTMLImageElement fallback and preserves actual MIME/extensions when WebP encoding is unavailable. PNG/WebP animation is preserved, as are alpha transparency and signed/scanned document bytes.
- Correct the quality loop so it reaches its configured minimum instead of stopping early on floating-point comparisons.
- Technician photos, public quote equipment/label/location photos, management logos, SAC photos and avatars now use the central compressor. Existing OS, checklist, catalog, WhatsApp and new internal quote-photo paths were inspected. Public quote photos are prepared sequentially before creating the request to avoid concurrent large camera decodes and predictable attachment-size failures after request creation.
- Endpoint limits are enforced after preparation: technician 5 MB; public quote 6 MB; management logo 3 MB; SAC 1 MB; mobile photos/checklists/situations 10 MB. Generic mobile attachment originals retain their separate backend limits (20 MB).
- PDF renderer loads only on export. Cleanup removes only that worker's DOM, including failures, without removing another simultaneous export's overlay.
- Malformed percent-encoded admin resource links no longer throw URIError and crash the shell.
- WhatsApp temporary previews have explicit ownership. Failed sends, company switches and unmounts release abandoned URLs; pending audio keeps its preview until its outbox lifecycle completes. Pending image optimization is invalidated when leaving the scope.
- Shared cards, tables, search panels, fields, header/profile menus and sidebar use semantic theme tokens, restrained shadows, numeric table alignment, consistent headings and keyboard focus. Root/portal tokens preserve Union blue and light/dark contrast. Public service fields have clearer placeholder, focus and invalid states. No new animation or loading screen.
- Generated site output is ignored alongside CRM output; build artifacts are excluded from source commits.

## Evidence
| Check | Before | After |
|---|---:|---:|
| Isolated PDF module initial dependency graph, esbuild minified | 1,031,097 bytes | 40,714 bytes |
| PDF renderer deferred until export | eager | approximately 990 KB removed from that isolated initial graph |
| Dark blue highlight contrast on #111827 | 5.39:1 | 8.08:1 |
| Concurrent file/preset preparation | repeated decode/encode | one shared preparation |

The isolated graph is a controlled code-level measurement, not a whole-page/network benchmark. Optimizer tests use a simulated encoder to exercise size, MIME and lifetime boundaries: no real-photo compression percentage is claimed.

Observed backend window 15:50–16:05 Brasília (18:50–19:05 UTC): 1,027 edge requests, zero HTTP 5xx and zero PostgreSQL statement-timeout log entries. This precedes this deployment and describes current backend health, not a gain caused by these frontend changes.

## Verification before publishing
- Regression/performance commands: 254 tests pass (39 + 199 + 6 + 10).
- Finance: 28 pass. SAC: 189 pass.
- Documents: 29 pass (includes four PDF tests also run by regressions).
- WhatsApp domain: 7 pass (includes preview ownership test also run by regressions).
- Site build passes; CRM final build passes; expected large-chunk warning remains.
- Independent combined review found no blocker; checked MIME, transparency, originals, limits, pre-RPC compression and portal theme cleanup.

## Limits and follow-up evidence
- No irreversible cleanup, historical recompression, deletion of orphaned Storage objects or removal of indexes/policies was performed. Those require a concrete inventory and approval.
- HEIC/HEIF and unsupported decoder formats retain original bytes and may fail endpoint size/type limits; they are not silently converted or flattened.
- All physical devices, all permission combinations, real large-photo uploads and external message delivery were not exhaustively tested. Test code does not substitute for real-device QA.
- Notification fallback polling already runs every 60 seconds without window-focus refetch or automatic retry. Inspected Realtime subscriptions remove listeners/timers/channels. The notification RPC materializes visible tenant notifications; current table estimates are 1,889 notifications and 1,908 read entries. Growth should be measured with an authenticated EXPLAIN before changing authorization/count semantics.
- Large PDF renderer and remaining route chunks still cost transfer/parse time when actually used. The renderer is deferred, not removed.
- Prior legacy hardcoded neutral styles remain in some feature screens. This round improves shared components and confirmed theme problems, not a claim that every individual screen/device has been redesigned.

## Rollback
Revert the frontend commit and redeploy. There are no schema/data changes to reverse.
