import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const backend = await readFile(new URL('../../../../supabase/functions/sac-digital-api/index.ts', import.meta.url), 'utf8');
const dialog = await readFile(new URL('../presentation/OrderSacDigitalDialog.tsx', import.meta.url), 'utf8');
const orderPage = await readFile(new URL('../../orders/presentation/OrderDetailsPage.tsx', import.meta.url), 'utf8');
const sacPage = await readFile(new URL('../presentation/SacDigitalToolPage.tsx', import.meta.url), 'utf8');

const action = (name, next) => {
  const start = backend.indexOf(`if (action === "${name}")`);
  const end = next ? backend.indexOf(`if (action === "${next}")`, start) : backend.length;
  assert.ok(start >= 0 && end > start, `Missing ${name} branch`);
  return backend.slice(start, end);
};

test('order messages require a real provider protocol, never a notification', () => {
  const code = action('send_order_message', 'send_message');
  assert.match(code, /resolveOrderConversationProtocol\(/);
  assert.match(code, /mode: "protocol"/);
  assert.doesNotMatch(code, /\/notification\/contact|mode: "notification"|pending_start_id:/);
});

test('order attachments require a real provider protocol, never a notification', () => {
  const code = action('send_media', 'send_signature_invite');
  assert.match(code, /resolveOrderConversationProtocol\(/);
  assert.doesNotMatch(code, /\/notification\/contact|manager-client-notification/);
});

test('the order send dialog opens the exact returned protocol', () => {
  assert.match(dialog, /setLastSentProtocol\(confirmedProtocol\)/);
  assert.match(dialog, /onOpenChat\(lastSentProtocol\)/);
  assert.match(orderPage, /params\.set\("protocol", externalProtocol\)/);
  assert.match(sacPage, /item\.external_protocol_id===routeExternalProtocol/);
});

test('opening protocol is confirmed before message delivery', () => {
  assert.match(backend, /const resolveOrderConversationProtocol = async/);
  assert.match(backend, /protocol_opening_pending/);
  assert.match(backend, /\bawait runResourceOperation\(\s*11/);
});

test('messages and attachments sent from an OS use a human operator label', () => {
  const textRoute=action('send_order_message','send_message');
  const mediaRoute=action('send_media','send_signature_invite');
  assert.match(textRoute, /formatSacOutgoingText\(text, await resolveHumanSenderName\(\)\)/);
  assert.match(mediaRoute, /formatSacOutgoingText\(text, await resolveHumanSenderName\(\)\)/);
  assert.doesNotMatch(textRoute, /formatSacOutgoingText\(text, "Sistema"\)/);
  assert.doesNotMatch(mediaRoute, /fromOrder \? 'Sistema'/);
});

test('deep-link syncs exact external protocol before selection and handles async availability', () => {
  assert.match(sacPage, /refreshSacDigitalProtocol\(activeOrganizationId,routeExternalProtocol\)/);
  assert.match(sacPage, /listSacDigitalProtocols\(activeOrganizationId,true,user\?\.id \|\| ""\)/);
  assert.match(sacPage, /handledProtocolRouteRef\.current=targetKey/);
  assert.match(sacPage, /Tentar novamente/);
  assert.match(sacPage, /visibleProtocols\.find\(item=>\s*!item\.is_pending && item\.external_protocol_id===routeExternalProtocol\)/);
});

test('OS message modal has a separate success step with Open conversation and Close', () => {
  assert.match(dialog, /useState<"compose" \| "success">\("compose"\)/);
  assert.match(dialog, /setStep\("success"\)/);
  assert.match(dialog, /step === "success" \? \(/);
  assert.match(dialog, /Mensagem enviada com sucesso!/);
  assert.match(dialog, /Documento enviado com sucesso!/);
  assert.match(dialog, /onOpenChat\(lastSentProtocol\)/);
  assert.match(dialog, /<BtnSecondary onClick=\{onClose\}>Fechar<\/BtnSecondary>/);
  assert.match(dialog, /setStep\("compose"\)/);
  assert.doesNotMatch(dialog, /sendSucceeded|notifyAdmin\(/);
});

test('OS text uses the authorized operator endpoint, not the Client API', () => {
  const code=action('send_order_message','send_message');
  assert.match(code,/runResourceOperation\(\s*78,/);
  assert.doesNotMatch(code,/fetchJson\(\s*`\$\{SAC_API_BASE_URL\}\/protocol\/send`/);
});

test('OS attachments use the authorized operator instead of the Client API', () => {
  const code=action('send_media','send_signature_invite');
  assert.match(code,/const mediaTransport = fromOrder \? "operator-protocol"/);
  assert.match(code,/runResourceOperation\(\s*78,/);
  assert.doesNotMatch(code,/manager-client-protocol/);
});

test('legacy OS echoes are reconciled only when a matching OS send exists', () => {
  assert.match(backend,/const legacyOrderEcho = historyBy === "contact"/);
  assert.match(backend,/metadata\.sent_from_service_order/);
  assert.match(backend,/Math\.abs\(localTime - targetTime\) <= 10_000/);
});

test('success step omits the redundant customer and OS summary card', () => {
  const start=dialog.indexOf('{step === "success" ? (');
  const end=dialog.indexOf(') : (',start);
  assert.ok(start>=0 && end>start);
  const success=dialog.slice(start,end);
  assert.doesNotMatch(success,/orderCustomerName\(order\)|order\?\.os_number/);
  assert.match(success,/Mensagem enviada com sucesso!/);
});

test('historical provider echoes from OS are hidden but retained for audit', async () => {
  const repo = await readFile(new URL('../infrastructure/sac-digital.repository.ts', import.meta.url), 'utf8');
  assert.match(repo, /suppressed_legacy_order_echo !== true/);
  assert.match(sacPage, /const senderHeading =/);
  assert.match(sacPage, /<strong className="font-bold">\{senderHeading\[1\]\}<\/strong>/);
});
