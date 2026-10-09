import test from 'node:test';
import assert from 'node:assert/strict';
import { sacSenderFirstName, formatSacOutgoingText } from './sac-message-label.mjs';
test('operador: primeiro nome em negrito', () => {
  assert.equal(formatSacOutgoingText('Olá, tudo bem?', 'Rafael Lima'), '*Rafael*\n\nOlá, tudo bem?');
  assert.equal(formatSacOutgoingText('Bem-vindo!', 'Ana Maria'), '*Ana*\n\nBem-vindo!');
});
test('mensagens institucionais: Sistema em negrito', () => {
  assert.equal(formatSacOutgoingText('Assine seu documento.', ''), '*Sistema*\n\nAssine seu documento.');
  assert.equal(sacSenderFirstName('Sistema'), 'Sistema');
});
test('preserva o corpo e não repete o horário do WhatsApp', () => {
  assert.equal(formatSacOutgoingText('   ', 'Rafael'), '');
  assert.equal(formatSacOutgoingText('linha 1\nlinha 2', 'Ana'), '*Ana*\n\nlinha 1\nlinha 2');
  assert.equal(formatSacOutgoingText('Oi', '*Bia* Costa'), '*Bia*\n\nOi');
});
