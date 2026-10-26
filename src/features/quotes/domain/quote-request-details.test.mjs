import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuoteRequestMessage, quoteCustomerReport, quoteRequestAddress } from './quote-request-details.mjs';

const header='Solicitação pelo site — orçamento sem pagamento antecipado.';

test('legacy service booking summary is never shown as customer report',()=>{
 const legacy=[
  header,'Serviço: Higienização Lava E Seca','Opção: Padrão','Quantidade: 1',
  'Preferência de atendimento (a confirmar): 27/10/2026 · 08:00–10:00',
  'Endereço do atendimento: Rua 28, 232, Parque dos Faróis, Nossa Senhora do Socorro, SE, 49160442',
  'Contato desta solicitação: Cliente · (79) 9 8803-7605',
  'Modelo: modelo equipamento',
 ].join('\n');
 assert.equal(quoteCustomerReport({customer_message:legacy,issue_reported:null}),'');
 assert.equal(parseQuoteRequestMessage(legacy).model,'modelo equipamento');
 assert.ok(quoteRequestAddress({customer_message:legacy}));
});

test('legacy freeform note is preserved without repeating customer metadata',()=>{
 const message=[header,'Serviço: Instalação','Quantidade: 1',
  'Endereço do atendimento: Rua Um, 123, Bairro, Cidade, SE, 49000000',
  'Contato desta solicitação: Fulano · (79) 99999-9999',
  'Instalar unidade condensadora na varanda.'].join('\n');
 assert.equal(quoteCustomerReport({customer_message:message}),'Instalar unidade condensadora na varanda.');
});

test('new service booking Relato field is extracted without rest of summary',()=>{
 const message=[header,'Serviço: Instalação','Modalidade: Atendimento no local',
  'Preferência de atendimento: 28/10/2026 · 09:00',
  'Endereço de atendimento: Rua Nova, 45, Aracaju, SE, 49000000',
  'Contato: Cliente · 79999999999','Marca: Samsung','Modelo: ABC-200',
  'Relato: Aparelho faz barulho durante a centrifugação.'].join('\n');
 assert.equal(quoteCustomerReport({customer_message:message,issue_reported:null}),
  'Aparelho faz barulho durante a centrifugação.');
});

test('structured issue_reported takes priority over generated customer summary',()=>{
 assert.equal(quoteCustomerReport({issue_reported:'Não está resfriando.',
  customer_message:[header,'Serviço: Manutenção','Relato: Texto antigo'].join('\n')}),
  'Não está resfriando.');
});

test('repair legacy text shows only the customer description',()=>{
 const message=['Tipo de solicitação: Conserto / manutenção de equipamento',
  'Equipamento: Televisão','Marca: Outra marca','Modelo: L42',
  'Atendimento solicitado: Levar o equipamento à loja',
  'Problema relatado: A tela não acende.'].join('\n');
 assert.equal(quoteCustomerReport({customer_message:message}),'A tela não acende.');
});

test('plain customer message is preserved and metadata-only quote stays empty',()=>{
 assert.equal(quoteCustomerReport({customer_message:'O LED pisca três vezes.'}),'O LED pisca três vezes.');
 assert.equal(quoteCustomerReport({customer_message:[header,'Agendamento: combinar com a equipe.',
  'Taxa de coleta para o CEP 49160000: R$ 20,00'].join('\n')}),'');
});
