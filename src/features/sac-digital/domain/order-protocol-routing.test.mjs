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
  assert.match(dialog, /onOpenChat\(lastSentProtocol \|\| undefined\)/);
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
