import test from 'node:test';
import assert from 'node:assert/strict';
import { newConversationRoute } from './sac-gateway.ts';

test('nova conversa sem protocolo deve ser encaminhada, não notificada', () => {
  assert.equal(newConversationRoute('operator', null), 'forward');
  assert.equal(newConversationRoute('manager', null), 'forward');
});
test('conversa aberta respeita a modalidade e o perfil autenticado', () => {
  assert.equal(newConversationRoute('operator', {isAtt:true}), 'operator');
  assert.equal(newConversationRoute('operator', {isAtt:false}), 'client');
  assert.equal(newConversationRoute('manager', {isAtt:true}), 'notification');
});
