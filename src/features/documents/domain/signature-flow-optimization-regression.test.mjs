import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(path, "utf8");

test("send dialog reuses the previously fetched signature requests and hides all checks behind loading", () => {
  const section = read("src/features/orders/presentation/OrderSignatureRequestsSection.tsx");
  const dialog = read("src/features/orders/presentation/OrderSignatureRequestDialog.tsx");
  assert.match(section, /existingRequests=\{requests\}/);
  assert.match(section, /requestsLoading=\{loading\}/);
  assert.match(section, /requestsError=\{requestsError\}/);
  assert.match(dialog, /providedRequests = Array\.isArray\(existingRequests\)/);
  assert.match(dialog, /currentRequests = providedRequests \? existingRequests : directRequests/);
  assert.match(dialog, /currentRequests\.find\(/);
  assert.match(dialog, /if \(!open \|\| providedRequests \|\| !order\?\.organization_id \|\| !order\?\.id\) return/);
  assert.match(dialog, /listOrderSignatureRequests\(order\.organization_id, order\.id\)/);
  assert.match(dialog, /const checkingRequests = providedRequests \?/);
  assert.match(dialog, /const preparing = requestsLoading/);
  assert.match(dialog, /min-h-\[240px\].*items-center justify-center/);
  assert.match(dialog, /LoadingState text="Preparando envio para assinatura\.\.\."/);
  assert.doesNotMatch(dialog, /Verificando assinaturas ativas da OS/);
  assert.match(dialog, /\[configuredTemplate, company\] = await Promise\.all/);
});

test("PDF upload token is generated only after tenant and OS authorization, with backward-compatible fallback", () => {
  const admin = read("supabase/functions/document-signature-admin/main.ts");
  const repo = read("src/features/documents/infrastructure/document-signatures.repository.ts");
  const dialog = read("src/features/orders/presentation/OrderSignatureRequestDialog.tsx");
  assert.match(admin, /requirePermission\(adminClient, user\.id, organizationId, "documents\.signatures\.send"\)/);
  assert.match(admin, /ensureOrderVisible\(authClient, organizationId, serviceOrderId\)/);
  assert.ok(admin.indexOf('const pdfUploadPromise =') > admin.indexOf('persisted = true'));
  assert.match(admin, /createSignedUploadUrl\(basePdfPath, \{ upsert: true \}\)/);
  assert.match(admin, /base_pdf_upload: basePdfUpload/);
  assert.match(repo, /preparedUpload \?\? await invokeSignaturePdf/);
  assert.match(repo, /"commit_base_pdf"/);
  assert.match(dialog, /result\.base_pdf_upload/);
});

test("PDF section heading has breathing room below the text", () => {
  const printer = read("src/features/documents/domain/order-print-document.ts");
  const freeze = read("src/features/documents/domain/order-print-freeze-style.mjs");
  assert.match(printer, /min-height:25px;padding:5px 8px 7px;background:#eef3f9/);
  assert.match(printer, /font-size:" \+ layout\.section_title_font_size \+ "pt;line-height:1\.35/);
  assert.match(freeze, /scale: 2,/);
});

test("signature preparation notifications are suppressed, only signed is announced, and own alerts are excluded", () => {
  const sql = read("supabase/migrations/20261105200000_signature_notifications_only_on_signed_exclude_self.sql");
  const notifications = read("src/features/notifications/infrastructure/notifications.repository.ts");
  assert.match(sql, /if v_after_status is distinct from 'signed' then return null/);
  assert.match(sql, /new\.title := 'Documento assinado'/);
  assert.match(sql, /and notification\.actor_user_id is distinct from \(select auth\.uid\(\)\)/);
  assert.match(notifications, /if \(row\.actor_user_id === userId\) return/);
});

test("both signature entry points are safe: the OS shortcut mounts only when open", () => {
  const details = read("src/features/orders/presentation/OrderDetailsPage.tsx");
  const section = read("src/features/orders/presentation/OrderSignatureRequestsSection.tsx");
  const dialog = read("src/features/orders/presentation/OrderSignatureRequestDialog.tsx");
  assert.match(details, /detail && !monitorView && signatureRequestOpen && <OrderSignatureRequestDialog/);
  assert.match(section, /existingRequests=\{requests\}/);
  assert.match(section, /requestsLoading=\{loading\}/);
  assert.match(dialog, /existingRequests\?: DocumentSignatureRequestSummary\[\]/);
  assert.match(dialog, /currentRequests\.find\(item =>/);
  assert.match(dialog, /const checkingRequests = providedRequests \?/);
  assert.match(dialog, /currentRequestsError = providedRequests \?/);
  assert.match(dialog, /if \(message\.includes\("Já existe uma solicitação ativa"\)\) refreshRequests\(\)/);
});
