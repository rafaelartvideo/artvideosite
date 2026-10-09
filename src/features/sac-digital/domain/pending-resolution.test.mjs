import assert from 'node:assert/strict';
import test from 'node:test';
import { pendingStartHasProtocol } from './pending-resolution.mjs';

const pending = { contact_id: 'contact-A', sent_at: '2026-10-09T14:00:00Z' };
const item = (override = {}) => ({
  contact: { id: 'contact-A' }, status: 'in_att', opened_at: '2026-10-08T14:00:00Z',
  closed_at: null, is_pending: false, ...override,
});
test('associa notificação a protocolo ativo anterior, sem duplicação visual', () => {
  assert.equal(pendingStartHasProtocol(pending, [item()]), true);
});
test('associa a protocolo criado após envio, mesmo se finalizado', () => {
  assert.equal(pendingStartHasProtocol(pending, [item({ status: 'finished', closed_at: '2026-10-09T14:03:00Z', opened_at: '2026-10-09T14:01:00Z' })]), true);
});
test('não confunde contato diferente nem protocolo antigo finalizado', () => {
  assert.equal(pendingStartHasProtocol(pending, [item({contact:{id:'contact-B'}})]), false);
  assert.equal(pendingStartHasProtocol(pending, [item({status:'finished',closed_at:'2026-10-08T15:00:00Z'})]), false);
});
test('preserva notificação ainda sem protocolo', () => {
  assert.equal(pendingStartHasProtocol(pending, []), false);
  assert.equal(pendingStartHasProtocol(pending, [item({is_pending:true})]), false);
});
