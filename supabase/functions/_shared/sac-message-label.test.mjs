import test from 'node:test';
import assert from 'node:assert/strict';
import { sacSenderFirstName, formatSacOutgoingText, formatSacSignatureInvite } from './sac-message-label.mjs';
test('operador: primeiro nome em negrito', () => {
  assert.equal(formatSacOutgoingText('Olá, tudo bem?', 'Rafael Lima'), '*Rafael*\n\nOlá, tudo bem?');
  assert.equal(formatSacOutgoingText('Bem-vindo!', 'Ana Maria'), '*Ana*\n\nBem-vindo!');
});
test('primeiro nome sempre com inicial maiúscula e restante minúsculo', () => {
  assert.equal(formatSacOutgoingText('Mensagem.', 'RAFAEL LIMA'), '*Rafael*\n\nMensagem.');
  assert.equal(sacSenderFirstName('aNA MARIA'), 'Ana');
  assert.equal(sacSenderFirstName('JOSÉ DA SILVA'), 'José');
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

test('convite da assinatura identifica o operador, sem horário e sem aspas problemáticas', () => {
  const message = formatSacSignatureInvite({
    signerName: 'Mariana Souza',
    companyName: 'Artvideo',
    documentName: 'Ordem de Serviço de Entrada de Equipamento',
    link: 'https://unionworld.com.br/assinatura/exemplo',
  }, 'Rafael Lima');
  assert.equal(message, '*Rafael*\n\nOlá, Mariana!\n\nArtvideo enviou o documento Ordem de Serviço de Entrada de Equipamento para sua assinatura eletrônica.\n\nAcesse para revisar e assinar:\nhttps://unionworld.com.br/assinatura/exemplo');
  assert.doesNotMatch(message, /Sistema|[“”]|\d{2}:\d{2}|válido até/);
});
